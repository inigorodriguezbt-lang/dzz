// Thrown weapons: grenades, the molotov (the arms items' by kind).
import { ARMS_THROW } from '../../game/items/ext/arms/parts.js';
import { THREE, ARMS_H, PI, Parts, V3 } from './kit.js';

// ---- throwables -------------------------------------------------------------------------------------------------------------
// Frame: centred on the body, fuse / neck up (+y).

export function throwableParts( def ) {
	const P = new Parts();
	const k = def.model?.kind;
	if ( ARMS_THROW[ k ] ) { ARMS_THROW[ k ]( P, ARMS_H ); return { P }; }
	if ( k === 'frag' ) {
		P.sphere( 'od', 0, 0, 0, 0.032, 16, [ 1, 1.08, 1 ] );
		P.cylY( 'od', 0, 0.028, 0.045, 0.012, 0, 10 );
		P.box( 'blk', - 0.006, 0.006, 0.036, 0.05, - 0.009, 0.009, 0.002 );
		const spoon = new THREE.CatmullRomCurve3( [ V3( 0.0, 0.048, 0 ), V3( 0.02, 0.046, 0 ), V3( 0.033, 0.02, 0 ), V3( 0.036, - 0.02, 0 ) ] );
		P.put( 'blk', new THREE.TubeGeometry( spoon, 10, 0.004, 4, false ), null, null, [ 1, 1, 2.2 ] );
		P.torusX( 'steel', - 0.002, 0.04, 0.02, 0.011, 0.0012, 16 );
		P.put( 'steel', new THREE.TorusGeometry( 0.011, 0.0012, 5, 16 ).rotateX( PI / 2 ), [ - 0.004, 0.04, 0.032 ] );
	} else if ( k === 'smoke' ) {
		P.cylY( 'gray', 0, - 0.055, 0.05, 0.03, 0, 18 );
		P.cylY( 'white', 0, 0.035, 0.05, 0.0305, 0, 18 );
		P.cylY( 'blk', 0, 0.05, 0.065, 0.012, 0, 10 );
		P.box( 'blk', 0.0, 0.03, 0.05, 0.062, - 0.005, 0.005, 0.002 );
		P.put( 'steel', new THREE.TorusGeometry( 0.011, 0.0012, 5, 16 ).rotateX( PI / 2 ), [ - 0.004, 0.064, 0.02 ] );
	} else if ( k === 'flash' ) {
		P.cylY( 'blk', 0, - 0.055, 0.045, 0.024, 0, 16 );
		for ( let r = 0; r < 3; r ++ ) for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2 + r * 0.4; P.cylZ( 'rubber', Math.cos( a ) * 0.0235, - 0.03 + r * 0.025, Math.sin( a ) * 0.0235 - 0.003, Math.sin( a ) * 0.0235 + 0.003, 0.0045, 6 ); }
		P.cylY( 'gray', 0, 0.045, 0.06, 0.011, 0, 10 );
		P.box( 'gray', 0.0, 0.028, 0.045, 0.056, - 0.005, 0.005, 0.002 );
		P.put( 'steel', new THREE.TorusGeometry( 0.011, 0.0012, 5, 16 ).rotateX( PI / 2 ), [ - 0.004, 0.058, 0.02 ] );
	} else {
		// molotov
		P.lathe( 'glassG', [ [ - 0.09, 0.0 ], [ - 0.09, 0.03 ], [ - 0.085, 0.034 ], [ 0.03, 0.034 ], [ 0.06, 0.016 ], [ 0.1, 0.012 ], [ 0.105, 0.013 ] ], 0, 0, 16 );
		P.lathe( 'fuel', [ [ - 0.085, 0.0 ], [ - 0.085, 0.03 ], [ 0.0, 0.031 ], [ 0.0, 0.0 ] ], 0, 0, 14 );
		P.cyl( 'rag', 0.08, 0.14, 0.011, 0, 0, 8, 0.014 );
		P.boxC( 'rag', 0.14, - 0.01, 0.0, 0.05, 0.004, 0.02, 0.002, [ 0, 0, - 0.9 ] );
		const g = P.geo;
		// the bottle is modelled along x: stand it up
		for ( const k2 in g ) for ( const geo of g[ k2 ] ) geo.rotateZ( PI / 2 );
	}
	return { P };
}
