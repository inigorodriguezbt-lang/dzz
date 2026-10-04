// Food and drink models: printed cans and tins, bottles (lathe profiles), cartons, jars, snack bags and bars,
// cup noodles, printed boxes, Hawaiian fruit, plate lunches, meat and fish.
// Packaging prints come from pack.js (front / facts / back panels, barcodes, net contents from the def's weight).
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, gradientTex, canvasTex, css, shade, hashStr, facet } from './lib.js';
import { packInfo, wrapTex, panelTex, stripTex, boxAtlas, boxUV, ridged, crown, pillow, tinWall, roundRectPlate, holdUpright } from './pack.js';

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
			return holdUpright( g, h, r );
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
		// short wide tins (tuna) sit flat in the palm like any small thing
		return h > r * 1.6 ? holdUpright( g, h, r ) : g;
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
		return holdUpright( g, h, Math.min( 0.035, d / 2 ), { front: [ 0, 0, 1 ] } );
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
			return g;
		}
		// held round the body below the shoulder, the label to the eye
		return holdUpright( g, H, R, { at: 0.36, view: [ 0.15, - 0.12, - 0.4 ] } );
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
		const { tex, rects } = boxAtlas( spec, info, w, bodyH, d, 'z', { max: 640 } );
		add( g, boxUV( geo, rects ), printed( tex, { rough: 0.62 } ) );
		const roofH = h * 0.14, slope = Math.hypot( d / 2, roofH ), ang = Math.atan2( roofH, d / 2 );
		for ( const sz of [ - 1, 1 ] ) add( g, G.box( w * 0.998, 0.0015, slope ).translate( 0, 0, - slope / 2 ), board, [ 0, bodyH, sz * d / 2 ], [ sz * ang, sz > 0 ? 0 : PI, 0 ] );
		// the gable ends: triangles
		const tri = new THREE.Shape( [ new THREE.Vector2( - d / 2, 0 ), new THREE.Vector2( d / 2, 0 ), new THREE.Vector2( 0, roofH ) ] );
		for ( const sx of [ - 1, 1 ] ) add( g, new THREE.ShapeGeometry( tri ).rotateY( sx * PI / 2 ), M( shade( spec.bg ?? 0xf2f2ee, - 0.08 ), { rough: 0.7, side: THREE.DoubleSide } ), [ sx * w * 0.47, bodyH, 0 ] );
		add( g, G.box( w * 0.99, h * 0.06, 0.004 ), board, [ 0, bodyH + roofH - 0.002, 0 ] );
		add( g, ridged( 0.011, 0.012, 12, 0.06 ), M( s.cap ?? 0x2a6fd6, { rough: 0.4 } ), [ w * 0.12, bodyH + roofH * 0.42, d * 0.22 ], [ ang, 0, 0 ] );
		return holdUpright( g, h, Math.min( 0.04, d / 2 ), { front: [ 0, 0, 1 ], at: 0.4 } );
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
		return h > r * 1.3 ? holdUpright( g, h, r ) : g;
	} );

	// ---- snack bags / rice sacks: { size, label, flat, crimp, matte } ----
	reg( 'bag', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.2, 0.28, 0.07 ], g = group();
		const flat = !! s.flat, spec = s.label || { text: '?' };
		// lying flat: the bag's "height" runs along z, its thickness is y
		const bw = w, bh = flat ? d : h, bd = flat ? h : d;
		const info = packInfo( spec, def );
		const crimp = s.crimp === false ? 0.025 : 0.075;
		const { tex, rects } = boxAtlas( spec, info, bw, bh, bd, 'z', { max: 640, inset: [ 0.07, crimp + 0.015 ] } );
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
		// held upright by its side, the front to the eye
		return holdUpright( g, bh, Math.min( 0.035, bd / 2 ), { front: [ 0, 0, 1 ], at: 0.45 } );
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
			const { tex, rects } = boxAtlas( s.label, info, w, h, d, axis, { max: Math.max( w, h, d ) > 0.15 ? 768 : 512 } );
			add( g, boxUV( geo, rects ), printed( tex, { rough: s.rough ?? 0.7, metal: s.metal ?? 0 } ) );
			// a tall printed box (cereal, crackers) is held up by its side, the front to the eye
			if ( axis === 'z' && h > 0.1 && h > d * 1.3 ) holdUpright( g, h, Math.min( 0.04, d / 2 ), { front: [ 0, 0, 1 ], at: 0.4 } );
		} else add( g, G.rbox( w, h, d, s.round ?? 0.004 ), M( s.color ?? 0x8a8f96, { rough: s.rough ?? 0.7, metal: s.metal ?? 0 } ) );
		return g;
	} );

	// ---- fruit & produce: { kind, cooked } ----
	reg( 'fruit', ( s ) => {
		const g = group(), k = s.kind || 'mango', ck = !! s.cooked;
		const skin = ( key, draw, rough = 0.55, o = {} ) => M( 0xffffff, { map: canvasTex( 'skin:' + key, o.w ?? 128, o.h ?? 128, draw, { repeat: !! o.repeat } ), rough, metal: o.metal ?? 0 } );
		switch ( k ) {
			case 'pineapple': {
				const skinT = canvasTex( 'pineapple-skin3', 256, 256, ( ctx, W, H ) => {
					ctx.fillStyle = '#3e3312'; ctx.fillRect( 0, 0, W, H );
					const nx = 12, ny = 11, dw = W / nx, dh = H / ny;
					for ( let y = - 1; y <= ny; y ++ ) for ( let x = - 1; x <= nx; x ++ ) {
						const cx = ( x + ( y & 1 ) * 0.5 ) * dw, cy = ( y + 0.5 ) * dh;
						const gr = ctx.createRadialGradient( cx, cy - dh * 0.15, 1, cx, cy, dw * 0.55 );
						const green = y < 2 || y > ny - 2;
						gr.addColorStop( 0, green ? '#b8b048' : '#ecbc4a' ); gr.addColorStop( 0.6, green ? '#7a8a2a' : '#c48a2a' ); gr.addColorStop( 1, '#5a6a24' );
						ctx.fillStyle = gr;
						ctx.beginPath(); ctx.moveTo( cx, cy - dh * 0.47 ); ctx.lineTo( cx + dw * 0.46, cy ); ctx.lineTo( cx, cy + dh * 0.47 ); ctx.lineTo( cx - dw * 0.46, cy ); ctx.closePath(); ctx.fill();
						ctx.strokeStyle = 'rgba(40,30,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo( cx - dw * 0.15, cy + dh * 0.1 ); ctx.lineTo( cx, cy + dh * 0.22 ); ctx.lineTo( cx + dw * 0.15, cy + dh * 0.1 ); ctx.stroke();
						ctx.fillStyle = '#2a200a'; ctx.beginPath(); ctx.arc( cx, cy + dh * 0.16, 1.6, 0, PI * 2 ); ctx.fill();
					}
				}, { repeat: true } );
				const inner = group();
				const body = organic( G.sph( 0.062, 18, 14 ).scale( 1, 1.55, 1 ), 0.025, 3 ); body.translate( 0, 0.096, 0 );
				add( inner, body, M( 0xffffff, { map: skinT, rough: 0.72 } ) );
				// the crown: two rings of stiff leaves, bowed outwards
				const leafM = M( 0xffffff, { map: canvasTex( 'pine-leaf', 16, 64, ( ctx, W, H ) => { const gr = ctx.createLinearGradient( 0, H, 0, 0 ); gr.addColorStop( 0, '#5a7a3a' ); gr.addColorStop( 1, '#3a6a3a' ); ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H ); ctx.fillStyle = 'rgba(200,220,190,0.35)'; ctx.fillRect( W / 2 - 1, 0, 2, H ); } ), rough: 0.55, side: THREE.DoubleSide } );
				for ( let i = 0; i < 20; i ++ ) {
					const ring = i < 8 ? 0 : 1, a = i / ( ring ? 12 : 8 ) * PI * 2 + ring * 0.25, len = ring ? 0.07 + ( i % 3 ) * 0.012 : 0.11 + ( i % 4 ) * 0.015;
					add( inner, leaf( len, 0.014, ring ? 0.25 : 0.55 ), leafM, [ Math.cos( a ) * 0.006, 0.182 + ring * 0.008, Math.sin( a ) * 0.006 ], [ 0, - a + PI / 2, ring ? 0.12 : 0.35 ] );
				}
				inner.rotation.z = - PI / 2;
				g.add( inner );
				ground( g );
				break;
			}
			case 'coconut': {
				// a green drinking nut: three soft ridges along it, the dried calyx at the stem
				const geo = G.sph( 0.085, 22, 16 ).scale( 1.18, 0.95, 1 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i ), a = Math.atan2( z, y ), kk = 1 + 0.045 * Math.cos( 3 * a ) * ( 1 - Math.abs( x ) / 0.1 ); p.setXYZ( i, x, y * kk, z * kk ); }
				geo.computeVertexNormals(); geo.translate( 0, 0.08, 0 );
				const tex = ck ? 'coco-ck' : 'coco-green';
				add( g, geo, skin( tex, ( ctx, W, H ) => {
					const gr = ctx.createLinearGradient( 0, 0, W, 0 ); gr.addColorStop( 0, ck ? '#5a3a1a' : '#6a8a2e' ); gr.addColorStop( 0.5, ck ? '#7a5a2a' : '#94a83e' ); gr.addColorStop( 1, ck ? '#4a2a10' : '#7e7a2a' );
					ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
					const r = rng( 3 ); ctx.strokeStyle = ck ? 'rgba(30,15,5,0.2)' : 'rgba(60,70,20,0.12)';
					for ( let i = 0; i < 40; i ++ ) { const x = r() * W; ctx.lineWidth = 0.5 + r(); ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x + ( r() - 0.5 ) * 10, H ); ctx.stroke(); }
					ctx.fillStyle = 'rgba(200,190,90,0.18)'; for ( let i = 0; i < 6; i ++ ) { ctx.beginPath(); ctx.ellipse( r() * W, r() * H, 10 + r() * 20, 6 + r() * 10, 0, 0, PI * 2 ); ctx.fill(); }
				}, 0.6 ) );
				for ( let i = 0; i < 3; i ++ ) add( g, G.sph( 0.02, 8, 6 ).scale( 1, 0.4, 0.7 ), M( 0x6a5a2a, { rough: 0.85 } ), [ - 0.098, 0.08 + Math.cos( i * 2.1 ) * 0.012, Math.sin( i * 2.1 ) * 0.012 ], [ 0, 0, PI / 2 + Math.cos( i * 2.1 ) * 0.5 ] );
				add( g, G.cylX( 0.006, 0.02, 8 ), M( 0x5a4a2a, { rough: 0.9 } ), [ - 0.11, 0.08, 0 ] );
				break;
			}
			case 'coconut_open': {
				// the husked nut split in two: hairy brown shell, a rim of white meat, the hollow inside
				const fiber = skin( 'coco-fiber', ( ctx, W, H ) => {
					ctx.fillStyle = '#5b3c22'; ctx.fillRect( 0, 0, W, H );
					const r = rng( 7 ); for ( let i = 0; i < 500; i ++ ) { ctx.strokeStyle = r() < 0.5 ? 'rgba(20,10,4,0.5)' : 'rgba(170,120,70,0.4)'; ctx.lineWidth = 1; const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + ( r() - 0.5 ) * 8, y + 6 + r() * 10 ); ctx.stroke(); }
				}, 0.95, { repeat: true } );
				const meat = M( 0xf6f3ea, { rough: 0.55 } ), inside = M( 0xf2eee2, { rough: 0.5, side: THREE.BackSide } );
				for ( const [ x, ry, tilt ] of [ [ - 0.052, 0, 0.12 ], [ 0.06, 0.8, - 0.25 ] ] ) {
					const half = group();
					add( half, G.sph( 0.055, 18, 8, 0, PI * 2, PI / 2, PI / 2 ), fiber, [ 0, 0.055, 0 ] );
					add( half, G.sph( 0.046, 16, 7, 0, PI * 2, PI / 2, PI / 2 ), inside, [ 0, 0.055, 0 ] );
					add( half, new THREE.RingGeometry( 0.046, 0.055, 24 ).rotateX( - PI / 2 ), meat, [ 0, 0.0552, 0 ] );
					add( half, new THREE.RingGeometry( 0.05, 0.055, 24 ).rotateX( - PI / 2 ), M( 0x4a2a14, { rough: 0.8 } ), [ 0, 0.0554, 0 ] );
					half.position.x = x; half.rotation.set( tilt, ry, 0 );
					g.add( half );
				}
				ground( g, false );
				break;
			}
			case 'banana': case 'banana_bunch': {
				const n = k === 'banana' ? 1 : 5;
				const peel = M( 0xffffff, { map: canvasTex( 'banana-peel' + ( ck ? '-ck' : '' ), 128, 16, ( ctx, W, H ) => {
					const gr = ctx.createLinearGradient( 0, 0, W, 0 );
					if ( ck ) { gr.addColorStop( 0, '#2a2016' ); gr.addColorStop( 1, '#4a3a20' ); } else { gr.addColorStop( 0, '#6a8a2a' ); gr.addColorStop( 0.12, '#d8c83a' ); gr.addColorStop( 0.5, '#f4d23e' ); gr.addColorStop( 0.9, '#e8c034' ); gr.addColorStop( 1, '#3a2a14' ); }
					ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
					const r = rng( 2 ); ctx.fillStyle = 'rgba(80,50,20,0.55)'; for ( let i = 0; i < ( ck ? 0 : 40 ); i ++ ) ctx.fillRect( 20 + r() * ( W - 30 ), r() * H, 1 + r() * 2, 1 + r() );
					ctx.fillStyle = 'rgba(120,100,30,0.25)'; for ( let y = 0; y < H; y += H / 5 ) ctx.fillRect( 0, y, W, 1 );
				} ), rough: 0.5 } );
				for ( let i = 0; i < n; i ++ ) {
					const off = ( i - ( n - 1 ) / 2 ) * 0.03, lift = Math.abs( i - ( n - 1 ) / 2 ) * 0.008;
					const pts = [ [ - 0.095, 0.05, off * 0.3 ], [ - 0.05, 0.026, off * 0.7 ], [ 0.0, 0.019, off ], [ 0.05, 0.024, off * 1.05 ], [ 0.09, 0.046, off * 1.1 ] ].map( p => [ p[ 0 ], p[ 1 ] + lift, p[ 2 ] ] );
					add( g, taperTube( pts, 0.0165, ( t ) => 0.35 + 0.65 * Math.pow( Math.sin( Math.min( 1, t * 1.15 ) * PI * 0.92 + 0.12 ), 0.7 ), 16, 5 ), peel );
					add( g, G.sph( 0.005, 6, 4 ), M( 0x2a2016, { rough: 0.7 } ), pts[ 4 ] );
				}
				if ( n > 1 ) add( g, G.cylX( 0.012, 0.05, 6 ), M( 0x6b5a2a ), [ - 0.11, 0.055, 0 ] );
				ground( g, false );
				break;
			}
			case 'mango': {
				const geo = organic( G.sph( 0.05, 22, 16 ).scale( 1.38, 0.9, 1.02 ), 0.035, 7 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ); if ( x > 0.03 ) p.setY( i, p.getY( i ) - ( x - 0.03 ) * 0.35 ); }
				geo.computeVertexNormals(); geo.translate( 0, 0.045, 0 );
				add( g, geo, skin( 'mango' + ( ck ? 'ck' : '' ), ( ctx, W, H ) => {
					const gr = ctx.createLinearGradient( 0, 0, 0, H );
					if ( ck ) { gr.addColorStop( 0, '#7a4a20' ); gr.addColorStop( 1, '#4a3010' ); } else { gr.addColorStop( 0, '#c8322a' ); gr.addColorStop( 0.3, '#e8642a' ); gr.addColorStop( 0.55, '#f2a83a' ); gr.addColorStop( 0.8, '#a8b83a' ); gr.addColorStop( 1, '#6a9a32' ); }
					ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
					const r = rng( 5 ); ctx.fillStyle = 'rgba(255,240,200,0.55)'; for ( let i = 0; i < 160; i ++ ) ctx.fillRect( r() * W, r() * H, 1, 1 );
					ctx.fillStyle = 'rgba(80,40,10,0.18)'; for ( let i = 0; i < 6; i ++ ) { ctx.beginPath(); ctx.arc( r() * W, r() * H * 0.6, 2 + r() * 4, 0, PI * 2 ); ctx.fill(); }
				}, 0.42 ) );
				break;
			}
			case 'papaya': {
				const geo = G.lathe( [ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.052, 0.025 ], [ 0.056, 0.055 ], [ 0.05, 0.09 ], [ 0.038, 0.12 ], [ 0.02, 0.14 ], [ 0, 0.146 ] ], 22 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const a = Math.atan2( p.getZ( i ), p.getX( i ) ), kk = 1 + 0.035 * Math.cos( 5 * a ); p.setX( i, p.getX( i ) * kk ); p.setZ( i, p.getZ( i ) * kk ); }
				geo.computeVertexNormals();
				geo.rotateZ( - PI / 2 ); geo.translate( - 0.073, 0.054, 0 );
				add( g, geo, skin( 'papaya' + ( ck ? 'ck' : '' ), ( ctx, W, H ) => {
					ctx.fillStyle = ck ? '#5a3a18' : '#8aa83a'; ctx.fillRect( 0, 0, W, H );
					const r = rng( 9 );
					if ( ! ck ) {
						const gr = ctx.createLinearGradient( 0, 0, 0, H ); gr.addColorStop( 0, 'rgba(240,170,50,0.1)' ); gr.addColorStop( 0.45, 'rgba(240,170,50,0.85)' ); gr.addColorStop( 1, 'rgba(242,176,56,1)' );
						ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
						for ( let i = 0; i < 14; i ++ ) { const x = r() * W; ctx.fillStyle = 'rgba(110,150,50,0.35)'; ctx.beginPath(); ctx.ellipse( x, H * ( 0.1 + r() * 0.5 ), 2 + r() * 4, 10 + r() * 25, 0, 0, PI * 2 ); ctx.fill(); }
					}
					ctx.fillStyle = 'rgba(40,60,20,0.3)'; for ( let i = 0; i < 80; i ++ ) ctx.fillRect( r() * W, r() * H, 1.5, 1.5 );
				}, 0.4 ) );
				break;
			}
			case 'guava': case 'lilikoi': case 'lime': case 'orange': case 'tomato': case 'lychee': case 'mountain_apple': case 'avocado': case 'onion': {
				const P = {
					guava: [ 0.034, 1.05, '#d8de6a', '#9cc24a', 0.6, 'speck' ], lilikoi: [ 0.034, 1.07, '#f2cc3a', '#c49a2a', 0.45, 'speck' ],
					lime: [ 0.028, 1.12, '#86c84a', '#4a9a2a', 0.4, 'dimple' ], orange: [ 0.04, 0.95, '#f29a2a', '#a8a83a', 0.45, 'dimple' ],
					tomato: [ 0.036, 0.8, '#e8402a', '#b82a1a', 0.22, 'gloss' ], lychee: [ 0.018, 1.08, '#d8404a', '#8a2a2a', 0.75, 'bumps' ],
					mountain_apple: [ 0.032, 1.25, '#9a1028', '#e86078', 0.16, 'gloss' ], avocado: [ 0.042, 1.4, '#3a5a22', '#1e3012', 0.7, 'pebble' ],
					onion: [ 0.042, 0.85, '#e8d4a0', '#c8a868', 0.5, 'veins' ],
				}[ k ];
				const [ r, sy, c1, c2, rough, feat ] = P;
				const mat = skin( k + ( ck ? 'ck' : '' ), ( ctx, W, H ) => {
					const gr = ctx.createLinearGradient( 0, 0, 0, H ); gr.addColorStop( 0, ck ? '#5a3a1a' : c1 ); gr.addColorStop( 1, ck ? '#3a2410' : c2 );
					ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
					const rr = rng( hashStr( k ) );
					if ( feat === 'speck' ) { ctx.fillStyle = 'rgba(255,250,220,0.5)'; for ( let i = 0; i < 260; i ++ ) ctx.fillRect( rr() * W, rr() * H, 1, 1 ); ctx.fillStyle = 'rgba(60,70,20,0.25)'; for ( let i = 0; i < 60; i ++ ) ctx.fillRect( rr() * W, rr() * H, 2, 2 ); }
					if ( feat === 'dimple' ) for ( let i = 0; i < 900; i ++ ) { ctx.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc( rr() * W, rr() * H, 0.8 + rr(), 0, PI * 2 ); ctx.fill(); }
					if ( feat === 'bumps' ) { for ( let y = 0; y < H; y += 6 ) for ( let x = ( y / 6 % 2 ) * 3; x < W; x += 6 ) { ctx.fillStyle = 'rgba(60,10,10,0.5)'; ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + 3, y + 3 ); ctx.lineTo( x, y + 6 ); ctx.lineTo( x - 3, y + 3 ); ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255,200,180,0.35)'; ctx.fillRect( x - 0.5, y + 2, 1.5, 1.5 ); } }
					if ( feat === 'pebble' ) for ( let i = 0; i < 1600; i ++ ) { ctx.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(120,150,80,0.16)'; ctx.beginPath(); ctx.arc( rr() * W, rr() * H, 0.6 + rr() * 0.8, 0, PI * 2 ); ctx.fill(); }
					if ( feat === 'veins' ) { ctx.strokeStyle = 'rgba(150,110,60,0.22)'; ctx.lineWidth = 1; for ( let x = 0; x < W; x += 6 + rr() * 6 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x + ( rr() - 0.5 ) * 4, H ); ctx.stroke(); } ctx.fillStyle = 'rgba(180,120,60,0.25)'; for ( let i = 0; i < 5; i ++ ) { ctx.beginPath(); ctx.ellipse( rr() * W, rr() * H, 8 + rr() * 12, 5, 0, 0, PI * 2 ); ctx.fill(); } }
					if ( feat === 'gloss' && k === 'mountain_apple' ) { ctx.fillStyle = 'rgba(255,230,235,0.08)'; for ( let i = 0; i < 40; i ++ ) ctx.fillRect( rr() * W, H * ( 0.4 + rr() * 0.6 ), 1, 6 + rr() * 10 ); }
				}, rough );
				const shapeOf = ( sc, seed ) => {
					let geo;
					if ( k === 'mountain_apple' ) geo = G.lathe( [ [ 0, 0 ], [ r * 0.6, 0.002 ], [ r * 0.95, r * 0.15 ], [ r * 1.02, r * 0.5 ], [ r * 0.98, r * 0.9 ], [ r * 0.85, r * 1.3 ], [ r * 0.62, r * 1.65 ], [ r * 0.35, r * 1.9 ], [ r * 0.08, r * 2.02 ], [ 0, r * 2.05 ] ].map( ( [ a, b ] ) => [ a * sc, b * sc ] ), 26 );
					else if ( k === 'avocado' ) geo = G.lathe( [ [ 0, 0 ], [ r * 0.7, 0.003 ], [ r, r * 0.55 ], [ r * 0.95, r * 1.2 ], [ r * 0.6, r * 1.9 ], [ r * 0.25, r * 2.2 ], [ 0, r * 2.25 ] ].map( ( [ a, b ] ) => [ a * sc, b * sc ] ), 20 );
					else if ( k === 'onion' ) geo = G.lathe( [ [ 0, 0 ], [ r * 0.45, r * 0.06 ], [ r * 0.92, r * 0.42 ], [ r * 1.02, r * 0.8 ], [ r * 0.8, r * 1.15 ], [ r * 0.3, r * 1.35 ], [ r * 0.1, r * 1.45 ], [ 0, r * 1.48 ] ].map( ( [ a, b ] ) => [ a * sc, b * sc ] ), 22 );
					else { geo = G.sph( r * sc, k === 'lychee' ? 12 : 20, k === 'lychee' ? 9 : 14 ).scale( 1, sy, 1 ); geo.translate( 0, r * sy * sc, 0 ); }
					if ( k === 'tomato' ) { const p = geo.attributes.position; for ( let i = 0; i < p.count; i ++ ) { const a = Math.atan2( p.getZ( i ), p.getX( i ) ), yy = p.getY( i ) / ( 2 * r * sy * sc ), kk = 1 + 0.05 * Math.cos( 6 * a ) * yy; p.setX( i, p.getX( i ) * kk ); p.setZ( i, p.getZ( i ) * kk ); } geo.computeVertexNormals(); }
					return organic( geo, k === 'lychee' ? 0.06 : k === 'lilikoi' ? 0.04 : 0.025, seed, k === 'lychee' ? 9 : 3 );
				};
				const one = ( x, z, sc = 1, seed = 1, tilt = 0 ) => add( g, shapeOf( sc, seed ), mat, [ x, 0, z ], [ tilt, seed, 0 ] );
				if ( k === 'lychee' ) {
					one( 0, 0, 1, 1 ); one( 0.032, 0.01, 0.95, 2 ); one( 0.012, 0.032, 1.05, 3 ); one( - 0.022, 0.024, 0.9, 4 );
					add( g, G.tube( [ [ 0.0, 0.034, 0.0 ], [ 0.01, 0.05, 0.015 ], [ - 0.01, 0.055, 0.03 ], [ - 0.03, 0.06, 0.05 ] ], 0.0018, 10, 4 ), M( 0x5a4a2a, { rough: 0.9 } ) );
				} else one( 0, 0 );
				const top = ( k === 'mountain_apple' ? r * 2.05 : k === 'avocado' ? r * 2.25 : k === 'onion' ? r * 1.48 : r * sy * 2 );
				if ( k === 'tomato' ) {
					const sep = M( 0x3a7a2a, { rough: 0.6, side: THREE.DoubleSide } );
					for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, leaf( 0.02, 0.006, 0.3 ), sep, [ 0, top - 0.002, 0 ], [ 0, - a, PI / 2 - 0.25 ] ); }
					add( g, G.cyl( 0.0015, 0.002, 0.01, 5 ), M( 0x4a6a2a ), [ 0, top - 0.002, 0 ] );
				}
				if ( k === 'onion' ) { add( g, G.cyl( 0.002, 0.006, 0.012, 6 ), M( 0xb89858, { rough: 0.8 } ), [ 0, top - 0.004, 0 ] ); for ( let i = 0; i < 7; i ++ ) add( g, G.cyl( 0.0006, 0.0006, 0.012, 3 ), M( 0xd8c8a0 ), [ Math.cos( i ) * 0.004, - 0.002, Math.sin( i ) * 0.004 ], [ Math.cos( i ) * 0.6, 0, Math.sin( i ) * 0.6 ] ); }
				if ( k === 'mountain_apple' ) for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2; add( g, G.box( 0.005, 0.004, 0.006 ), M( 0x8a2030, { rough: 0.6 } ), [ Math.cos( a ) * 0.008, 0.001, Math.sin( a ) * 0.008 ] ); }
				if ( k === 'guava' ) for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, G.box( 0.004, 0.003, 0.002 ), M( 0x4a3a1a ), [ Math.cos( a ) * 0.005, 0.0005, Math.sin( a ) * 0.005 ], [ 0, - a, 0 ] ); }
				if ( [ 'avocado', 'mountain_apple', 'guava', 'lilikoi', 'orange', 'lime' ].includes( k ) ) add( g, G.cyl( 0.0025, 0.0035, 0.008, 6 ), M( 0x4a3a1a, { rough: 0.8 } ), [ 0, top - 0.002, 0 ] );
				if ( k === 'orange' || k === 'lime' ) add( g, new THREE.CircleGeometry( 0.006, 10 ).rotateX( - PI / 2 ), M( 0x6a8a3a ), [ 0, top + 0.0004, 0 ] );
				ground( g, false );
				break;
			}
			case 'breadfruit': {
				if ( ck ) {
					// roasted in the fire: the skin charred black and cracked, pale flesh showing in the splits
					const geo = organic( G.sph( 0.08, 20, 14 ).scale( 1.1, 0.92, 1 ), 0.04, 11 ); geo.translate( 0, 0.074, 0 );
					add( g, geo, skin( 'ulu-roast', ( ctx, W, H ) => {
						ctx.fillStyle = '#1e1a16'; ctx.fillRect( 0, 0, W, H );
						const r = rng( 4 ); for ( let i = 0; i < 200; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(80,60,40,0.5)' : 'rgba(0,0,0,0.5)'; ctx.fillRect( r() * W, r() * H, 2 + r() * 4, 2 + r() * 4 ); }
						ctx.strokeStyle = 'rgba(232,216,168,0.85)'; ctx.lineCap = 'round'; for ( let i = 0; i < 14; i ++ ) { ctx.lineWidth = 0.8 + r() * 1.6; ctx.beginPath(); let x = r() * W, y = r() * H; ctx.moveTo( x, y ); for ( let k2 = 0; k2 < 3; k2 ++ ) { x += ( r() - 0.5 ) * 18; y += ( r() - 0.5 ) * 18; ctx.lineTo( x, y ); } ctx.stroke(); }
					}, 0.95 ) );
					break;
				}
				const geo = organic( G.sph( 0.08, 22, 16 ).scale( 1.1, 0.95, 1 ), 0.02, 13 ); geo.translate( 0, 0.076, 0 );
				add( g, geo, skin( 'breadfruit2', ( ctx, W, H ) => {
					ctx.fillStyle = '#6a9a34'; ctx.fillRect( 0, 0, W, H );
					const s2 = 10;
					for ( let y = 0; y < 14; y ++ ) for ( let x = 0; x < 14; x ++ ) {
						const cx = ( x + ( y % 2 ) * 0.5 ) * W / 13, cy = ( y + 0.5 ) * H / 13;
						const gr = ctx.createRadialGradient( cx - 1, cy - 1, 0, cx, cy, s2 ); gr.addColorStop( 0, '#a8c45a' ); gr.addColorStop( 0.7, '#7aa83e' ); gr.addColorStop( 1, '#4a7a24' );
						ctx.fillStyle = gr; ctx.beginPath(); for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2 + PI / 6; ctx.lineTo( cx + Math.cos( a ) * s2 * 0.9, cy + Math.sin( a ) * s2 * 0.9 ); } ctx.fill();
						ctx.fillStyle = '#4a5a24'; ctx.fillRect( cx - 0.5, cy - 0.5, 1.5, 1.5 );
					}
				}, 0.65, { repeat: true } ) );
				add( g, G.cyl( 0.005, 0.007, 0.02, 8 ), M( 0x5a4a2a, { rough: 0.85 } ), [ 0, 0.15, 0 ] );
				break;
			}
			case 'taro': case 'sweet_potato': {
				const taro = k === 'taro';
				if ( taro && ck ) {
					// steamed and peeled: the lavender-grey flesh, cut in chunks
					const flesh = skin( 'taro-steamed', ( ctx, W, H ) => { ctx.fillStyle = '#a898b0'; ctx.fillRect( 0, 0, W, H ); const r = rng( 8 ); for ( let i = 0; i < 400; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(90,60,110,0.5)' : 'rgba(230,220,235,0.35)'; ctx.fillRect( r() * W, r() * H, 1 + r() * 2, 1 ); } }, 0.6 );
					for ( const [ x, z, a, sc ] of [ [ - 0.03, 0, 0.3, 1 ], [ 0.03, 0.01, 1.2, 0.9 ], [ 0, - 0.035, 2.1, 0.8 ] ] ) add( g, organic( G.rbox( 0.045 * sc, 0.035 * sc, 0.04 * sc, 0.008, 2 ), 0.05, a * 10 ), flesh, [ x, 0, z ], [ 0, a, 0 ] );
					ground( g, false );
					break;
				}
				const geo = taro ? G.lathe( [ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.046, 0.035 ], [ 0.044, 0.08 ], [ 0.03, 0.11 ], [ 0.016, 0.125 ], [ 0.012, 0.13 ] ], 18 )
					: G.lathe( [ [ 0, 0 ], [ 0.016, 0.008 ], [ 0.034, 0.045 ], [ 0.035, 0.1 ], [ 0.02, 0.145 ], [ 0.006, 0.165 ], [ 0, 0.17 ] ], 18 );
				organic( geo, 0.07, taro ? 21 : 22, 2 );
				geo.rotateZ( - PI / 2 ); geo.translate( taro ? - 0.065 : - 0.085, taro ? 0.045 : 0.035, 0 );
				const tex = taro
					? ( ( ctx, W, H ) => { ctx.fillStyle = '#6a4a36'; ctx.fillRect( 0, 0, W, H ); const r = rng( 6 ); for ( let y = 0; y < H; y += 12 + r() * 6 ) { ctx.fillStyle = 'rgba(40,25,15,0.7)'; ctx.fillRect( 0, y, W, 3 ); ctx.strokeStyle = 'rgba(150,110,80,0.5)'; for ( let x = 0; x < W; x += 3 ) { ctx.beginPath(); ctx.moveTo( x, y + 3 ); ctx.lineTo( x + 1, y + 9 ); ctx.stroke(); } } } )
					: ( ( ctx, W, H ) => { ctx.fillStyle = ck ? '#4a2418' : '#8a3a4a'; ctx.fillRect( 0, 0, W, H ); const r = rng( 7 ); for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(40,10,20,0.4)' : 'rgba(200,120,140,0.25)'; ctx.fillRect( r() * W, r() * H, 1 + r() * 3, 1 ); } ctx.fillStyle = 'rgba(30,10,10,0.7)'; for ( let i = 0; i < 12; i ++ ) { ctx.beginPath(); ctx.ellipse( r() * W, r() * H, 2, 1, 0, 0, PI * 2 ); ctx.fill(); } } );
				add( g, geo, skin( k + ( ck ? 'ck' : '' ) + '2', tex, 0.9 ) );
				if ( taro ) add( g, G.cylX( 0.012, 0.025, 8, 0.008 ), M( 0x8a6a5a, { rough: 0.8 } ), [ 0.075, 0.045, 0 ] );
				if ( ! taro && ck ) {
					// baked: split along the top, the purple Okinawan flesh showing
					add( g, G.sph( 0.03, 14, 8 ).scale( 2.2, 0.3, 0.6 ), M( 0x7a3a9a, { rough: 0.7 } ), [ 0.0, 0.066, 0 ] );
				}
				break;
			}
			case 'egg': {
				const boiled = s.color != null;
				const eggGeo = G.lathe( [ [ 0, 0 ], [ 0.012, 0.002 ], [ 0.02, 0.012 ], [ 0.021, 0.024 ], [ 0.017, 0.042 ], [ 0.01, 0.052 ], [ 0, 0.056 ] ], 18 );
				eggGeo.rotateZ( - PI / 2 ); eggGeo.translate( - 0.028, 0.021, 0 );
				if ( boiled ) {
					// one peeled egg, one halved with its yolk
					const white = M( s.color ?? 0xf2eee2, { rough: 0.25 } );
					add( g, eggGeo, white, [ - 0.02, 0, - 0.02 ], [ 0, 0.4, 0 ] );
					const half = G.sph( 0.021, 16, 8, 0, PI * 2, 0, PI / 2 ).scale( 1.3, 1, 1 );
					add( g, half.rotateX( PI ), white, [ 0.03, 0.021, 0.02 ] );
					add( g, new THREE.CircleGeometry( 0.021, 18 ).scale( 1.3, 1, 1 ).rotateX( - PI / 2 ), white, [ 0.03, 0.021, 0.02 ] );
					add( g, G.sph( 0.011, 12, 6, 0, PI * 2, 0, PI / 2 ).scale( 1.2, 0.35, 1 ), M( 0xf2b22a, { rough: 0.6 } ), [ 0.03, 0.021, 0.02 ] );
					ground( g, false );
				} else {
					// three brown eggs, a little speckled
					const shell = skin( 'egg-brown2', ( ctx, W, H ) => { const gr = ctx.createLinearGradient( 0, 0, W, 0 ); gr.addColorStop( 0, '#c88a5a' ); gr.addColorStop( 1, '#b87648' ); ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H ); const r = rng( 3 ); for ( let i = 0; i < 90; i ++ ) { ctx.fillStyle = 'rgba(110,60,25,0.22)'; ctx.fillRect( r() * W, r() * H, 1, 1 ); } }, 0.45 );
					for ( const [ x, z, a ] of [ [ 0, 0, 0.2 ], [ 0.03, 0.03, 1.4 ], [ - 0.028, 0.034, 2.4 ] ] ) add( g, eggGeo, shell, [ x, 0, z ], [ 0, a, 0 ] );
					ground( g, false );
				}
				break;
			}
			default: {
				const geo = organic( G.sph( 0.04, 16, 12 ), 0.04, 5 ); geo.translate( 0, 0.04, 0 );
				add( g, geo, M( ck ? shade( s.color ?? 0x88aa44, - 0.45 ) : s.color ?? 0x88aa44, { rough: 0.5 } ) );
			}
		}
		if ( s.stem !== false && [ 'mango', 'papaya' ].includes( k ) ) {
			g.updateMatrixWorld( true );
			const bb = new THREE.Box3().setFromObject( g );
			add( g, G.cyl( 0.003, 0.004, 0.012, 5 ), M( 0x4a3a1a ), k === 'papaya' ? [ bb.max.x - 0.003, bb.getCenter( new THREE.Vector3() ).y, 0 ] : [ - 0.05, bb.max.y - 0.006, 0 ], k === 'papaya' ? [ 0, 0, - PI / 2 ] : [ 0, 0, 0.5 ] );
		}
		return g;
	} );

	// ---- prepared dishes: { kind, sticker, fill, bowl } ----
	const foodTex = ( key, draw, rep = 1 ) => { const t = canvasTex( 'dish:' + key, 128, 128, draw, { repeat: true } ); if ( rep === 1 ) return t; const c = t.clone(); c.repeat.set( rep, rep ); c.needsUpdate = true; return c; };
	const riceTex = () => foodTex( 'rice', ( ctx, W ) => { ctx.fillStyle = '#f2efe6'; ctx.fillRect( 0, 0, W, W ); const r = rng( 1 ); for ( let i = 0; i < 260; i ++ ) { const x = r() * W, y = r() * W, a = r() * PI; ctx.fillStyle = r() < 0.5 ? 'rgba(200,195,180,0.7)' : 'rgba(255,255,255,0.9)'; ctx.save(); ctx.translate( x, y ); ctx.rotate( a ); ctx.beginPath(); ctx.ellipse( 0, 0, 3.2, 1.4, 0, 0, PI * 2 ); ctx.fill(); ctx.restore(); } }, 2 );
	const rice = () => M( 0xffffff, { map: riceTex(), rough: 0.85 } );
	const mound = ( r, h, seg = 14 ) => organic( G.dome( r, seg, 7 ).scale( 1, h / r, 1 ), 0.06, r * 1000 );
	// a foam clamshell, open: the tray with its raised rim, the lid stood up behind
	function clamshell( g, sticker ) {
		const foam = M( 0xf4f4f0, { rough: 0.92 } );
		add( g, G.rbox( 0.23, 0.032, 0.2, 0.012, 2 ), foam );
		for ( const z of [ - 1, 1 ] ) add( g, G.rbox( 0.23, 0.01, 0.012, 0.004 ), foam, [ 0, 0.03, z * 0.094 ] );
		for ( const x of [ - 1, 1 ] ) add( g, G.rbox( 0.012, 0.01, 0.2, 0.004 ), foam, [ x * 0.109, 0.03, 0 ] );
		const lid = group();
		add( lid, G.rbox( 0.23, 0.03, 0.2, 0.012, 2 ).translate( 0, 0, - 0.1 ), foam );
		if ( sticker ) add( lid, G.cyl( 0.03, 0.03, 0.001, 20 ), M( 0xffffff, { map: labelTex( { bg: 0xf5c542, fg: 0x7a2a10, text: sticker, sub: 'Mahalo!', style: 'plain', size: 0.3 } ), rough: 0.6 } ), [ 0.04, 0.0305, - 0.12 ] );
		// hinged at the back edge, laid well back so the food shows
		lid.position.set( 0, 0.032, - 0.1 ); lid.rotation.x = 0.42;
		g.add( lid );
	}
	reg( 'dish', ( s ) => {
		const g = group();
		switch ( s.kind ) {
			case 'musubi': {
				// rice block, a seared slice of luncheon meat, the nori band, in its plastic wrap
				add( g, G.rbox( 0.095, 0.03, 0.05, 0.005, 2 ), rice() );
				const spam = M( 0xffffff, { map: foodTex( 'spam-slice', ( ctx, W ) => { ctx.fillStyle = '#d88a7a'; ctx.fillRect( 0, 0, W, W ); ctx.fillStyle = 'rgba(120,50,30,0.6)'; for ( let i = 0; i < 4; i ++ ) ctx.fillRect( 10 + i * 30, 0, 8, W ); const r = rng( 2 ); ctx.fillStyle = 'rgba(255,220,210,0.4)'; for ( let i = 0; i < 80; i ++ ) ctx.fillRect( r() * W, r() * W, 2, 2 ); } ), rough: 0.45 } );
				add( g, G.rbox( 0.093, 0.012, 0.048, 0.003, 1 ), spam, [ 0, 0.03, 0 ] );
				add( g, G.rbox( 0.095, 0.018, 0.05, 0.005, 2 ), rice(), [ 0, 0.042, 0 ] );
				add( g, G.box( 0.032, 0.0625, 0.0525 ), M( 0x1c2a1a, { rough: 0.55 } ), [ 0, - 0.0005, 0 ] );
				add( g, G.rbox( 0.104, 0.064, 0.058, 0.008 ), MAT.glass( 0xffffff, 0.16 ) );
				break;
			}
			case 'plate': case 'loco_moco': {
				clamshell( g, s.kind === 'plate' ? s.sticker : null );
				const top = 0.032;
				// two scoops rice, a scoop of mac salad
				for ( const z of [ - 0.04, 0.04 ] ) add( g, mound( 0.046, 0.042 ), rice(), [ - 0.052, top, z ] );
				const mac = M( 0xffffff, { map: foodTex( 'mac-salad', ( ctx, W ) => { ctx.fillStyle = '#f2ead0'; ctx.fillRect( 0, 0, W, W ); const r = rng( 3 ); for ( let i = 0; i < 70; i ++ ) { ctx.strokeStyle = '#e8c87a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc( r() * W, r() * W, 5, r() * PI, r() * PI + 2.4 ); ctx.stroke(); } ctx.fillStyle = '#e88a3a'; for ( let i = 0; i < 12; i ++ ) ctx.fillRect( r() * W, r() * W, 3, 2 ); } ), rough: 0.55 } );
				if ( s.kind === 'plate' ) {
					add( g, mound( 0.042, 0.036 ), mac, [ 0.058, top, 0.048 ] );
					// kalua pig: a heap of smoky shreds
					const pig = M( 0xffffff, { map: foodTex( 'kalua', ( ctx, W ) => { ctx.fillStyle = '#b07a5a'; ctx.fillRect( 0, 0, W, W ); const r = rng( 4 ); for ( let i = 0; i < 160; i ++ ) { ctx.strokeStyle = r() < 0.5 ? '#7a4a30' : '#d8a888'; ctx.lineWidth = 1.5 + r() * 2; const x = r() * W, y = r() * W; ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + ( r() - 0.5 ) * 30, y + ( r() - 0.5 ) * 8 ); ctx.stroke(); } } ), rough: 0.6 } );
					add( g, organic( G.dome( 0.055, 16, 7 ).scale( 1.1, 0.62, 0.85 ), 0.12, 5, 5 ), pig, [ 0.045, top, - 0.032 ] );
					add( g, G.sph( 0.006, 6, 4 ).scale( 3, 0.6, 0.8 ), M( 0x5aa83a, { rough: 0.6 } ), [ 0.02, top + 0.026, - 0.01 ] );
				} else {
					// loco moco: the patty on rice, the fried egg, brown gravy over it
					add( g, mound( 0.06, 0.03 ), rice(), [ 0.04, top, 0.0 ] );
					add( g, organic( G.cyl( 0.042, 0.045, 0.02, 18 ), 0.04, 3 ), M( 0x4a2a16, { rough: 0.8 } ), [ 0.04, top + 0.022, 0 ] );
					add( g, organic( G.cyl( 0.05, 0.05, 0.004, 20 ).scale( 1.1, 1, 0.9 ), 0.08, 9 ), M( 0x6a3a1a, { rough: 0.25 } ), [ 0.045, top + 0.04, 0.002 ] );
					add( g, organic( G.cyl( 0.036, 0.036, 0.004, 18 ), 0.1, 4 ), M( 0xfaf8f0, { rough: 0.4 } ), [ 0.03, top + 0.044, - 0.008 ] );
					add( g, G.dome( 0.014, 12, 6 ).scale( 1, 0.7, 1 ), M( 0xf5b52a, { rough: 0.2 } ), [ 0.03, top + 0.048, - 0.008 ] );
					add( g, mound( 0.035, 0.026 ), mac, [ - 0.05, top, 0.05 ] );
				}
				break;
			}
			case 'bowl': {
				// poke: a dark bowl of glossy ahi cubes over rice, limu, green onion and sesame
				const bowl = M( s.bowl ?? 0x222222, { rough: 0.3 } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.04, 0 ], [ 0.045, 0.006 ], [ 0.07, 0.04 ], [ 0.076, 0.05 ], [ 0.073, 0.051 ], [ 0.066, 0.042 ], [ 0.04, 0.012 ], [ 0, 0.012 ] ], 28 ), bowl );
				add( g, G.cyl( 0.064, 0.064, 0.002, 24 ), rice(), [ 0, 0.036, 0 ] );
				const ahi = M( 0xffffff, { map: foodTex( 'ahi-cube:' + ( s.fill ?? 0xc0283a ), ( ctx, W ) => { ctx.fillStyle = css( s.fill ?? 0xc0283a ); ctx.fillRect( 0, 0, W, W ); ctx.strokeStyle = 'rgba(255,200,200,0.35)'; ctx.lineWidth = 2; for ( let i = 0; i < 8; i ++ ) { ctx.beginPath(); ctx.moveTo( 0, i * 18 ); ctx.quadraticCurveTo( W / 2, i * 18 + 20, W, i * 18 ); ctx.stroke(); } } ), rough: 0.2 } );
				const r = rng( 6 );
				for ( let i = 0; i < 16; i ++ ) { const a = i * 2.39, rr = 0.008 + ( i % 5 ) * 0.011; add( g, G.rbox( 0.017, 0.015, 0.017, 0.003, 1 ), ahi, [ Math.cos( a ) * rr, 0.036 + ( i % 3 ) * 0.005, Math.sin( a ) * rr ], [ r() * 3, r() * 3, r() * 3 ] ); }
				const limu = M( 0x3a5a2a, { rough: 0.4 } );
				for ( let i = 0; i < 8; i ++ ) add( g, G.box( 0.012, 0.002, 0.004 ), limu, [ Math.cos( i * 0.8 ) * 0.045, 0.048, Math.sin( i * 0.8 ) * 0.045 ], [ 0.3, i, 0.2 ] );
				for ( let i = 0; i < 10; i ++ ) add( g, new THREE.TorusGeometry( 0.0026, 0.001, 3, 8 ), M( 0x6ab83a, { rough: 0.5 } ), [ Math.cos( i * 1.9 ) * 0.03, 0.058, Math.sin( i * 1.3 ) * 0.03 ], [ PI / 2, 0, 0 ] );
				for ( let i = 0; i < 18; i ++ ) add( g, G.box( 0.0018, 0.0008, 0.001 ), MAT.white(), [ Math.cos( i * 2.7 ) * 0.035, 0.06, Math.sin( i * 2.1 ) * 0.035 ], [ 0, i, 0 ] );
				break;
			}
			case 'noodle_bowl': {
				// saimin: the rimmed bowl, amber broth, the noodles under it, kamaboko, char siu, green onion
				const bowlT = foodTex( 'saimin-bowl', ( ctx, W ) => { ctx.fillStyle = '#f2efe6'; ctx.fillRect( 0, 0, W, W ); ctx.strokeStyle = '#2a4a8a'; ctx.lineWidth = 3; for ( let x = 0; x < W; x += 16 ) { ctx.beginPath(); ctx.moveTo( x, 8 ); ctx.lineTo( x + 8, 2 ); ctx.lineTo( x + 16, 8 ); ctx.stroke(); } ctx.fillStyle = '#2a4a8a'; ctx.fillRect( 0, 12, W, 2 ); } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.045, 0 ], [ 0.05, 0.008 ], [ 0.085, 0.062 ], [ 0.088, 0.066 ], [ 0.083, 0.066 ], [ 0.05, 0.014 ], [ 0, 0.014 ] ], 30 ), M( 0xffffff, { map: bowlT, rough: 0.25 } ) );
				const noodles = M( 0xffffff, { map: foodTex( 'noodles', ( ctx, W ) => { ctx.fillStyle = '#d8b878'; ctx.fillRect( 0, 0, W, W ); ctx.strokeStyle = '#f2dc9a'; ctx.lineWidth = 2.5; for ( let y = 0; y < W; y += 5 ) { ctx.beginPath(); for ( let x = 0; x <= W; x += 4 ) ctx.lineTo( x, y + Math.sin( x * 0.4 + y ) * 2.5 ); ctx.stroke(); } } ), rough: 0.4 } );
				add( g, G.cyl( 0.074, 0.074, 0.002, 26 ), noodles, [ 0, 0.046, 0 ] );
				add( g, G.cyl( 0.0775, 0.0775, 0.002, 26 ), M( 0xd8a050, { rough: 0.05, transparent: true, opacity: 0.55 } ), [ 0, 0.051, 0 ] );
				const kama = M( 0xffffff, { map: foodTex( 'kamaboko', ( ctx, W ) => { ctx.fillStyle = '#f6f2ee'; ctx.fillRect( 0, 0, W, W ); ctx.strokeStyle = '#e86a8a'; ctx.lineWidth = 6; ctx.beginPath(); for ( let a = 0; a < PI * 6; a += 0.2 ) { const rr = a * 3.2; ctx.lineTo( W / 2 + Math.cos( a ) * rr, W / 2 + Math.sin( a ) * rr ); } ctx.stroke(); } ), rough: 0.4 } );
				for ( const [ x, z ] of [ [ 0.02, 0.015 ], [ 0.034, - 0.005 ] ] ) add( g, G.cyl( 0.014, 0.014, 0.004, 16 ), kama, [ x, 0.052, z ], [ 0.15, 0, 0.1 ] );
				for ( const [ x, z ] of [ [ - 0.03, - 0.02 ], [ - 0.018, 0.028 ] ] ) { add( g, G.rbox( 0.03, 0.004, 0.02, 0.0015, 1 ), M( 0xd8a080, { rough: 0.5 } ), [ x, 0.051, z ], [ 0, 0.4, 0.05 ] ); add( g, G.box( 0.03, 0.0042, 0.003 ), M( 0xb02a2a, { rough: 0.5 } ), [ x, 0.051, z + 0.009 ], [ 0, 0.4, 0.05 ] ); }
				for ( let i = 0; i < 9; i ++ ) add( g, new THREE.TorusGeometry( 0.0025, 0.0009, 3, 8 ), M( 0x6ab83a, { rough: 0.5 } ), [ Math.cos( i * 1.7 ) * 0.025, 0.054, Math.sin( i * 2.2 ) * 0.025 ], [ PI / 2, 0, 0 ] );
				break;
			}
			case 'malasada': {
				// a sugar-rolled malasada on its square of wax paper, a second behind
				const tex = foodTex( 'sugar2', ( ctx, W ) => { const gr = ctx.createLinearGradient( 0, 0, 0, W ); gr.addColorStop( 0, '#d89a4a' ); gr.addColorStop( 1, '#c07a2a' ); ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, W ); ctx.fillStyle = '#fff8ee'; const r = rng( 8 ); for ( let i = 0; i < 900; i ++ ) ctx.fillRect( r() * W, r() * W, 1.5, 1.5 ); } );
				add( g, G.box( 0.13, 0.0008, 0.12 ), M( 0xf2ecd8, { rough: 0.5, side: THREE.DoubleSide } ), [ 0, 0, 0 ], [ 0, 0.3, 0 ] );
				for ( const [ x, z, sc ] of [ [ - 0.012, 0.01, 1 ], [ 0.035, - 0.03, 0.9 ] ] ) { const geo = organic( G.sph( 0.045 * sc, 18, 12 ).scale( 1, 0.68, 1 ), 0.04, x * 100 ); geo.translate( 0, 0.031 * sc, 0 ); add( g, geo, M( 0xffffff, { map: tex, rough: 0.9 } ), [ x, 0.001, z ] ); }
				break;
			}
			case 'bread': {
				// Hawaiian sweet bread: the glossy domed loaf in its foil pan, under cling wrap
				add( g, G.lathe( [ [ 0, 0 ], [ 0.098, 0 ], [ 0.11, 0.03 ], [ 0.113, 0.032 ], [ 0.108, 0.032 ], [ 0.096, 0.004 ], [ 0, 0.004 ] ], 28 ), M( 0xcfcfd4, { rough: 0.32, metal: 0.9 } ) );
				const top = organic( G.sph( 0.1, 26, 10, 0, PI * 2, 0, PI / 2 ).scale( 1, 0.55, 1 ), 0.02, 3 );
				add( g, top, M( 0xffffff, { map: gradientTex( [ [ 0, 0x8a4a1a ], [ 0.45, 0xb8682a ], [ 0.85, 0xd89a52 ], [ 1, 0xecc488 ] ], 40, '#6a3a12', 21 ), rough: 0.35 } ), [ 0, 0.028, 0 ] );
				add( g, G.cyl( 0.112, 0.112, 0.085, 24, true ), MAT.glass( 0xffffff, 0.1 ) );
				break;
			}
			case 'manapua': {
				// two steamed buns on their paper squares, the red char siu dot on top
				for ( const [ x, z ] of [ [ - 0.03, 0 ], [ 0.035, 0.02 ] ] ) {
					add( g, G.box( 0.07, 0.0008, 0.07 ), M( 0xf0e6c8, { rough: 1 } ), [ x, 0, z ], [ 0, x * 8, 0 ] );
					const geo = organic( G.sph( 0.042, 20, 12 ).scale( 1, 0.78, 1 ), 0.03, x * 99 ); geo.translate( 0, 0.033, 0 );
					add( g, geo, M( 0xf8f4ea, { rough: 0.75 } ), [ x, 0.0008, z ] );
					add( g, G.cyl( 0.0055, 0.0055, 0.001, 10 ), M( 0xd02a2a ), [ x, 0.0655, z ] );
				}
				break;
			}
			case 'mochi': {
				// butter mochi: golden squares, crisp on top and at the edges, in a foil tray
				add( g, G.rbox( 0.17, 0.022, 0.13, 0.004, 1 ), M( 0xcfcfd4, { rough: 0.3, metal: 0.9 } ) );
				const top = M( 0xffffff, { map: foodTex( 'butter-mochi', ( ctx, W ) => { const gr = ctx.createRadialGradient( W / 2, W / 2, 10, W / 2, W / 2, W * 0.7 ); gr.addColorStop( 0, '#e8b860' ); gr.addColorStop( 1, '#a8682a' ); ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, W ); const r = rng( 3 ); ctx.fillStyle = 'rgba(120,60,20,0.3)'; for ( let i = 0; i < 90; i ++ ) { ctx.beginPath(); ctx.arc( r() * W, r() * W, 1 + r() * 3, 0, PI * 2 ); ctx.fill(); } } ), rough: 0.5 } );
				for ( let i = 0; i < 6; i ++ ) add( g, G.rbox( 0.048, 0.03, 0.054, 0.004, 1 ), top, [ - 0.052 + ( i % 3 ) * 0.052, 0.006, - 0.028 + Math.floor( i / 3 ) * 0.056 ] );
				break;
			}
			case 'rice': {
				// a bowl of white rice, a sprinkle of furikake
				const bowlT = foodTex( 'rice-bowl', ( ctx, W ) => { ctx.fillStyle = '#2a4a8a'; ctx.fillRect( 0, 0, W, W ); ctx.fillStyle = '#e8eef6'; for ( let x = 0; x < W; x += 32 ) { ctx.beginPath(); ctx.arc( x + 16, W * 0.5, 8, 0, PI * 2 ); ctx.fill(); } ctx.fillRect( 0, 6, W, 3 ); } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.035, 0 ], [ 0.04, 0.008 ], [ 0.06, 0.05 ], [ 0.062, 0.054 ], [ 0.058, 0.054 ], [ 0.038, 0.012 ], [ 0, 0.012 ] ], 28 ), M( 0xffffff, { map: bowlT, rough: 0.25 } ) );
				add( g, mound( 0.056, 0.032 ), rice(), [ 0, 0.042, 0 ] );
				for ( let i = 0; i < 16; i ++ ) add( g, G.box( 0.003, 0.0008, 0.002 ), M( i % 3 ? 0x1c2a1a : 0xd8b030 ), [ Math.cos( i * 2.4 ) * 0.022, 0.073 - ( i % 4 ) * 0.002, Math.sin( i * 1.7 ) * 0.022 ], [ 0, i, 0 ] );
				break;
			}
			default: add( g, G.rbox( 0.1, 0.04, 0.08, 0.01 ), M( s.color ?? 0xccaa77 ) );
		}
		return g;
	} );

	// ---- meat: { kind: 'steak'|'chunk'|'chicken'|'ribs', color, cooked, fat, paper } ----
	const meatTex = ( c, cooked, kind ) => canvasTex( `meat2:${c}:${cooked}:${kind}`, 256, 256, ( ctx, W, H ) => {
		const r = rng( c & 0xffff );
		if ( cooked ) {
			const gr = ctx.createRadialGradient( W / 2, H / 2, 10, W / 2, H / 2, W * 0.75 ); gr.addColorStop( 0, '#8a4a22' ); gr.addColorStop( 0.7, '#6a3416' ); gr.addColorStop( 1, '#3a1c0a' );
			ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
			for ( let i = 0; i < 400; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(30,12,4,0.35)' : 'rgba(200,120,60,0.2)'; ctx.fillRect( r() * W, r() * H, 2 + r() * 4, 1 + r() * 2 ); }
			// grill marks
			ctx.strokeStyle = 'rgba(20,8,2,0.55)'; ctx.lineWidth = 7;
			for ( let i = - 2; i < 6; i ++ ) { ctx.beginPath(); ctx.moveTo( i * 64, 0 ); ctx.lineTo( i * 64 + 90, H ); ctx.stroke(); }
			ctx.strokeStyle = 'rgba(240,180,90,0.25)'; ctx.lineWidth = 3;
			for ( let i = - 2; i < 6; i ++ ) { ctx.beginPath(); ctx.moveTo( i * 50 + 8, 0 ); ctx.lineTo( i * 50 + 98, H ); ctx.stroke(); }
			return;
		}
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
		for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(90,10,20,0.25)' : 'rgba(255,150,150,0.15)'; ctx.fillRect( r() * W, r() * H, 2 + r() * 6, 1 + r() * 3 ); }
		// the marbling: thin branching fat
		ctx.strokeStyle = 'rgba(255,240,230,0.7)'; ctx.lineCap = 'round';
		for ( let i = 0; i < 26; i ++ ) {
			ctx.lineWidth = 0.8 + r() * 2.2; let x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo( x, y );
			for ( let k = 0; k < 6; k ++ ) { x += ( r() - 0.5 ) * 40; y += ( r() - 0.5 ) * 40; ctx.lineTo( x, y ); }
			ctx.stroke();
		}
		// a glossy sheen
		ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect( 0, 0, W, H * 0.3 );
	}, { repeat: true } );
	const butcherPaper = () => M( 0xffffff, { map: canvasTex( 'butcher-paper', 128, 128, ( ctx, W ) => { ctx.fillStyle = '#efe6d2'; ctx.fillRect( 0, 0, W, W ); const r = rng( 9 ); ctx.strokeStyle = 'rgba(150,130,100,0.25)'; for ( let i = 0; i < 20; i ++ ) { ctx.beginPath(); ctx.moveTo( r() * W, r() * W ); ctx.lineTo( r() * W, r() * W ); ctx.stroke(); } ctx.fillStyle = 'rgba(160,40,40,0.12)'; ctx.beginPath(); ctx.arc( W * 0.6, W * 0.55, 30, 0, PI * 2 ); ctx.fill(); } ), rough: 0.95 } );
	reg( 'meat', ( s ) => {
		const g = group(), c = s.color ?? 0xa8323a, ck = !! s.cooked;
		const flesh = M( 0xffffff, { map: meatTex( c, ck, s.kind ), rough: ck ? 0.62 : 0.28 } );
		const fat = M( ck ? 0x9a6a3a : ( s.fat ?? 0xf1e0d0 ), { rough: ck ? 0.5 : 0.4 } );
		const bone = M( ck ? 0xd8c8a0 : 0xf2ead8, { rough: 0.5 } );
		switch ( s.kind ) {
			case 'chicken': {
				// a whole bird, trussed: the breast, the drumsticks with their knuckles, the wings tucked
				const skinM = M( 0xffffff, { map: canvasTex( 'chicken-skin' + ( ck ? 'ck' : '' ), 128, 128, ( ctx, W ) => {
					const gr = ctx.createLinearGradient( 0, 0, 0, W );
					if ( ck ) { gr.addColorStop( 0, '#d8963a' ); gr.addColorStop( 0.5, '#b8682a' ); gr.addColorStop( 1, '#7a3a14' ); } else { gr.addColorStop( 0, '#f0cdb4' ); gr.addColorStop( 1, '#dca088' ); }
					ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, W );
					const r = rng( 4 ); for ( let i = 0; i < 500; i ++ ) { ctx.fillStyle = ck ? ( r() < 0.5 ? 'rgba(60,20,5,0.3)' : 'rgba(255,220,140,0.25)' ) : 'rgba(200,140,120,0.35)'; ctx.beginPath(); ctx.arc( r() * W, r() * W, 0.8 + r(), 0, PI * 2 ); ctx.fill(); }
				}, { repeat: true } ), rough: ck ? 0.32 : 0.5 } );
				const body = organic( G.sph( 0.07, 20, 14 ).scale( 1.28, 0.78, 1 ), 0.04, 2 ); body.translate( 0, 0.055, 0 );
				add( g, body, skinM );
				add( g, organic( G.sph( 0.045, 14, 10 ).scale( 1.5, 0.6, 0.9 ), 0.05, 4 ), skinM, [ 0.0, 0.085, 0 ] );
				for ( const z of [ - 1, 1 ] ) {
					add( g, G.lathe( [ [ 0, 0 ], [ 0.016, 0.006 ], [ 0.024, 0.03 ], [ 0.02, 0.055 ], [ 0.009, 0.075 ], [ 0.007, 0.085 ] ], 12 ).rotateZ( - PI / 2 ), skinM, [ 0.03, 0.04, z * 0.042 ], [ 0, z * - 0.35, - 0.25 ] );
					add( g, G.sph( 0.008, 8, 6 ), bone, [ 0.11, 0.06, z * 0.07 ] );
					add( g, organic( G.sph( 0.025, 10, 8 ).scale( 1.6, 0.5, 0.8 ), 0.05, z + 5 ), skinM, [ - 0.04, 0.07, z * 0.06 ], [ 0, 0, 0.3 ] );
				}
				break;
			}
			case 'chunk': {
				// a roasting joint: a rounded, uneven piece of muscle, a fat cap down one side, tied with string when raw
				const geo = organic( G.sph( 0.07, 22, 14 ).scale( 1.25, 0.62, 0.95 ), 0.1, 5, 3 ); geo.translate( 0, 0.043, 0 );
				add( g, geo, flesh );
				if ( ! ck ) add( g, organic( G.sph( 0.06, 16, 10 ).scale( 1.12, 0.52, 0.32 ), 0.06, 6 ), fat, [ 0.004, 0.044, - 0.043 ] );
				if ( ! ck ) for ( const x of [ - 0.04, 0, 0.04 ] ) add( g, G.torus( 0.06, 0.0012, 3, 22 ).scale( 1, 0.72, 0.98 ), M( 0xf2ead8, { rough: 0.9 } ), [ x, 0.043, 0 ], [ 0, PI / 2, 0 ] );
				break;
			}
			case 'ribs': {
				// a rack: the meat over the bones, their ends showing on both sides
				add( g, organic( G.rbox( 0.21, 0.034, 0.1, 0.014, 2 ), 0.05, 7 ), flesh );
				for ( let i = 0; i < 6; i ++ ) for ( const z of [ - 1, 1 ] ) add( g, G.capsX( 0.0065, 0.022, 6, 2 ).rotateY( PI / 2 ), bone, [ - 0.085 + i * 0.034, 0.014, z * 0.056 ] );
				add( g, organic( G.rbox( 0.2, 0.008, 0.024, 0.003, 1 ), 0.06, 8 ), fat, [ 0, 0.029, - 0.036 ] );
				break;
			}
			default: { // steak
				const geo = organic( G.cyl( 0.07, 0.07, 0.026, 26 ).scale( 1.3, 1, 0.95 ), 0.06, 3 );
				add( g, geo, flesh );
				const rim = G.torus( 0.072, 0.01, 6, 22, PI * 0.9 ); rim.scale( 1.3, 0.95, 1.4 ); rim.rotateX( PI / 2 );
				add( g, rim, fat, [ 0, 0.013, 0 ] );
			}
		}
		// butcher paper under raw cuts
		if ( ! ck && s.paper !== false && s.kind !== 'chicken' ) { add( g, organic( G.box( 0.24, 0.002, 0.18 ), 0.02, 1 ), butcherPaper(), [ 0, - 0.002, 0 ], [ 0, 0.15, 0 ] ); ground( g, false ); }
		return ground( g, false );
	} );

	// ---- fish: { len, color (back), belly, stripe, deep, kind: 'fish'|'octopus'|'fillet', species, cooked } ----
	function fishTex( s, ck ) {
		const key = `fish2:${s.color}:${s.belly}:${s.stripe}:${s.species}:${ck}`;
		return canvasTex( key, 256, 128, ( ctx, W, H ) => {
			// x runs head (0) to tail (W); y round the body: 0 and H along the back, H/2 the belly
			const back = css( ck ? 0x6a3a14 : s.color ?? 0x3a6a9a ), belly = css( ck ? 0xb07a3a : s.belly ?? 0xe8eef0 );
			const gr = ctx.createLinearGradient( 0, 0, 0, H );
			gr.addColorStop( 0, back ); gr.addColorStop( 0.3, belly ); gr.addColorStop( 0.5, belly ); gr.addColorStop( 0.7, belly ); gr.addColorStop( 1, back );
			ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
			const r = rng( hashStr( key ) );
			if ( ! ck && s.species === 'mahimahi' ) { ctx.fillStyle = 'rgba(40,120,200,0.6)'; for ( let i = 0; i < 60; i ++ ) { ctx.beginPath(); ctx.arc( r() * W, ( r() < 0.5 ? r() * 0.3 : 0.7 + r() * 0.3 ) * H, 1.5, 0, PI * 2 ); ctx.fill(); } }
			// scales
			ctx.strokeStyle = ck ? 'rgba(40,20,5,0.25)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
			for ( let y = 0; y < H; y += 6 ) for ( let x = ( y / 6 % 2 ) * 4 + W * 0.18; x < W * 0.86; x += 8 ) { ctx.beginPath(); ctx.arc( x, y, 4, - PI / 2, PI / 2 ); ctx.stroke(); }
			// the lateral line and a stripe
			ctx.strokeStyle = ck ? 'rgba(30,15,5,0.4)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
			for ( const yy of [ 0.22, 0.78 ] ) { ctx.beginPath(); ctx.moveTo( W * 0.18, H * yy ); ctx.quadraticCurveTo( W * 0.5, H * ( yy < 0.5 ? 0.16 : 0.84 ), W * 0.9, H * ( yy < 0.5 ? 0.2 : 0.8 ) ); ctx.stroke(); }
			if ( s.stripe && ! ck ) { ctx.fillStyle = css( s.stripe ); ctx.globalAlpha = 0.85; for ( const yy of [ 0.18, 0.82 ] ) ctx.fillRect( W * 0.2, H * yy - 2, W * 0.62, 4 ); ctx.globalAlpha = 1; }
			// the gill cover
			ctx.strokeStyle = ck ? 'rgba(30,15,5,0.6)' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
			for ( const yy of [ 0, 1 ] ) { ctx.beginPath(); ctx.arc( W * 0.1, yy * H, H * 0.36, yy ? - PI / 2 : 0, yy ? 0 : PI / 2 ); ctx.stroke(); }
			if ( ck ) {
				// charred at the edges, a few grill bars across the side
				const ch = ctx.createLinearGradient( 0, 0, 0, H ); ch.addColorStop( 0, 'rgba(30,12,4,0.5)' ); ch.addColorStop( 0.25, 'rgba(30,12,4,0)' ); ch.addColorStop( 0.75, 'rgba(30,12,4,0)' ); ch.addColorStop( 1, 'rgba(30,12,4,0.5)' );
				ctx.fillStyle = ch; ctx.fillRect( 0, 0, W, H );
				ctx.strokeStyle = 'rgba(25,10,3,0.45)'; ctx.lineWidth = 4;
				for ( let x = 60; x < W * 0.85; x += 46 ) for ( const [ y0, y1 ] of [ [ H * 0.08, H * 0.42 ], [ H * 0.58, H * 0.92 ] ] ) { ctx.beginPath(); ctx.moveTo( x, y0 ); ctx.lineTo( x - 14, y1 ); ctx.stroke(); }
			}
		} );
	}
	// a fish body along x (head at -x): height h(t), width = h(t) × flat; u along, v round from the back
	function fishBody( L, R, prof, flat = 0.5, n = 18, m = 16 ) {
		const pos = [], uv = [], idx = [];
		for ( let i = 0; i <= n; i ++ ) {
			const t = i / n, h = R * prof( t ), x = - L / 2 + t * L;
			for ( let j = 0; j <= m; j ++ ) { const a = j / m * PI * 2; pos.push( x, Math.cos( a ) * h, Math.sin( a ) * h * flat ); uv.push( t, 1 - j / m ); }
		}
		for ( let i = 0; i < n; i ++ ) for ( let j = 0; j < m; j ++ ) { const a = i * ( m + 1 ) + j, b = a + m + 1; idx.push( a, b, a + 1, a + 1, b, b + 1 ); }
		const g2 = new THREE.BufferGeometry();
		g2.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) ); g2.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		g2.setIndex( idx ); g2.computeVertexNormals();
		return g2;
	}
	const fin = ( pts, mat ) => { const sh = new THREE.Shape( pts.map( ( [ x, y ] ) => new THREE.Vector2( x, y ) ) ); return [ new THREE.ShapeGeometry( sh, 2 ), mat ]; };
	reg( 'fish', ( s ) => {
		const g = group(), L = s.len ?? 0.35, ck = !! s.cooked;
		if ( s.kind === 'octopus' ) {
			// tako: the mantle, eight tapering arms curling out, suckers on their undersides
			const tex = canvasTex( 'tako' + ( ck ? 'ck' : '' ), 128, 128, ( ctx, W ) => {
				ctx.fillStyle = ck ? '#9a2a3a' : '#b0685a'; ctx.fillRect( 0, 0, W, W );
				const r = rng( 6 ); for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = r() < 0.5 ? ( ck ? 'rgba(60,10,30,0.4)' : 'rgba(110,50,40,0.45)' ) : 'rgba(240,200,190,0.25)'; ctx.beginPath(); ctx.arc( r() * W, r() * W, 1 + r() * 3, 0, PI * 2 ); ctx.fill(); }
			}, { repeat: true } );
			const m = M( 0xffffff, { map: tex, rough: ck ? 0.3 : 0.4 } ), sucker = M( ck ? 0xf2d8d0 : 0xf0d8c8, { rough: 0.5 } );
			const head = organic( G.sph( 0.055, 18, 12 ).scale( 1.35, 0.85, 1 ), 0.05, 2 ); head.translate( - 0.07, 0.048, 0 );
			add( g, head, m );
			for ( let i = 0; i < 8; i ++ ) {
				const a = ( i / 8 - 0.5 ) * 2.6, curl = ( i % 2 ? 1 : - 1 ) * 0.03;
				const pts = [ [ - 0.02, 0.022, Math.sin( a ) * 0.015 ], [ 0.04, 0.012, Math.sin( a ) * 0.04 ], [ 0.11, 0.01, Math.sin( a ) * 0.085 + curl ], [ 0.16, 0.012, Math.sin( a ) * 0.11 + curl * 2 ], [ 0.18, 0.02, Math.sin( a ) * 0.1 + curl * 3 ] ];
				add( g, taperTube( pts, 0.012, ( t ) => 1 - t * 0.85, 18, 6 ), m );
				for ( let k = 1; k < 6; k ++ ) { const t = k / 7, p0 = new THREE.CatmullRomCurve3( pts.map( q => new THREE.Vector3( ...q ) ) ).getPoint( t ); add( g, G.sph( 0.003 * ( 1 - t * 0.7 ), 5, 3 ), sucker, [ p0.x, Math.max( 0.003, p0.y - 0.008 * ( 1 - t ) ), p0.z ] ); }
			}
			return ground( g );
		}
		if ( s.kind === 'fillet' ) {
			// a thick loin: the pale flesh with its chevron muscle lines, seared when cooked
			const tex = canvasTex( 'fillet:' + ( s.color ?? 0xd06a6a ) + ck, 256, 128, ( ctx, W, H ) => {
				ctx.fillStyle = ck ? '#c8904a' : css( s.color ?? 0xd06a6a ); ctx.fillRect( 0, 0, W, H );
				ctx.strokeStyle = ck ? 'rgba(120,60,20,0.5)' : 'rgba(170,120,110,0.4)'; ctx.lineWidth = 2;
				for ( let x = - 20; x < W + 20; x += 14 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x + 14, H / 2 ); ctx.lineTo( x, H ); ctx.stroke(); }
				if ( ck ) { ctx.strokeStyle = 'rgba(40,15,5,0.7)'; ctx.lineWidth = 7; for ( let x = 0; x < W; x += 40 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x + 50, H ); ctx.stroke(); } }
			} );
			const geo = organic( G.sph( L * 0.5, 22, 10 ).scale( 1, 0.22, 0.36 ), 0.04, 3 ); geo.translate( 0, L * 0.105, 0 );
			add( g, geo, M( 0xffffff, { map: tex, rough: ck ? 0.6 : 0.3 } ) );
			// a strip of the grey skin left along one edge
			add( g, organic( G.sph( L * 0.48, 18, 6 ).scale( 1, 0.18, 0.06 ), 0.04, 4 ), M( ck ? 0x3a2410 : 0x6a6e72, { rough: 0.6 } ), [ 0, L * 0.1, - L * 0.16 ] );
			return ground( g, false );
		}
		const sp = s.species || ( s.stripe && ( s.deep ?? 0.16 ) > 0.18 ? 'ahi' : '' );
		const R = L * ( s.deep ?? 0.16 );
		const blunt = sp === 'mahimahi', deepB = sp === 'ulua';
		const prof = ( t ) => {
			const head = blunt ? Math.pow( Math.min( 1, t / 0.12 ), 0.35 ) : Math.pow( Math.min( 1, t / 0.3 ), 0.6 );
			return Math.max( 0.05, head * ( t > 0.4 ? 1 - Math.pow( ( t - 0.4 ) / 0.6, 1.4 ) * 0.88 : 1 ) );
		};
		const skinM = M( 0xffffff, { map: fishTex( { ...s, species: sp }, ck ), rough: ck ? 0.7 : 0.25, metal: ck ? 0 : 0.25 } );
		const body = fishBody( L * 0.86, R, prof, deepB ? 0.42 : 0.5 );
		add( g, body, skinM, [ - L * 0.07, R, 0 ] );
		const finC = ck ? 0x4a2a10 : sp === 'ahi' ? 0xf2d21a : sp === 'mahimahi' ? 0x3a8a6a : shade( s.color ?? 0x3a6a9a, - 0.2 );
		const finM = M( finC, { rough: 0.5, side: THREE.DoubleSide } );
		const tailM = M( ck ? 0x4a2a10 : shade( s.color ?? 0x3a6a9a, - 0.25 ), { rough: 0.5, side: THREE.DoubleSide } );
		// the tail: forked, lunate on a tuna
		const tw = R * ( sp === 'ahi' ? 1.6 : 1.15 );
		const [ tg, tm ] = fin( [ [ 0, 0 ], [ L * 0.14, tw ], [ L * 0.11, tw * 0.3 ], [ L * 0.09, 0 ], [ L * 0.11, - tw * 0.3 ], [ L * 0.14, - tw ], [ 0, 0 ] ], tailM );
		add( g, tg, tm, [ L * 0.34, R, 0 ] );
		// the dorsal fin(s) and the anal fin
		if ( blunt ) add( g, ...fin( [ [ 0, 0 ], [ L * 0.02, R * 0.5 ], [ L * 0.6, R * 0.22 ], [ L * 0.65, 0 ] ], finM ), [ - L * 0.42, R * 1.9, 0 ] );
		else {
			add( g, ...fin( [ [ 0, 0 ], [ L * 0.05, R * ( sp === 'ahi' ? 0.7 : 0.6 ) ], [ L * 0.15, R * 0.15 ], [ L * 0.16, 0 ] ], finM ), [ - L * 0.12, R * 1.9, 0 ] );
			add( g, ...fin( [ [ 0, 0 ], [ L * 0.05, R * ( sp === 'ahi' ? 0.65 : 0.4 ) ], [ L * 0.1, 0 ] ], finM ), [ L * 0.08, R * 1.75, 0 ] );
			add( g, ...fin( [ [ 0, 0 ], [ L * 0.05, - R * ( sp === 'ahi' ? 0.65 : 0.4 ) ], [ L * 0.1, 0 ] ], finM ), [ L * 0.08, R * 0.25, 0 ] );
		}
		if ( sp === 'ahi' ) for ( let i = 0; i < 6; i ++ ) for ( const y of [ 1.55, 0.45 ] ) add( g, G.box( 0.008, 0.008, 0.002 ), M( ck ? 0x4a2a10 : 0xf2d21a, { rough: 0.5 } ), [ L * ( 0.2 + i * 0.022 ), R * ( y + ( y > 1 ? - i * 0.08 : i * 0.08 ) ), 0 ], [ 0, 0, PI / 4 ] );
		// the pectoral fin, laid back along the side
		add( g, ...fin( [ [ 0, 0 ], [ L * 0.1, R * 0.25 ], [ L * 0.12, - R * 0.05 ] ], finM ), [ - L * 0.3, R * 0.9, R * 0.5 * 0.95 ], [ 0, - 0.3, - 0.4 ] );
		// the eye, set into the side of the head: a dark pupil in a gold iris (milky when cooked)
		const te = blunt ? 0.09 : 0.1, he = R * prof( te ), dy = he * 0.3, ez = ( deepB ? 0.42 : 0.5 ) * he * Math.sqrt( 1 - 0.09 );
		const ex = - L * 0.07 - L * 0.43 + L * 0.86 * te;
		for ( const z of [ - 1, 1 ] ) {
			add( g, G.sph( R * 0.12, 10, 8 ).scale( 1, 1, 0.35 ), M( ck ? 0xe8e4d8 : 0xc8a03a, { rough: 0.15 } ), [ ex, R + dy, z * ez ] );
			if ( ! ck ) add( g, G.sph( R * 0.075, 8, 6 ).scale( 1, 1, 0.35 ), M( 0x050505, { rough: 0.05 } ), [ ex, R + dy, z * ( ez + R * 0.025 ) ] );
		}
		return ground( g );
	} );
}

