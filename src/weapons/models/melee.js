// Melee weapons (the arms items' by kind).
import { ARMS_MELEE } from '../../game/items/ext/arms/parts.js';
import { THREE, ARMS_H, PI, Parts, V3, grip, handle, shape } from './kit.js';

// ---- melee weapons -------------------------------------------------------------------------------------------------------
// Melee frame: +x from the pommel towards the tip / head, +y = striking edge / face, z = flat of the blade.
// info: grip (x of the main hand), grip2 (x of the second hand, two-handed), len, tip (x)

function knifeBlade( P, mat, x0, len, h, spineDrop = 0.004, clip = 0 ) {
	const pts = [ [ x0, - 0.004 ], [ x0 + len * 0.7, - 0.004 - spineDrop * 0.3 ], clip ? [ x0 + len * 0.82, - 0.001 ] : [ x0 + len * 0.85, - 0.003 ], [ x0 + len, h * 0.08, 0.004 ], [ x0 + len * 0.8, h * 0.72, 0.03 ], [ x0 + len * 0.3, h, 0.02 ], [ x0, h * 0.95 ] ];
	P.extS( mat, pts, 0.0012, 0.0011, 0, [], 4 );
}

export function meleeParts( def ) {
	const P = new Parts();
	const k = def.model?.kind || def.id;
	let info = { grip: 0.05, len: 0.3 };
	if ( ARMS_MELEE[ k ] ) return { P, info: ARMS_MELEE[ k ]( P, ARMS_H ) };
	switch ( k ) {
		case 'kitchen_knife':
			handle( P, 'poly', 0.0, 0.11, 0.011, 0.012 ); P.box( 'poly', 0.0, 0.11, - 0.012, 0.012, - 0.008, 0.008, 0.006 );
			for ( const x of [ 0.025, 0.055, 0.085 ] ) P.cylZ( 'steel', x, 0.0, - 0.0085, 0.0085, 0.0025, 8 );
			knifeBlade( P, 'blade', 0.11, 0.2, 0.042 );
			info = { grip: 0.055, len: 0.31, tip: 0.31 }; break;
		case 'hunting_knife':
			P.box( 'walnut', 0.0, 0.11, - 0.013, 0.012, - 0.009, 0.009, 0.007 );
			P.box( 'brass', 0.108, 0.116, - 0.018, 0.02, - 0.01, 0.01, 0.002 );
			knifeBlade( P, 'blade', 0.116, 0.14, 0.03, 0.006, 1 );
			info = { grip: 0.055, len: 0.256, tip: 0.256 }; break;
		case 'combat_knife':
			handle( P, 'poly', 0.0, 0.12, 0.013, 0.012, 12 );
			for ( let i = 0; i < 7; i ++ ) P.cyl( 'poly', 0.012 + i * 0.015, 0.018 + i * 0.015, 0.0142, 0, 0, 12 );
			P.box( 'darkblade', 0.118, 0.126, - 0.02, 0.024, - 0.006, 0.006, 0.002 );
			P.cyl( 'darkblade', - 0.008, 0.0, 0.014, 0, 0, 12 );
			knifeBlade( P, 'darkblade', 0.126, 0.175, 0.032, 0.006, 1 );
			info = { grip: 0.06, len: 0.3, tip: 0.3 }; break;
		case 'machete':
			P.box( 'poly', 0.0, 0.13, - 0.016, 0.014, - 0.011, 0.011, 0.008 );
			P.extS( 'blade', [ [ 0.125, - 0.012 ], [ 0.52, - 0.004 ], [ 0.585, 0.012, 0.01 ], [ 0.57, 0.05, 0.02 ], [ 0.45, 0.058, 0.03 ], [ 0.14, 0.04 ], [ 0.125, 0.03 ] ], 0.0014, 0.0012, 0, [], 4 );
			info = { grip: 0.065, len: 0.585, tip: 0.57 }; break;
		case 'cane_knife':
			P.box( 'walnut', 0.0, 0.13, - 0.015, 0.014, - 0.011, 0.011, 0.008 );
			P.extS( 'rust', [ [ 0.125, - 0.012 ], [ 0.49, - 0.01 ], [ 0.52, - 0.03, 0.01 ], [ 0.55, - 0.024 ], [ 0.54, 0.06, 0.01 ], [ 0.14, 0.05 ], [ 0.125, 0.03 ] ], 0.0016, 0.0012 );
			info = { grip: 0.065, len: 0.55, tip: 0.54 }; break;
		case 'hatchet':
			handle( P, 'wood', 0.0, 0.36, 0.014, 0.012, 10 ); P.box( 'wood', 0.0, 0.36, - 0.012, 0.014, - 0.01, 0.01, 0.008 );
			P.extS( 'blk', [ [ 0.31, - 0.03 ], [ 0.37, - 0.03 ], [ 0.375, 0.02 ], [ 0.4, 0.08, 0.004 ], [ 0.285, 0.085, 0.004 ], [ 0.31, 0.02 ] ], 0.011, 0.002 );
			P.extS( 'blade', [ [ 0.4, 0.074 ], [ 0.285, 0.079 ], [ 0.284, 0.085 ], [ 0.401, 0.08 ] ], 0.0115, 0.0005 );
			info = { grip: 0.08, len: 0.4, tip: 0.36, head: 0.34 }; break;
		case 'fire_axe':
			handle( P, 'red', 0.0, 0.86, 0.017, 0.015, 10 ); P.box( 'red', 0.0, 0.86, - 0.016, 0.018, - 0.012, 0.012, 0.01 );
			P.extS( 'red', [ [ 0.8, - 0.03 ], [ 0.88, - 0.03 ], [ 0.885, 0.03 ], [ 0.92, 0.12, 0.006 ], [ 0.77, 0.125, 0.006 ], [ 0.8, 0.03 ] ], 0.013, 0.002 );
			P.extS( 'blade', [ [ 0.92, 0.112 ], [ 0.77, 0.117 ], [ 0.77, 0.126 ], [ 0.92, 0.121 ] ], 0.0135, 0.0005 );
			P.extS( 'red', [ [ 0.81, - 0.028 ], [ 0.87, - 0.028 ], [ 0.845, - 0.13 ] ], 0.01, 0.002 );
			info = { grip: 0.08, grip2: 0.45, len: 0.92, tip: 0.86, head: 0.84 }; break;
		case 'baseball_bat':
		case 'nailed_bat': {
			const w = k === 'nailed_bat';
			P.lathe( w ? 'wood' : 'aluBright', [ [ - 0.012, 0.0 ], [ - 0.012, 0.022 ], [ 0.0, 0.024 ], [ 0.006, 0.0135 ], [ 0.3, 0.0145 ], [ 0.52, 0.03 ], [ 0.8, 0.033 ], [ 0.84, 0.03 ], [ 0.845, 0.0 ] ], 0, 0, 16 );
			if ( ! w ) P.lathe( 'rubber', [ [ 0.006, 0.0145 ], [ 0.22, 0.0155 ] ], 0, 0, 14 );
			if ( w ) for ( let i = 0; i < 14; i ++ ) { const a = i * 2.4, x = 0.58 + ( i % 5 ) * 0.05; P.rod( 'steel', [ x, Math.sin( a ) * 0.03, Math.cos( a ) * 0.03 ], [ x + 0.004, Math.sin( a ) * 0.075, Math.cos( a ) * 0.075 ], 0.0018, 5 ); }
			info = { grip: 0.07, grip2: 0.16, len: 0.845, tip: 0.8, head: 0.7 }; break;
		}
		case 'crowbar': {
			const c = new THREE.CatmullRomCurve3( [ V3( 0, 0, 0 ), V3( 0.3, 0, 0 ), V3( 0.56, 0, 0 ), V3( 0.61, 0.02, 0 ), V3( 0.63, 0.06, 0 ), V3( 0.6, 0.09, 0 ), V3( 0.56, 0.085, 0 ) ] );
			P.put( 'red', new THREE.TubeGeometry( c, 28, 0.0105, 6, false ) );
			P.extS( 'blk', [ [ - 0.03, - 0.012 ], [ 0.02, - 0.009 ], [ 0.02, 0.009 ], [ - 0.03, 0.02 ] ], 0.01, 0.002 );
			info = { grip: 0.1, len: 0.63, tip: 0.6, head: 0.58 }; break;
		}
		case 'lead_pipe':
			handle( P, 'lead', 0.0, 0.55, 0.0165, 0.0165, 12 );
			P.cyl( 'lead', 0.5, 0.57, 0.021, 0, 0, 12 );
			P.cylY( 'lead', 0.555, 0.0, 0.07, 0.019, 0, 12 );
			P.cyl( 'lead', - 0.01, 0.03, 0.02, 0, 0, 12 );
			info = { grip: 0.08, len: 0.57, tip: 0.55, head: 0.5 }; break;
		case 'sledgehammer':
			handle( P, 'wood', 0.0, 0.84, 0.017, 0.016, 10 ); P.box( 'wood', 0.0, 0.84, - 0.016, 0.017, - 0.012, 0.012, 0.01 );
			P.box( 'blk', 0.78, 0.855, - 0.085, 0.085, - 0.034, 0.034, 0.008 );
			P.box( 'steel', 0.782, 0.853, 0.082, 0.088, - 0.032, 0.032, 0.004 );
			info = { grip: 0.08, grip2: 0.4, len: 0.86, tip: 0.84, head: 0.82 }; break;
		case 'shovel':
			handle( P, 'wood', 0.0, 0.72, 0.016, 0.017, 10 );
			P.extS( 'blk', [ [ - 0.04, - 0.05 ], [ 0.0, - 0.05 ], [ 0.0, 0.05 ], [ - 0.04, 0.05 ] ], 0.011, 0.004, 0, [ [ [ - 0.034, - 0.04 ], [ - 0.006, - 0.04 ], [ - 0.006, 0.04 ], [ - 0.034, 0.04 ] ] ] );
			P.cyl( 'blk', 0.7, 0.78, 0.019, 0, 0, 10, 0.022 );
			P.extTop( 'rust', [ [ 0.77, - 0.1, 0.01 ], [ 0.77, 0.1, 0.01 ], [ 0.97, 0.09, 0.05 ], [ 1.02, 0.0, 0.02 ], [ 0.97, - 0.09, 0.05 ] ], - 0.003, 0.003, 0.001 );
			info = { grip: - 0.02, grip2: 0.5, len: 1.02, tip: 0.98, head: 0.9, flat: 1 }; break;
		case 'golf_club':
			P.cyl( 'rubber', 0.0, 0.26, 0.0125, 0, 0, 12, 0.009 );
			P.cyl( 'chrome', 0.26, 0.95, 0.0065, 0, 0, 8, 0.0045 );
			P.box( 'chrome', 0.94, 0.985, - 0.012, 0.024, - 0.045, 0.02, 0.006, [ 0, 0, 0 ] );
			info = { grip: 0.07, len: 0.99, tip: 0.96, head: 0.95 }; break;
		case 'katana': {
			P.cyl( 'cloth', 0.0, 0.26, 0.0135, 0, 0, 10, 0.0145 );
			for ( let i = 0; i < 9; i ++ ) P.boxC( 'white', 0.02 + i * 0.026, 0.0, 0.0, 0.008, 0.029, 0.026, 0.003, [ 0.785, 0, 0 ] );
			P.cyl( 'brass', - 0.012, 0.0, 0.0145, 0, 0, 10 );
			P.cyl( 'blk', 0.26, 0.27, 0.042, 0, 0, 20 );
			P.cyl( 'brass', 0.27, 0.3, 0.0115, 0, 0, 10 );
			const pts = [];
			for ( let i = 0; i <= 10; i ++ ) { const t = i / 10; pts.push( [ 0.3 + t * 0.69, - 0.012 + t * t * 0.03 ] ); }
			const back = [];
			for ( let i = 10; i >= 0; i -- ) { const t = i / 10; back.push( [ 0.3 + t * 0.66, 0.02 + t * t * 0.03 - ( t > 0.92 ? ( t - 0.92 ) * 0.5 : 0 ) ] ); }
			P.extS( 'blade', [ ...pts, [ 0.99, 0.02 ], ...back ], 0.0024, 0.0022 );
			info = { grip: 0.07, grip2: 0.18, len: 0.99, tip: 0.96, head: 0.8 }; break;
		}
		case 'tire_iron':
			handle( P, 'blued', 0.0, 0.38, 0.0105, 0.0105, 8 );
			P.cylY( 'blued', 0.375, - 0.0, 0.1, 0.0105, 0, 8 );
			P.cylY( 'blued', 0.375, 0.08, 0.12, 0.018, 0, 6 );
			P.cyl( 'blued', - 0.03, 0.0, 0.009, 0, 0, 8, 0.0105 );
			info = { grip: 0.08, len: 0.4, tip: 0.38, head: 0.36 }; break;
		case 'frying_pan':
			handle( P, 'blk', 0.0, 0.2, 0.011, 0.014, 8 ); P.box( 'blk', 0.0, 0.2, - 0.008, 0.008, - 0.014, 0.014, 0.006 );
			{
				const g = new THREE.LatheGeometry( [ new THREE.Vector2( 0.0, 0.0 ), new THREE.Vector2( 0.11, 0.0 ), new THREE.Vector2( 0.13, 0.045 ), new THREE.Vector2( 0.123, 0.046 ), new THREE.Vector2( 0.105, 0.006 ), new THREE.Vector2( 0.0, 0.006 ) ], 28 );
				g.rotateZ( PI / 2 ); // pan axis y -> -x: open side faces -y? rotate so the bottom faces +y
				g.rotateZ( - PI / 2 ); g.rotateX( PI );
				P.put( 'blk', g, [ 0.32, 0.02, 0 ] );
			}
			info = { grip: 0.08, len: 0.45, tip: 0.45, head: 0.32 }; break;
		case 'hammer':
			handle( P, 'wood', 0.0, 0.3, 0.013, 0.011, 10 ); P.box( 'wood', 0.0, 0.3, - 0.011, 0.012, - 0.009, 0.009, 0.007 );
			P.box( 'blk', 0.28, 0.315, - 0.02, 0.02, - 0.012, 0.012, 0.004 );
			P.cylY( 'blk', 0.2975, 0.02, 0.055, 0.0135, 0, 12 );
			P.extS( 'blk', [ [ 0.284, - 0.02 ], [ 0.312, - 0.02 ], [ 0.33, - 0.07, 0.01 ], [ 0.31, - 0.07 ] ], 0.01, 0.002 );
			info = { grip: 0.07, len: 0.33, tip: 0.31, head: 0.3 }; break;
		case 'wrench':
			P.box( 'red', 0.0, 0.3, - 0.013, 0.013, - 0.008, 0.008, 0.006 );
			P.box( 'steel', 0.28, 0.36, - 0.018, 0.02, - 0.011, 0.011, 0.004 );
			P.box( 'steel', 0.33, 0.37, 0.02, 0.07, - 0.01, 0.01, 0.004 );
			P.box( 'steel', 0.3, 0.33, 0.045, 0.075, - 0.01, 0.01, 0.003 );
			info = { grip: 0.08, len: 0.37, tip: 0.36, head: 0.34 }; break;
		case 'pickaxe':
			handle( P, 'wood', 0.0, 0.86, 0.017, 0.019, 10 );
			{
				const pts = [];
				for ( let i = 0; i <= 12; i ++ ) { const t = i / 12 * 2 - 1; pts.push( [ 0.83 + ( 1 - t * t ) * 0.04 + 0.012, t * 0.3 ] ); }
				for ( let i = 12; i >= 0; i -- ) { const t = i / 12 * 2 - 1; pts.push( [ 0.83 + ( 1 - t * t ) * 0.04 - 0.012 * ( 1 - Math.abs( t ) ) - 0.002, t * 0.3 ] ); }
				P.extS( 'blk', pts, 0.012, 0.002 );
			}
			info = { grip: 0.08, grip2: 0.45, len: 0.9, tip: 0.86, head: 0.85 }; break;
		case 'fishing_spear':
			handle( P, 'tan', 0.0, 1.75, 0.0095, 0.0095, 8 );
			P.cyl( 'orange', 0.02, 0.1, 0.012, 0, 0, 8 );
			for ( const z of [ - 0.012, 0, 0.012 ] ) { P.rod( 'steel', [ 1.74, 0, 0 ], [ 1.98, 0, z * 2.5 ], 0.0022, 5 ); P.rod( 'steel', [ 1.97, 0, z * 2.5 ], [ 1.99, 0.004, z * 2.5 ], 0.003, 5, 0.0003 ); }
			info = { grip: 0.6, grip2: 1.0, len: 1.99, tip: 1.98, head: 1.9, spear: 1 }; break;
		case 'canoe_paddle':
			handle( P, 'koa', 0.0, 1.0, 0.016, 0.017, 10 );
			P.box( 'koa', - 0.03, 0.02, - 0.05, 0.05, - 0.014, 0.014, 0.012 );
			P.extTop( 'koa', [ [ 0.95, - 0.03, 0.02 ], [ 0.95, 0.03, 0.02 ], [ 1.1, 0.085, 0.06 ], [ 1.4, 0.09, 0.08 ], [ 1.42, 0.0, 0.03 ], [ 1.4, - 0.09, 0.08 ], [ 1.1, - 0.085, 0.06 ] ], - 0.006, 0.006, 0.003 );
			info = { grip: 0.0, grip2: 0.55, len: 1.42, tip: 1.4, head: 1.2, flat: 1 }; break;
		case 'police_baton':
			P.cyl( 'rubber', 0.0, 0.19, 0.0125, 0, 0, 12 );
			P.cyl( 'blued', 0.19, 0.38, 0.0095, 0, 0, 10 );
			P.cyl( 'blued', 0.38, 0.54, 0.0075, 0, 0, 10 );
			P.sphere( 'blued', 0.545, 0, 0, 0.0095, 10 );
			info = { grip: 0.08, len: 0.55, tip: 0.54, head: 0.48 }; break;
		case 'broken_bottle':
			P.lathe( 'glassG', [ [ - 0.004, 0.0125 ], [ 0.0, 0.0135 ], [ 0.012, 0.0125 ], [ 0.08, 0.0135 ], [ 0.12, 0.03 ], [ 0.14, 0.034 ] ], 0, 0, 14 );
			for ( let i = 0; i < 6; i ++ ) {
				const a = i / 6 * PI * 2, h = 0.03 + ( i % 3 ) * 0.025;
				P.put( 'glassG', new THREE.ExtrudeGeometry( shape( [ [ - 0.012, 0 ], [ 0.012, 0 ], [ 0.002, h ] ] ), { depth: 0.002, bevelEnabled: false } ), [ 0.14, Math.sin( a ) * 0.033, Math.cos( a ) * 0.033 ], [ a, 0, - PI / 2 ] );
			}
			info = { grip: 0.05, len: 0.2, tip: 0.19, head: 0.17 }; break;
		default:
			handle( P, 'wood', 0, 0.4, 0.015 );
			info = { grip: 0.08, len: 0.4, tip: 0.4 };
	}
	return { P, info };
}

