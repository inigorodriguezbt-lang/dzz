// Ammunition boxes: printed card boxes (each face its own part of one label sheet: the lid's front with the calibre, the
// sides with the load and count, the ends), a few loose rounds beside them; arrow and bolt bundles; the .50 can.
import { patchMaterial } from '../../render/Materials.js';
import { THREE, PI, CAL, Parts, cartridge, instantiate, weaponMaterials } from './kit.js';

// what each box says: calibre, load, how many, the maker's colour and its print colour
const LOADS = {
	ammo_9mm: [ '9MM LUGER', '115 GR  FULL METAL JACKET', 50, '#24467e' ],
	ammo_45acp: [ '.45 AUTO', '230 GR  FULL METAL JACKET', 50, '#76201c' ],
	ammo_357: [ '.357 MAGNUM', '158 GR  JACKETED SOFT POINT', 50, '#2a5f36' ],
	ammo_44mag: [ '.44 REM MAGNUM', '240 GR  JACKETED HOLLOW POINT', 50, '#8e4416' ],
	ammo_50ae: [ '.50 ACTION EXPRESS', '300 GR  JACKETED HOLLOW POINT', 20, '#1c1c1e', '#d6a84a' ],
	ammo_22lr: [ '.22 LONG RIFLE', '40 GR  LEAD ROUND NOSE', 100, '#b0261b' ],
	ammo_9x18: [ '9×18 MAKAROV', '95 GR  FMJ', 50, '#525a2c' ],
	ammo_556: [ '5.56×45 NATO', '62 GR  M855  GREEN TIP', 20, '#36513a' ],
	ammo_545: [ '5.45×39', '53 GR  7N6  FMJ', 30, '#5e3326' ],
	ammo_762x39: [ '7.62×39', '123 GR  FULL METAL JACKET', 20, '#8a5420' ],
	ammo_308: [ '.308 WINCHESTER', '150 GR  SOFT POINT', 20, '#26315a' ],
	ammo_762x54r: [ '7.62×54R', '148 GR  FMJ  STEEL CASE', 20, '#56201e' ],
	ammo_12ga_buck: [ '12 GAUGE', '2¾"  00 BUCK  9 PELLETS', 25, '#a3221a' ],
	ammo_12ga_slug: [ '12 GAUGE', '2¾"  1 OZ RIFLED SLUG', 25, '#1e1e20', '#e8c23a' ],
	ammo_3030: [ '.30-30 WIN', '150 GR  FLAT POINT', 20, '#2c6430' ],
	ammo_46x30: [ '4.6×30', '31 GR  DM11  AP', 40, '#474d55' ],
	ammo_flare: [ '12 GA SIGNAL', 'RED AERIAL FLARES', 6, '#e05a1c' ],
};
const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';