// ---- shared shape helpers ----------------------------------------------------------------------------------------

// soften a closed shape with low-frequency bumps (by position, so seams stay closed), then smooth its normals across
// the UV seams
function organic( geo, amp, seed = 1, freq = 3 ) {
	const p = geo.attributes.position, r = rngF( seed );
	const dirs = [ 0, 1, 2, 3 ].map( () => new THREE.Vector3( r() - 0.5, r() - 0.5, r() - 0.5 ).normalize() );
	const ph = dirs.map( () => r() * PI * 2 );
	geo.computeBoundingBox();
	const c = geo.boundingBox.getCenter( new THREE.Vector3() ), sz = geo.boundingBox.getSize( new THREE.Vector3() ), sc = Math.max( sz.x, sz.y, sz.z ) || 1;
	const v = new THREE.Vector3();
	for ( let i = 0; i < p.count; i ++ ) {
		v.set( p.getX( i ), p.getY( i ), p.getZ( i ) ).sub( c );
		const n = v.clone().divideScalar( sc );
		let f = 0; dirs.forEach( ( d, k ) => { f += Math.sin( n.dot( d ) * freq * 4 + ph[ k ] ); } );
		v.multiplyScalar( 1 + amp * f / dirs.length ).add( c );
		p.setXYZ( i, v.x, v.y, v.z );
	}
	geo.computeVertexNormals();
	// average normals of vertices that share a position (the sphere's seam)
	const nor = geo.attributes.normal, map = new Map();
	for ( let i = 0; i < p.count; i ++ ) { const k = `${p.getX( i ).toFixed( 5 )},${p.getY( i ).toFixed( 5 )},${p.getZ( i ).toFixed( 5 )}`; let e = map.get( k ); if ( ! e ) map.set( k, e = [] ); e.push( i ); }
	for ( const ids of map.values() ) {
		if ( ids.length < 2 ) continue;
		v.set( 0, 0, 0 ); for ( const i of ids ) v.x += nor.getX( i ), v.y += nor.getY( i ), v.z += nor.getZ( i );
		v.normalize(); for ( const i of ids ) nor.setXYZ( i, v.x, v.y, v.z );
	}
	return geo;
}
function rngF( seed ) { let s = ( Math.abs( Math.floor( seed * 9973 ) ) >>> 0 ) || 7; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; }; }
const rng = rngF;

