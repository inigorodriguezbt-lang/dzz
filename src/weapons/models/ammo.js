// Ammunition boxes: printed card boxes with a few loose rounds, arrow bundles, the .50 can.
import { patchMaterial } from '../../render/Materials.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { THREE, CAL, Parts, cartridge, instantiate, weaponMaterials } from './kit.js';

// ---- ammunition boxes -----------------------------------------------------------------------------------------------------

const LABEL = {};
function labelMaterial( cal ) {
	if ( LABEL[ cal ] ) return LABEL[ cal ];
	const color = { '12ga': '#a8231c', '.50bmg': '#3d4a2a', '.22lr': '#1f5fa8', '5.56': '#2d6a3a', '5.45': '#6a2d2d', '7.62x39': '#6a4a1d', '.308': '#3a3a6a', '7.62x54r': '#5a2a2a', flare: '#e0561c' }[ cal ] || '#7a1f1f';
	const m = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.85 } );
	if ( typeof document !== 'undefined' ) {
		const c = document.createElement( 'canvas' ); c.width = 256; c.height = 128;
		const g = c.getContext( '2d' );
		g.fillStyle = '#d9cfb8'; g.fillRect( 0, 0, 256, 128 );
		g.fillStyle = color; g.fillRect( 0, 0, 256, 44 ); g.fillRect( 0, 110, 256, 18 );
		g.fillStyle = '#f4efe2'; g.font = 'bold 34px "Roboto Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.fillText( cal.toUpperCase(), 128, 34 );
		g.fillStyle = '#2a2622'; g.font = 'bold 20px "Roboto Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText( cal === '12ga' ? 'SHOTSHELLS' : cal === 'flare' ? 'SIGNAL FLARES' : 'CENTERFIRE', 128, 76 );
		g.font = '15px "Roboto Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText( 'HANDLE WITH CARE', 128, 100 );
		const t = new THREE.CanvasTexture( c ); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
		m.map = t;
	}
	patchMaterial( m, 'wpn' );
	LABEL[ cal ] = m;
	return m;
}

export function ammoBoxModel( spec, def ) {
	const cal = spec.caliber || def.ammo?.caliber;
	const mats = weaponMaterials();
	const P = new Parts();
	const g = new THREE.Group();
	if ( cal === 'arrow' || cal === 'bolt' ) {
		for ( let i = 0; i < 3; i ++ ) {
			const L = cal === 'arrow' ? 0.72 : 0.42, z = ( i - 1 ) * 0.012;
			P.cyl( 'poly', - L / 2, L / 2, 0.0038, 0.004, z, 8 );
			P.cyl( 'steel', L / 2, L / 2 + 0.03, 0.0045, 0.004, z, 6, 0.001 );
			P.box( 'orange', - L / 2 + 0.01, - L / 2 + 0.07, 0.004, 0.014, z - 0.0006, z + 0.0006, 0 );
		}
	} else if ( cal === '.50bmg' ) {
		P.box( 'od', - 0.15, 0.15, 0.0, 0.18, - 0.05, 0.05, 0.006 );
		P.box( 'od', - 0.152, 0.152, 0.165, 0.19, - 0.052, 0.052, 0.004 );
		P.box( 'blk', - 0.05, 0.05, 0.19, 0.2, - 0.008, 0.008, 0.003 );
	} else {
		const dims = cal === '12ga' ? [ 0.11, 0.07, 0.13 ] : cal === 'flare' ? [ 0.16, 0.05, 0.05 ] : [ '.22lr', '9mm', '9x18', '.45acp', '.357', '.44mag', '.50ae', '4.6x30' ].includes( cal ) ? [ 0.1, 0.035, 0.07 ] : [ 0.13, 0.045, 0.08 ];
		const box = new THREE.Mesh( new RoundedBoxGeometry( dims[ 0 ], dims[ 1 ], dims[ 2 ], 1, 0.003 ), labelMaterial( cal ) );
		box.position.y = dims[ 1 ] / 2; box.castShadow = true; box.receiveShadow = true;
		g.add( box );
		// a few loose rounds beside the box
		for ( let i = 0; i < 3; i ++ ) cartridge( P, - 0.02 + i * 0.012, ( CAL[ cal ]?.r || 0.005 ), dims[ 2 ] / 2 + 0.012 + i * 0.013, cal, null, 1 );
	}
	const o = instantiate( P.bake(), mats, true );
	g.add( o );
	return g;
}