// the label sheet: 1024 x 512, the lid on the left half, the long side and the end in the right half's rows
// (u 0-0.5: the lid; 0.5-1 x v 0.5-1: a long side; 0.5-1 x v 0-0.5: an end)
function drawLabel( g, L, small ) {
	const [ cal, load, n, col, ink = '#f2ede2' ] = L;
	const W = 1024, H = 512;
	g.fillStyle = '#e8e1cf'; g.fillRect( 0, 0, W, H );
	// card grain: faint fibres so the print sits on board, not on plastic
	let seed = 11;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < 900; i ++ ) { g.fillStyle = `rgba(90,70,40,${ 0.03 + rnd() * 0.05 })`; g.fillRect( rnd() * W, rnd() * H, 1 + rnd() * 6, 1 ); }
	g.textBaseline = 'middle'; g.textAlign = 'center';
	// lid: a colour band with the maker, the calibre big, the load, the count, a thin rule
	g.fillStyle = col; g.fillRect( 0, 0, 512, 150 ); g.fillRect( 0, 470, 512, 42 );
	g.fillStyle = ink; g.font = `700 34px ${FONT}`; g.fillText( 'PACIFIC CARTRIDGE CO.', 256, 44 );
	g.font = `700 ${ cal.length > 12 ? 74 : 92 }px ${FONT}`; g.fillText( cal, 256, 108 );
	g.fillStyle = '#25211d'; g.font = `700 40px ${FONT}`; g.fillText( load, 256, 228 );
	g.fillStyle = col; g.fillRect( 56, 270, 400, 5 );
	g.fillStyle = '#25211d'; g.font = `700 72px ${FONT}`; g.fillText( String( n ), 256, 336 );
	g.font = `600 30px ${FONT}`; g.fillText( small ? 'CARTRIDGES' : cal.startsWith( '12' ) ? 'SHOTSHELLS' : 'CENTERFIRE CARTRIDGES', 256, 392 );
	g.font = `500 22px ${FONT}`; g.fillText( 'KEEP OUT OF REACH OF CHILDREN', 256, 436 );
	g.fillStyle = ink; g.font = `600 24px ${FONT}`; g.fillText( 'MADE IN HONOLULU, HI', 256, 491 );
	// long side: the band, the calibre and count, a lot number and a bar code
	g.fillStyle = col; g.fillRect( 512, 256, 512, 92 );
	g.fillStyle = ink; g.font = `700 60px ${FONT}`; g.fillText( `${cal}  ·  ${n}`, 768, 304 );
	g.fillStyle = '#25211d'; g.font = `700 34px ${FONT}`; g.fillText( load, 768, 384 );
	g.font = `500 24px ${FONT}`; g.textAlign = 'left'; g.fillText( `LOT ${ 4000 + ( cal.length * 397 ) % 5000 }-${ 10 + n % 80 }`, 540, 452 );
	g.fillStyle = '#ffffff'; g.fillRect( 820, 410, 180, 82 );
	g.fillStyle = '#111111';
	for ( let x = 830, i = 0; x < 990; i ++ ) { const w = 1 + ( ( i * 7 + cal.length ) % 4 ); g.fillRect( x, 418, w, 56 ); x += w + 1 + ( ( i * 3 ) % 3 ); }
	g.font = `500 14px ${FONT}`; g.fillText( '0 76683 ' + String( 10000 + n * 17 ).slice( 0, 5 ), 838, 484 );
	// end: the calibre on the colour
	g.fillStyle = col; g.fillRect( 512, 0, 512, 256 );
	g.fillStyle = ink; g.textAlign = 'center'; g.font = `700 ${ cal.length > 12 ? 58 : 76 }px ${FONT}`; g.fillText( cal, 768, 110 );
	g.font = `600 30px ${FONT}`; g.fillText( `${n} ROUNDS`, 768, 182 );
	// the flaps' fold lines on the ends
	g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect( 512, 12, 512, 3 ); g.fillRect( 512, 241, 512, 3 );
}

const LABEL = new Map();
function labelMaterial( id, small ) {
	if ( LABEL.has( id ) ) return LABEL.get( id );
	const L = LOADS[ id ] || [ id.replace( 'ammo_', '' ).toUpperCase(), 'CARTRIDGES', 20, '#6a2a22' ];
	const m = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.82, metalness: 0 } );
	if ( typeof document !== 'undefined' ) {
		const c = document.createElement( 'canvas' ); c.width = 1024; c.height = 512;
		const g = c.getContext( '2d' );
		drawLabel( g, L, small );
		const t = new THREE.CanvasTexture( c ); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
		m.map = t;
		// the condensed face may still be loading: print again once it is in
		try { document.fonts?.load( `700 40px "Roboto Condensed"` ).then( () => { drawLabel( g, L, small ); t.needsUpdate = true; } ).catch( () => {} ); } catch ( e ) { /* no font loading API */ }
	}
	patchMaterial( m, 'wpn' );
	LABEL.set( id, m );
	return m;
}

// a card box whose faces take their parts of the label sheet (BoxGeometry's faces: +x -x +y -y +z -z)
function cardBox( sx, sy, sz ) {
	const g = new THREE.BoxGeometry( sx, sy, sz );
	const uv = g.attributes.uv;
	const R = { lid: [ 0, 0, 0.5, 1 ], side: [ 0.5, 0.5, 1, 1 ], end: [ 0.5, 0, 1, 0.5 ] };
	const faces = [ 'end', 'end', 'lid', 'lid', 'side', 'side' ];
	for ( let f = 0; f < 6; f ++ ) {
		const [ u0, v0, u1, v1 ] = R[ faces[ f ] ];
		for ( let i = f * 4; i < f * 4 + 4; i ++ ) {
			let u = uv.getX( i ), v = uv.getY( i );
			// the lid reads along the box's length; its underside is plain board
			if ( faces[ f ] === 'lid' ) [ u, v ] = [ v, 1 - u ];
			if ( f === 3 ) { u = 0.02; v = 0.02; }
			uv.setXY( i, u0 + u * ( u1 - u0 ), v0 + v * ( v1 - v0 ) );
		}
	}
	return g;
}

