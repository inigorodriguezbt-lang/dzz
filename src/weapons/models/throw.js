// Thrown weapons: grenades, the molotov (the arms items' by kind).
import { ARMS_THROW } from '../../game/items/ext/arms/parts.js';
import { THREE, ARMS_H, PI, Parts } from './kit.js';

// ---- throwables -------------------------------------------------------------------------------------------------------------
// Frame: centred on the body, fuse / neck up (+y). Each is drawn along +x (lathes turn about x) and stood up at the end.

// linear lookup in a lathe profile [ [ x, r ], ... ] (x increasing)
function radiusAt( prof, x ) {
	if ( x <= prof[ 0 ][ 0 ] ) return prof[ 0 ][ 1 ];
	for ( let i = 1; i < prof.length; i ++ ) {
		const [ x1, r1 ] = prof[ i ], [ x0, r0 ] = prof[ i - 1 ];
		if ( x <= x1 ) return r0 + ( r1 - r0 ) * ( x - x0 ) / Math.max( 1e-6, x1 - x0 );
	}
	return prof[ prof.length - 1 ][ 1 ];
}

// a strip of sheet metal along a side path [ [ x, y ], ... ] (its outer face), t thick, 2 * hz wide
function strip( P, mat, path, t, hz, zc = 0 ) {
	const out = [], inn = [];
	for ( let i = 0; i < path.length; i ++ ) {
		const a = path[ Math.max( 0, i - 1 ) ], b = path[ Math.min( path.length - 1, i + 1 ) ];
		const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], l = Math.hypot( dx, dy ) || 1;
		// the inner face: towards the axis side of the path's direction
		const nx = dy / l, ny = - dx / l;
		out.push( [ path[ i ][ 0 ], path[ i ][ 1 ] ] );
		inn.push( [ path[ i ][ 0 ] - nx * t, path[ i ][ 1 ] - ny * t ] );
	}
	P.extS( mat, [ ...out, ...inn.reverse() ], hz, Math.min( 0.0005, t * 0.4, hz * 0.9 ), zc, [], 2 );
}

// The M2xx fuze every US hand grenade shares: a stepped steel body screwed into the filler, the striker lever
// (spoon) hooked over its head and run down the side over the body, the pin through the lugs and its pull ring.
// x0: where the fuze leaves the body; body: the body's profile (the spoon follows it, 2 mm proud)
function fuze( P, x0, body, spoonTo ) {
	const top = x0 + 0.018;
	P.lathe( 'blk', [ [ x0 - 0.002, 0.0104 ], [ x0 + 0.001, 0.0108 ], [ x0 + 0.002, 0.0098 ], [ x0 + 0.008, 0.0098 ], [ x0 + 0.0088, 0.0091 ],
		[ top - 0.004, 0.0091 ], [ top - 0.003, 0.0074 ], [ top - 0.001, 0.0068 ], [ top, 0.0052 ], [ top + 0.0004, 0 ] ], 0, 0, 16 );
	// the lugs the lever pivots in, and the striker's spring housing between them
	for ( const s of [ - 1, 1 ] ) P.box( 'blk', top - 0.012, top - 0.002, 0.005, 0.0108, s * 0.0058, s * 0.0078, 0.0008 );
	P.boxC( 'blk', top - 0.006, 0.0094, 0, 0.007, 0.004, 0.0098, 0.001 );
	// the lever: over the head (the hook), down the fuze, then out over the shoulder and down the side
	const path = [ [ top - 0.0035, 0.0025 ], [ top + 0.0012, 0.0045 ], [ top + 0.0016, 0.0095 ], [ top - 0.001, 0.0128 ], [ top - 0.008, 0.0128 ], [ x0 + 0.002, 0.0132 ] ];
	for ( let x = x0 - 0.002; x > spoonTo; x -= 0.0045 ) path.push( [ x, Math.max( 0.0132, radiusAt( body, x ) + 0.0021 ) ] );
	path.push( [ spoonTo, radiusAt( body, spoonTo ) + 0.0016 ] );
	strip( P, 'olivM', path, 0.0011, 0.0062 );
	// the lever's rolled edges (it's a channel, not a flat strip): stiff lips down the side
	const lip = path.slice( 5 ).map( ( [ x, y ] ) => [ x, y - 0.0008 ] );
	for ( const s of [ - 1, 1 ] ) strip( P, 'olivM', lip, 0.0018, 0.0006, s * 0.0056 );
	// the pin through the lugs (its split end on the far side), the pull ring hanging off the near side
	P.cylZ( 'steel', top - 0.007, 0.0082, - 0.0098, 0.0118, 0.0009, 6 );
	P.cylZ( 'steel', top - 0.007, 0.0082, - 0.0125, - 0.0098, 0.0012, 6, 0.0006 );
	P.put( 'steel', new THREE.TorusGeometry( 0.0105, 0.00115, 5, 18 ).rotateX( PI / 2 ).rotateZ( - 0.35 ), [ top - 0.012, 0.0075, 0.0225 ] );
	// the safety clip: a wire bail over the lever and round the fuze
	P.put( 'steel', new THREE.TorusGeometry( 0.0146, 0.0006, 4, 14, PI * 1.2 ).rotateY( PI / 2 ).rotateX( - PI * 0.1 ), [ x0 + 0.004, 0, 0 ] );
	return top;
}