// a tube whose radius follows f( t ) along the curve (bananas, tentacles)
function taperTube( pts, r, f, seg = 16, rs = 6 ) {
	const curve = new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ) );
	const geo = new THREE.TubeGeometry( curve, seg, r, rs, false );
	const p = geo.attributes.position;
	for ( let i = 0; i <= seg; i ++ ) {
		const c = curve.getPointAt( i / seg ), k = f( i / seg );
		for ( let j = 0; j <= rs; j ++ ) { const id = i * ( rs + 1 ) + j; p.setXYZ( id, c.x + ( p.getX( id ) - c.x ) * k, c.y + ( p.getY( id ) - c.y ) * k, c.z + ( p.getZ( id ) - c.z ) * k ); }
	}
	geo.computeVertexNormals();
	return geo;
}

// a leaf blade: a strip w wide and len long from the origin up +y, bowed outwards by `bow`
function leaf( len, w, bow = 0.4 ) {
	const geo = new THREE.PlaneGeometry( w, len, 1, 5 ).translate( 0, len / 2, 0 );
	const p = geo.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) { const t = p.getY( i ) / len; p.setX( i, p.getX( i ) * ( 1 - t * 0.85 ) ); p.setZ( i, t * t * len * bow ); }
	geo.computeVertexNormals();
	return geo;
}