export function ammoBoxModel( spec, def ) {
	// (v2: printed label sheets)
	const cal = spec.caliber || def.ammo?.caliber;
	const mats = weaponMaterials();
	const P = new Parts();
	const g = new THREE.Group();
	if ( cal === 'arrow' || cal === 'bolt' ) {
		// a bundle of three, tied with a band
		for ( let i = 0; i < 3; i ++ ) {
			const L = cal === 'arrow' ? 0.72 : 0.42, z = ( i - 1 ) * 0.0085, y = 0.004 + ( i === 1 ? 0.006 : 0 );
			P.cyl( cal === 'arrow' ? 'poly' : 'alu', - L / 2, L / 2, 0.0038, y, z, 8 );
			P.lathe( 'steel', [ [ L / 2 - 0.002, 0.0042 ], [ L / 2 + 0.012, 0.0055 ], [ L / 2 + 0.03, 0.0008 ] ], y, z, 8 );
			for ( let j = 0; j < 3; j ++ ) { const a = j / 3 * PI * 2 + i; P.boxC( j ? 'white' : 'orange', - L / 2 + 0.045, y + Math.sin( a ) * 0.0075, z + Math.cos( a ) * 0.0075, 0.06, 0.001, 0.011, 0, [ a, 0, 0 ] ); }
			P.cyl( 'orange', - L / 2 - 0.006, - L / 2, 0.0042, y, z, 8 );
		}
		P.lathe( 'rubber', [ [ - 0.01, 0.014 ], [ 0.01, 0.014 ] ], 0.007, 0, 12 );
	} else if ( cal === '.50bmg' ) {
		// a steel M2A1 can: the body with its pressed ribs, the lid with the gasket lip, the folding handle, the latch
		P.box( 'od', - 0.15, 0.15, 0.0, 0.165, - 0.05, 0.05, 0.004 );
		for ( const s of [ - 1, 1 ] ) for ( const y of [ 0.04, 0.09, 0.14 ] ) P.box( 'od', - 0.135, 0.135, y - 0.004, y + 0.004, s * 0.05 - 0.0015, s * 0.05 + 0.0015, 0.002 );
		P.box( 'od', - 0.153, 0.153, 0.162, 0.19, - 0.053, 0.053, 0.004 );
		P.box( 'od', - 0.12, 0.12, 0.188, 0.192, - 0.042, 0.042, 0.002 );
		P.box( 'blk', - 0.05, 0.05, 0.191, 0.197, - 0.008, 0.008, 0.003 );
		for ( const x of [ - 0.05, 0.05 ] ) P.box( 'blk', x - 0.006, x + 0.006, 0.188, 0.194, - 0.012, 0.012, 0.002 );
		P.extS( 'od', [ [ 0.153, 0.19 ], [ 0.162, 0.188 ], [ 0.162, 0.14, 0.006 ], [ 0.153, 0.135 ] ], 0.02, 0.003 );
		P.box( 'yellow', - 0.11, 0.11, 0.06, 0.068, 0.0502, 0.0512, 0 );
		P.box( 'yellow', - 0.08, 0.08, 0.075, 0.08, 0.0502, 0.0512, 0 );
	} else {
		const pistol = [ '.22lr', '9mm', '9x18', '.45acp', '.357', '.44mag', '.50ae', '4.6x30' ].includes( cal );
		const dims = cal === '12ga' ? [ 0.115, 0.07, 0.115 ] : cal === 'flare' ? [ 0.16, 0.05, 0.05 ] : pistol ? [ 0.1, 0.035, 0.07 ] : [ 0.12, 0.04, 0.075 ];
		const box = new THREE.Mesh( cardBox( ...dims ), labelMaterial( def.id, pistol ) );
		box.position.y = dims[ 1 ] / 2; box.castShadow = true; box.receiveShadow = true;
		g.add( box );
		// a few loose rounds beside the box
		for ( let i = 0; i < 3; i ++ ) cartridge( P, - 0.02 + i * 0.012, ( CAL[ cal ]?.r || 0.005 ), dims[ 2 ] / 2 + 0.012 + i * 0.013, cal, null, 1 );
	}
	const o = instantiate( P.bake(), mats, true );
	g.add( o );
	return g;
}