export function throwableParts( def ) {
	const P = new Parts();
	const k = def.model?.kind;
	if ( ARMS_THROW[ k ] ) { ARMS_THROW[ k ]( P, ARMS_H ); return { P }; }
	if ( k === 'frag' ) {
		// M67: a smooth painted steel sphere a touch taller than wide, the yellow HE band under the shoulder
		const body = [ [ - 0.0345, 0.0 ], [ - 0.0342, 0.0065 ], [ - 0.0322, 0.0155 ], [ - 0.0272, 0.0238 ], [ - 0.0195, 0.0293 ], [ - 0.0095, 0.0322 ],
			[ 0.0, 0.0328 ], [ 0.0095, 0.0318 ], [ 0.0185, 0.0282 ], [ 0.0255, 0.0222 ], [ 0.0302, 0.015 ], [ 0.0322, 0.0118 ], [ 0.0326, 0.0105 ] ];
		P.lathe( 'olivM', body, 0, 0, 22 );
		const band = ( x ) => radiusAt( body, x ) + 0.0003;
		P.lathe( 'yellow', [ [ 0.0125, band( 0.0125 ) ], [ 0.0185, band( 0.0185 ) ] ], 0, 0, 22 );
		// the weld seam round the equator, the filler plug's ring under the fuze
		P.lathe( 'olivM', [ [ - 0.0016, 0.0328 ], [ - 0.0006, 0.0332 ], [ 0.0006, 0.0332 ], [ 0.0016, 0.0328 ] ], 0, 0, 22 );
		P.lathe( 'olivM', [ [ - 0.0346, 0.0 ], [ - 0.0347, 0.004 ], [ - 0.0343, 0.0058 ] ], 0, 0, 12 );
		fuze( P, 0.0325, body, - 0.002 );
	} else if ( k === 'smoke' ) {
		// M18-style can: rolled seams top and bottom, the colour band and the burst holes in the top
		P.lathe( 'olivM', [ [ - 0.0575, 0.0 ], [ - 0.058, 0.0295 ], [ - 0.0575, 0.0322 ], [ - 0.0555, 0.0324 ], [ - 0.0538, 0.0312 ],
			[ 0.0452, 0.0312 ], [ 0.0468, 0.0324 ], [ 0.049, 0.0322 ], [ 0.0496, 0.0292 ], [ 0.0492, 0.012 ], [ 0.0496, 0.0 ] ], 0, 0, 24 );
		P.lathe( 'white', [ [ 0.031, 0.0315 ], [ 0.043, 0.0315 ] ], 0, 0, 24 );
		P.lathe( 'blk', [ [ - 0.012, 0.0314 ], [ - 0.009, 0.0314 ] ], 0, 0, 24 );
		for ( let i = 0; i < 4; i ++ ) {
			const a = i / 4 * PI * 2 + PI / 4;
			P.cyl( 'rubber', 0.0494, 0.0499, 0.0045, Math.sin( a ) * 0.021, Math.cos( a ) * 0.021, 10 );
		}
		fuze( P, 0.0495, [ [ - 0.06, 0.0312 ], [ 0.045, 0.0312 ], [ 0.0495, 0.0292 ] ], - 0.035 );
	} else if ( k === 'flash' ) {
		// M84 stun: a steel tube punched with rows of big ports, flanged end caps
		P.lathe( 'alu', [ [ - 0.0555, 0.0 ], [ - 0.0555, 0.0232 ], [ - 0.0545, 0.0258 ], [ - 0.048, 0.0258 ], [ - 0.0475, 0.0244 ],
			[ 0.0375, 0.0244 ], [ 0.038, 0.0258 ], [ 0.0445, 0.0258 ], [ 0.0455, 0.0232 ], [ 0.0455, 0.0 ] ], 0, 0, 20 );
		for ( let r = 0; r < 3; r ++ ) for ( let i = 0; i < 6; i ++ ) {
			const a = i / 6 * PI * 2 + ( r % 2 ) * PI / 6, x = - 0.031 + r * 0.0255;
			const cy = Math.sin( a ), cz = Math.cos( a );
			// a port: a dark bore with a pressed lip
			P.put( 'rubber', new THREE.CircleGeometry( 0.0066, 10 ).rotateX( - a ), [ x, cy * 0.02455, cz * 0.02455 ] );
			P.put( 'alu', new THREE.TorusGeometry( 0.0072, 0.0009, 3, 10 ).rotateX( - a ), [ x, cy * 0.0246, cz * 0.0246 ] );
		}
		fuze( P, 0.0455, [ [ - 0.06, 0.0244 ], [ 0.0375, 0.0244 ], [ 0.038, 0.0258 ], [ 0.0455, 0.0232 ] ], - 0.03 );
	} else {
		// molotov: a green bottle (punted base, shoulder, neck lip), fuel to the shoulder, a torn label, a rag in
		// the neck tied off with string and hanging down the side
		const glass = [ [ - 0.086, 0.0 ], [ - 0.0875, 0.009 ], [ - 0.0902, 0.0225 ], [ - 0.0902, 0.0288 ], [ - 0.0885, 0.0318 ], [ - 0.085, 0.0328 ],
			[ 0.018, 0.0328 ], [ 0.032, 0.0306 ], [ 0.046, 0.0238 ], [ 0.058, 0.0165 ], [ 0.068, 0.0132 ], [ 0.094, 0.0124 ], [ 0.0955, 0.0146 ],
			[ 0.1015, 0.0148 ], [ 0.103, 0.0128 ], [ 0.103, 0.0102 ] ];
		P.lathe( 'glassG', glass, 0, 0, 20 );
		P.lathe( 'fuel', [ [ - 0.084, 0.0 ], [ - 0.084, 0.03 ], [ - 0.082, 0.0312 ], [ 0.012, 0.0312 ], [ 0.0125, 0.0 ] ], 0, 0, 16 );
		{
			const L = new THREE.LatheGeometry( [ new THREE.Vector2( 0.0332, - 0.062 ), new THREE.Vector2( 0.0332, - 0.012 ) ], 14, 0.4, 4.3 );
			L.rotateZ( - PI / 2 );
			P.put( 'card', L );
		}
		// the rag: wadded into the neck, bunched over the lip, a tail lying down the neck and shoulder
		P.cyl( 'rag', 0.088, 0.108, 0.0098, 0, 0, 8, 0.0122 );
		P.sphere( 'rag', 0.113, 0.0015, 0.0, 0.0148, 9, [ 0.75, 1, 1.1 ] );
		P.sphere( 'rag', 0.121, - 0.004, 0.003, 0.0105, 7, [ 0.8, 1, 0.9 ] );
		const tail = [];
		for ( let x = 0.112; x > 0.028; x -= 0.007 ) tail.push( [ x, radiusAt( glass, x ) + 0.0028 + ( x > 0.104 ? ( x - 0.104 ) * 0.6 : 0 ) ] );
		strip( P, 'rag', tail, 0.0022, 0.0085, 0.0035 );
		P.torusX( 'string', 0.098, 0, 0, 0.0136, 0.0011, 16 );
	}
	// drawn along x: stand it up (+x -> +y)
	for ( const k2 in P.geo ) for ( const geo of P.geo[ k2 ] ) geo.rotateZ( PI / 2 );
	return { P };
}
