// Melee weapons (the arms items' by kind).
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARMS_MELEE } from '../../game/items/ext/arms/parts.js';
import { THREE, ARMS_H, PI, Parts, V3, circle, edge, shape, screw } from './kit.js';

// ---- melee weapons -------------------------------------------------------------------------------------------------------
// Melee frame: +x from the pommel towards the tip / head, +y the back of a blade (its edge faces -y; an axe's bit
// and a hammer's face are +y), z the flat of the blade.
// info: grip (x of the main hand), grip2 (x of the second hand, two-handed), len, tip (x), head (x), flat (lies flat)

// one triangle into T ( [ x, y, z, wear ] per vertex ), wound to face n
function tri( T, a, b, c, n, w = 0 ) {
	const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ], vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
	if ( ( uy * vz - uz * vy ) * n[ 0 ] + ( uz * vx - ux * vz ) * n[ 1 ] + ( ux * vy - uy * vx ) * n[ 2 ] < 0 ) [ b, c ] = [ c, b ];
	T.push( ...a, w, ...b, w, ...c, w );
}
const quad = ( T, a, b, c, d, n, w ) => { tri( T, a, b, c, n, w ); tri( T, a, c, d, n, w ); };
function toGeo( T, crease = 0 ) {
	const n = T.length / 4, p = new Float32Array( n * 3 ), w = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) { p[ i * 3 ] = T[ i * 4 ]; p[ i * 3 + 1 ] = T[ i * 4 + 1 ]; p[ i * 3 + 2 ] = T[ i * 4 + 2 ]; w[ i ] = T[ i * 4 + 3 ]; }
	let g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( p, 3 ) );
	g.computeVertexNormals();
	if ( crease ) g = toCreasedNormals( g, crease );
	g.setAttribute( 'wear', new THREE.BufferAttribute( w, 1 ) );
	return g;
}
const flat = ( g ) => edge( toCreasedNormals( g, 0.4 ), 'box' );

// A blade lofted through stations [ x, yEdge, yGrind, ySpine, t, tSpine ]: the flats (half thickness t at the grind
// line, tSpine at the back, its corners broken) down to the grind line, then the bevel to a fine edge in its own,
// brighter finish. o.up: the edge faces +y (an axe's bit: the ys run the other way). o.hamon: per station, the y
// a frosted band along the edge reaches. o.sw: wear on the back's corners (a coated blade shows steel there).
function blade( P, flatM, bevM, st, o = {} ) {
	const sg = o.up ? - 1 : 1, te = 0.00015;
	const F = [], B = [], H = [];
	const pt = ( x, y, z ) => [ x, y * sg, z ];
	const nrm = ( x, y, z ) => [ x, y * sg, z ];
	const sec = ( s, z ) => {
		const [ x, yE0, yG0, yS0, t, ts = t ] = s;
		const yE = yE0 * sg, yG = yG0 * sg, yS = yS0 * sg, c = Math.max( 0, Math.min( ts * 0.45, 0.0005, ( yS - yG ) * 0.4 ) );
		const q = { E: pt( x, yE, z * te ), G: pt( x, yG, z * t ), S: pt( x, yS - c, z * ts ), C: pt( x, yS, z * Math.max( 0, ts - c ) ) };
		if ( o.hamon ) {
			const yH = o.hamon[ st.indexOf( s ) ] * sg, f = Math.min( 1, Math.max( 0, ( yH - yE ) / Math.max( 1e-6, yG - yE ) ) );
			q.H = pt( x, yH, z * ( te + ( t - te ) * f ) );
		}
		return q;
	};
	for ( let i = 0; i + 1 < st.length; i ++ ) {
		for ( const z of [ - 1, 1 ] ) {
			const a = sec( st[ i ], z ), b = sec( st[ i + 1 ], z ), n = [ 0, 0, z ];
			if ( o.hamon ) { quad( H, a.E, b.E, b.H, a.H, n ); quad( B, a.H, b.H, b.G, a.G, n ); }
			else quad( B, a.E, b.E, b.G, a.G, n );
			quad( F, a.G, b.G, b.S, a.S, n );
			quad( F, a.S, b.S, b.C, a.C, n, o.sw || 0 );
		}
		const a0 = sec( st[ i ], - 1 ), a1 = sec( st[ i ], 1 ), b0 = sec( st[ i + 1 ], - 1 ), b1 = sec( st[ i + 1 ], 1 );
		quad( F, a0.C, b0.C, b1.C, a1.C, nrm( 0, 1, 0 ), o.sw || 0 );
		quad( o.hamon ? H : B, a0.E, b0.E, b1.E, a1.E, nrm( 0, - 1, 0 ) );
	}
	// the ends: the heel (in the guard, mostly) and a blunt nose
	for ( const [ s, d ] of [ [ st[ 0 ], - 1 ], [ st[ st.length - 1 ], 1 ] ] ) {
		const a = sec( s, - 1 ), b = sec( s, 1 ), ring = [ a.E, a.G, a.S, a.C, b.C, b.S, b.G, b.E ];
		const m = ring.reduce( ( p, v ) => [ p[ 0 ] + v[ 0 ] / 8, p[ 1 ] + v[ 1 ] / 8, p[ 2 ] + v[ 2 ] / 8 ], [ 0, 0, 0 ] );
		for ( let k = 0; k < 8; k ++ ) tri( F, m, ring[ k ], ring[ ( k + 1 ) % 8 ], [ d, 0, 0 ] );
	}
	P.put( flatM, toGeo( F, 0.12 ) );
	P.put( bevM, toGeo( B, 0.12 ) );
	if ( H.length ) P.put( 'hamon', toGeo( H, 0.12 ) );
}

// knife stations from an outline: the back's and the edge's y at each x, the grind's height as a fraction of the
// depth, the half thickness; the point thins away unless blunt
function knife( xs, spine, edgeY, gf, t, ts = t * 1.15, blunt = false ) {
	const n = xs.length;
	return xs.map( ( x, i ) => {
		const u = i / ( n - 1 ), k = blunt ? 1 : Math.max( 0.06, 1 - u ** 3 * 0.94 ), yE = edgeY[ i ], yS = spine[ i ];
		return [ x, yE, yE + gf * ( yS - yE ), yS, t * k, ts * k ];
	} );
}

// an axe's bit from x0 to x1 (edge up): the edge a shallow curve peaking at yEdge, the cheeks thickening back to
// the eye at yBack, heel and toe sweeping up
function axeBit( x0, x1, yEdge, yBack, t ) {
	const st = [];
	for ( let i = 0; i <= 12; i ++ ) {
		const u = i / 12, a = Math.abs( u * 2 - 1 );
		const yE = yEdge - ( yEdge - yBack ) * 0.13 * a * a;
		const yS = yBack + ( yE - yBack - 0.007 ) * Math.pow( Math.max( 0, ( a - 0.42 ) / 0.58 ), 1.3 );
		const yG = Math.max( yS + 0.0015, yE - Math.min( 0.011, ( yE - yS ) * 0.55 ) );
		const tt = t * ( 1 - 0.5 * a * a );
		st.push( [ x0 + u * ( x1 - x0 ), yE, yG, yS, tt, tt * 1.5 ] );
	}
	return st;
}

// a forged bar through cross-sections [ x, y, hx, hz ] stacked along y (a pick's head)
function bar( P, mat, st ) {
	const T = [];
	const c = ( s, k ) => { const [ x, y, hx, hz ] = s; return [ [ x + hx, y, hz ], [ x + hx, y, - hz ], [ x - hx, y, - hz ], [ x - hx, y, hz ] ][ k ]; };
	const N = [ [ 1, 0, 0 ], [ 0, 0, - 1 ], [ - 1, 0, 0 ], [ 0, 0, 1 ] ];
	for ( let i = 0; i + 1 < st.length; i ++ ) for ( let k = 0; k < 4; k ++ ) quad( T, c( st[ i ], k ), c( st[ i ], ( k + 1 ) % 4 ), c( st[ i + 1 ], ( k + 1 ) % 4 ), c( st[ i + 1 ], k ), N[ k ], 0.3 );
	const d = Math.sign( st[ st.length - 1 ][ 1 ] - st[ 0 ][ 1 ] );
	for ( const [ s, n ] of [ [ st[ 0 ], - d ], [ st[ st.length - 1 ], d ] ] ) quad( T, c( s, 0 ), c( s, 1 ), c( s, 2 ), c( s, 3 ), [ 0, n, 0 ], 0.3 );
	P.put( mat, toGeo( T ) );
}

// A curved sheet (a shovel's blade, a paddle's): f( u, v ) -> [ x, y, z, t ], u along it 0..1, v across -1..1, t half
// its thickness (in y). Smooth faces on both sides, a flat rim round it (rimWear: a worn bright edge).
function sheet( P, mat, nu, nv, f, rimWear = 0 ) {
	const top = [], bot = [];
	for ( let i = 0; i <= nu; i ++ ) for ( let j = 0; j <= nv; j ++ ) {
		const [ x, y, z, t ] = f( i / nu, j / nv * 2 - 1 );
		top.push( [ x, y + t, z ] ); bot.push( [ x, y - t, z ] );
	}
	const id = ( i, j ) => i * ( nv + 1 ) + j, N = top.length;
	const pos = [], idx = [];
	for ( const p of top ) pos.push( ...p );
	for ( const p of bot ) pos.push( ...p );
	for ( let i = 0; i < nu; i ++ ) for ( let j = 0; j < nv; j ++ ) {
		const a = id( i, j ), b = id( i, j + 1 ), c = id( i + 1, j ), d = id( i + 1, j + 1 );
		idx.push( a, b, c, b, d, c, N + a, N + c, N + b, N + b, N + c, N + d );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	P.put( mat, edge( g, 0 ) );
	// the rim: round the boundary, top to bottom
	const loop = [];
	for ( let i = 0; i <= nu; i ++ ) loop.push( id( i, 0 ) );
	for ( let j = 1; j <= nv; j ++ ) loop.push( id( nu, j ) );
	for ( let i = nu - 1; i >= 0; i -- ) loop.push( id( i, nv ) );
	for ( let j = nv - 1; j > 0; j -- ) loop.push( id( 0, j ) );
	const cx = top.reduce( ( s, p ) => s + p[ 0 ], 0 ) / N, cz = top.reduce( ( s, p ) => s + p[ 2 ], 0 ) / N;
	const T = [];
	for ( let k = 0; k < loop.length; k ++ ) {
		const p = loop[ k ], q = loop[ ( k + 1 ) % loop.length ];
		const n = [ ( top[ p ][ 0 ] + top[ q ][ 0 ] ) / 2 - cx, 0, ( top[ p ][ 2 ] + top[ q ][ 2 ] ) / 2 - cz ];
		quad( T, top[ p ], top[ q ], bot[ q ], bot[ p ], n, rimWear );
	}
	P.put( mat, toGeo( T ) );
}

// an oval lathe along x: prof [ [ x, r ], ... ], the z radius sz of the y one
function ovalLathe( P, mat, prof, seg, sz ) {
	const g = new THREE.LatheGeometry( prof.map( ( [ x, r ] ) => new THREE.Vector2( Math.max( r, 1e-4 ), x ) ), seg );
	g.rotateZ( - PI / 2 ); g.scale( 1, 1, sz );
	return P.put( mat, g );
}
// a lathe about y: prof [ [ r, y ], ... ] at ( x, 0, 0 )
function latheY( P, mat, prof, x, seg = 14, phase = 0 ) {
	return P.put( mat, new THREE.LatheGeometry( prof.map( ( [ r, y ] ) => new THREE.Vector2( Math.max( r, 1e-4 ), y ) ), seg, phase ), [ x, 0, 0 ] );
}
// handle scales riveted either side of a full tang (the tang's steel shows between them round the edge)
function scales( P, mat, pts, hz, tang = 0.0012, tangMat = 'satin' ) {
	P.extS( tangMat, pts, tang, 0.0003 );
	const h = ( hz - tang ) / 2;
	for ( const s of [ - 1, 1 ] ) P.extR( mat, pts, h, Math.min( 0.003, h * 0.9 ), s * ( tang + h ) );
}
function radiusAt( prof, x ) {
	if ( x <= prof[ 0 ][ 0 ] ) return prof[ 0 ][ 1 ];
	for ( let i = 1; i < prof.length; i ++ ) if ( x <= prof[ i ][ 0 ] ) {
		const [ x0, r0 ] = prof[ i - 1 ], [ x1, r1 ] = prof[ i ];
		return r0 + ( r1 - r0 ) * ( x - x0 ) / Math.max( 1e-6, x1 - x0 );
	}
	return prof[ prof.length - 1 ][ 1 ];
}
// a tool handle seen from the side ( [ x, y, r ] ), radiused into an oval
const toolHandle = ( P, mat, pts, hz, r ) => P.extR( mat, pts, hz, r );

export function meleeParts( def ) {
	const P = new Parts();
	const k = def.model?.kind || def.id;
	let info = { grip: 0.05, len: 0.3 };
	if ( ARMS_MELEE[ k ] ) return { P, info: ARMS_MELEE[ k ]( P, ARMS_H ) };
	switch ( k ) {
		case 'kitchen_knife': {
			// a chef's knife: black scales riveted to a full tang, a forged bolster, a flat grind with a belly
			const hp = [ [ 0.0, - 0.003, 0.006 ], [ 0.006, - 0.0105, 0.005 ], [ 0.06, - 0.0102, 0.03 ], [ 0.104, - 0.0086 ], [ 0.104, 0.0118 ], [ 0.06, 0.0124, 0.04 ], [ 0.004, 0.011, 0.005 ] ];
			scales( P, 'poly', hp, 0.0084, 0.0012 );
			for ( const x of [ 0.024, 0.053, 0.082 ] ) P.cylZ( 'satin', x, 0.0008, - 0.0087, 0.0087, 0.0022, 10 );
			P.extR( 'satin', [ [ 0.103, - 0.0088 ], [ 0.113, - 0.0112, 0.003 ], [ 0.12, - 0.0175 ], [ 0.1215, - 0.0175 ], [ 0.1215, 0.0128 ], [ 0.103, 0.0124 ] ], 0.0062, 0.0018 );
			blade( P, 'satin', 'blade', knife( [ 0.12, 0.15, 0.19, 0.23, 0.26, 0.28, 0.293, 0.302, 0.308, 0.312 ],
				[ 0.0122, 0.012, 0.0114, 0.0104, 0.009, 0.0072, 0.0054, 0.0034, 0.0016, 0.0002 ],
				[ - 0.0302, - 0.0304, - 0.03, - 0.0286, - 0.0252, - 0.0205, - 0.0156, - 0.009, - 0.0042, 0.0 ], 0.55, 0.0011 ) );
			info = { grip: 0.055, len: 0.31, tip: 0.31 }; break;
		}
		case 'hunting_knife': {
			// a clip-point hunter: walnut scales with a palm swell, brass guard and pommel, a hollow-ground blade
			const hp = [ [ 0.006, - 0.0098, 0.004 ], [ 0.03, - 0.012, 0.012 ], [ 0.07, - 0.0105, 0.014 ], [ 0.092, - 0.0122, 0.006 ], [ 0.108, - 0.0108 ], [ 0.108, 0.0108 ], [ 0.06, 0.0118, 0.03 ], [ 0.006, 0.0102, 0.004 ] ];
			scales( P, 'walnut', hp, 0.0092, 0.0013 );
			for ( const x of [ 0.028, 0.08 ] ) P.cylZ( 'brass', x, 0.0, - 0.0095, 0.0095, 0.0024, 10 );
			P.extR( 'brass', [ [ 0.107, - 0.019, 0.002 ], [ 0.1155, - 0.0205, 0.002 ], [ 0.1155, 0.0175, 0.002 ], [ 0.107, 0.0165, 0.002 ] ], 0.0068, 0.0016 );
			P.extR( 'brass', [ [ - 0.004, - 0.0095, 0.004 ], [ 0.007, - 0.0102 ], [ 0.007, 0.0105 ], [ - 0.004, 0.0098, 0.004 ] ], 0.0094, 0.003 );
			blade( P, 'satin', 'blade', knife( [ 0.115, 0.13, 0.17, 0.2, 0.218, 0.232, 0.243, 0.25, 0.255, 0.258 ],
				[ 0.0088, 0.009, 0.009, 0.0088, 0.0078, 0.0052, 0.0024, - 0.0004, - 0.0026, - 0.0042 ],
				[ - 0.0165, - 0.0188, - 0.0195, - 0.018, - 0.0157, - 0.0125, - 0.0094, - 0.0068, - 0.0052, - 0.0042 ], 0.42, 0.0018 ) );
			info = { grip: 0.055, len: 0.256, tip: 0.256 }; break;
		}
		case 'combat_knife': {
			// KA-BAR: grooved stacked-leather washers (oval), a steel guard and pommel, a coated clip point whose back
			// corners have worn to steel
			const prof = [ [ 0.0, 0.0112 ] ];
			for ( let i = 0; i < 9; i ++ ) {
				const x = 0.003 + i * 0.0125, r = 0.0134 + Math.sin( ( i + 0.5 ) / 9 * PI ) * 0.0012;
				prof.push( [ x, r - 0.001 ], [ x + 0.0012, r ], [ x + 0.0113, r ], [ x + 0.0125, r - 0.001 ] );
			}
			ovalLathe( P, 'leather', prof, 14, 0.78 );
			ovalLathe( P, 'darkblade', [ [ - 0.013, 0.0 ], [ - 0.013, 0.0085 ], [ - 0.009, 0.0128 ], [ 0.001, 0.0128 ], [ 0.001, 0.011 ] ], 12, 0.8 );
			P.extR( 'darkblade', [ [ 0.115, - 0.0235, 0.003 ], [ 0.122, - 0.0235, 0.003 ], [ 0.122, 0.0205, 0.003 ], [ 0.115, 0.0205, 0.003 ] ], 0.0062, 0.0018 );
			blade( P, 'darkblade', 'blade', knife( [ 0.121, 0.14, 0.19, 0.232, 0.255, 0.27, 0.283, 0.292, 0.298, 0.301 ],
				[ 0.0098, 0.0101, 0.0101, 0.0099, 0.0078, 0.0054, 0.0026, - 0.0004, - 0.0028, - 0.0046 ],
				[ - 0.0205, - 0.0222, - 0.0224, - 0.0208, - 0.0182, - 0.0146, - 0.0108, - 0.0076, - 0.0056, - 0.0046 ], 0.36, 0.0025 ), { sw: 0.9 } );
			info = { grip: 0.06, len: 0.3, tip: 0.3 }; break;
		}
		case 'machete': {
			// a Latin machete: a riveted polymer handle (lanyard hole, hooked butt), a thin blade widening to the tip,
			// black coated with a bright sharpened edge
			const hp = [ [ - 0.004, - 0.016, 0.008 ], [ 0.02, - 0.013, 0.02 ], [ 0.08, - 0.0125, 0.03 ], [ 0.128, - 0.0118 ], [ 0.128, 0.0125 ], [ 0.07, 0.0135, 0.04 ], [ 0.012, 0.0132, 0.01 ], [ - 0.006, 0.006, 0.006 ] ];
			P.extR( 'poly', hp, 0.011, 0.0045, 0, [ circle( 0.006, 0.0, 0.0035, 10 ) ] );
			for ( const x of [ 0.03, 0.068, 0.106 ] ) P.cylZ( 'satin', x, 0.0, - 0.0114, 0.0114, 0.0026, 10 );
			blade( P, 'darkblade', 'blade', knife( [ 0.124, 0.14, 0.2, 0.3, 0.4, 0.47, 0.52, 0.55, 0.57, 0.58, 0.586 ],
				[ 0.028, 0.04, 0.043, 0.048, 0.053, 0.057, 0.058, 0.055, 0.046, 0.032, 0.016 ],
				[ - 0.012, - 0.0118, - 0.011, - 0.0095, - 0.008, - 0.0068, - 0.0055, - 0.003, 0.001, 0.0065, 0.0135 ], 0.2, 0.0011, 0.0012 ), { sw: 0.9 } );
			info = { grip: 0.065, len: 0.585, tip: 0.57 }; break;
		}
		case 'cane_knife': {
			// a cane knife: wooden scales on the tang, a broad carbon-steel blade gone dark, a fresh-filed edge, the hooked nose
			const hp = [ [ 0.0, - 0.012, 0.006 ], [ 0.07, - 0.0128, 0.03 ], [ 0.13, - 0.0118 ], [ 0.13, 0.0128 ], [ 0.06, 0.0138, 0.04 ], [ 0.0, 0.011, 0.006 ] ];
			scales( P, 'hardwood', hp, 0.0108, 0.0014, 'darkblade' );
			for ( const x of [ 0.03, 0.1 ] ) P.cylZ( 'brass', x, 0.0, - 0.0112, 0.0112, 0.0028, 10 );
			blade( P, 'darkblade', 'steel', knife( [ 0.126, 0.14, 0.25, 0.4, 0.49, 0.52, 0.536 ],
				[ 0.03, 0.05, 0.052, 0.055, 0.058, 0.06, 0.06 ],
				[ - 0.012, - 0.0118, - 0.0112, - 0.0105, - 0.0102, - 0.01, - 0.01 ], 0.2, 0.0014, 0.0014, true ) );
			P.extS( 'darkblade', [ [ 0.534, - 0.008 ], [ 0.534, 0.06, 0.004 ], [ 0.548, 0.058, 0.004 ], [ 0.552, - 0.022, 0.006 ], [ 0.538, - 0.034, 0.004 ], [ 0.524, - 0.031, 0.003 ], [ 0.53, - 0.02 ] ], 0.0013, 0.0006 );
			info = { grip: 0.065, len: 0.55, tip: 0.54 }; break;
		}
		case 'hatchet':
			// a hickory handle with a flared foot; a forged head: flat poll, cheeks thickening to the eye, a honed bit;
			// the handle's end and its wedge show through the eye
			toolHandle( P, 'hickory', [ [ - 0.004, - 0.019, 0.006 ], [ 0.02, - 0.0185, 0.012 ], [ 0.06, - 0.0128, 0.04 ], [ 0.3, - 0.0118 ], [ 0.372, - 0.0125 ], [ 0.372, 0.0125 ], [ 0.3, 0.0118 ], [ 0.06, 0.0128, 0.04 ], [ 0.01, 0.0142, 0.012 ], [ - 0.004, 0.012, 0.006 ] ], 0.0105, 0.0075 );
			P.extS( 'blk', [ [ 0.31, - 0.032, 0.003 ], [ 0.37, - 0.032, 0.003 ], [ 0.374, 0.022 ], [ 0.306, 0.022 ] ], 0.0118, 0.0022 );
			blade( P, 'blk', 'blade', axeBit( 0.282, 0.405, 0.084, 0.02, 0.0046 ), { up: 1 } );
			P.box( 'hickory', 0.371, 0.3755, - 0.0118, 0.0118, - 0.0086, 0.0086, 0.0015 );
			P.box( 'steel', 0.375, 0.3765, - 0.011, 0.011, - 0.0007, 0.0007, 0 );
			info = { grip: 0.08, len: 0.4, tip: 0.36, head: 0.34 }; break;
		case 'fire_axe':
			// pick-head fire axe: a red-painted head with a honed bit and a square-section pick, a long hickory handle
			toolHandle( P, 'hickory', [ [ - 0.006, - 0.022, 0.008 ], [ 0.03, - 0.02, 0.016 ], [ 0.1, - 0.0145, 0.05 ], [ 0.8, - 0.0135 ], [ 0.882, - 0.014 ], [ 0.882, 0.014 ], [ 0.8, 0.0135 ], [ 0.1, 0.0145, 0.05 ], [ 0.02, 0.0165, 0.012 ], [ - 0.006, 0.014, 0.008 ] ], 0.0118, 0.0085 );
			P.extS( 'redP', [ [ 0.8, - 0.034, 0.003 ], [ 0.88, - 0.034, 0.003 ], [ 0.884, 0.03 ], [ 0.796, 0.03 ] ], 0.0138, 0.0025 );
			blade( P, 'redP', 'blade', axeBit( 0.768, 0.922, 0.126, 0.028, 0.0058 ), { up: 1 } );
			P.rod( 'redP', [ 0.84, - 0.03, 0 ], [ 0.838, - 0.085, 0 ], 0.0135, 4, 0.0098 );
			P.rod( 'redP', [ 0.838, - 0.085, 0 ], [ 0.831, - 0.136, 0 ], 0.0098, 4, 0.0012 );
			P.box( 'hickory', 0.881, 0.8855, - 0.0132, 0.0132, - 0.0098, 0.0098, 0.0015 );
			P.box( 'steel', 0.885, 0.8865, - 0.0125, 0.0125, - 0.0008, 0.0008, 0 );
			info = { grip: 0.08, grip2: 0.45, len: 0.92, tip: 0.86, head: 0.84 }; break;
		case 'baseball_bat':
		case 'nailed_bat': {
			const w = k === 'nailed_bat';
			const prof = [ [ - 0.0125, 0.0 ], [ - 0.0125, 0.017 ], [ - 0.01, 0.0232 ], [ - 0.004, 0.0236 ], [ 0.001, 0.016 ], [ 0.008, 0.0134 ], [ 0.12, 0.0138 ], [ 0.3, 0.0148 ], [ 0.42, 0.021 ], [ 0.52, 0.0292 ], [ 0.6, 0.0325 ], [ 0.8, 0.0335 ], [ 0.83, 0.032 ] ];
			if ( w ) {
				// an ash bat with nails driven half in, heads out, some bent; duct tape for a grip
				P.lathe( 'hickory', [ ...prof, [ 0.842, 0.0275 ], [ 0.846, 0.0 ] ], 0, 0, 18 );
				P.lathe( 'gray', [ [ 0.006, 0.0141 ], [ 0.2, 0.0152 ] ], 0, 0, 14 );
				for ( let i = 0; i < 14; i ++ ) {
					const a = i * 2.4, x = 0.57 + ( i % 5 ) * 0.052 + ( i % 3 ) * 0.006, r = radiusAt( prof, x ) - 0.002;
					const L = 0.036 + ( i % 4 ) * 0.004, bend = i % 4 === 1 ? 0.012 : 0;
					const ca = Math.cos( a ), sa = Math.sin( a );
					const p0 = [ x, sa * r, ca * r ], p1 = [ x + bend, sa * ( r + L ), ca * ( r + L ) ];
					P.rod( i % 3 ? 'steel' : 'rust', p0, p1, 0.0016, 5 );
					P.rod( i % 3 ? 'steel' : 'rust', p1, [ p1[ 0 ] + bend * 0.05, sa * ( r + L + 0.0012 ), ca * ( r + L + 0.0012 ) ], 0.0034, 8 );
				}
			} else {
				// aluminium: an anodised barrel with its graphics bands, a rubber end cap, a taped grip
				P.lathe( 'alu', prof, 0, 0, 18 );
				P.lathe( 'rubber', [ [ 0.83, 0.0322 ], [ 0.842, 0.0275 ], [ 0.846, 0.0 ] ], 0, 0, 18 );
				P.lathe( 'red', [ [ 0.6, radiusAt( prof, 0.6 ) + 0.0003 ], [ 0.66, radiusAt( prof, 0.66 ) + 0.0003 ] ], 0, 0, 18 );
				P.lathe( 'white', [ [ 0.664, radiusAt( prof, 0.664 ) + 0.0003 ], [ 0.668, radiusAt( prof, 0.668 ) + 0.0003 ] ], 0, 0, 18 );
				P.lathe( 'rubber', [ [ 0.006, 0.0141 ], [ 0.2, 0.0152 ] ], 0, 0, 14 );
			}
			// the grip's wrap: a spiral of overlapping edges
			const helix = new THREE.Curve();
			helix.getPoint = ( t, v = new THREE.Vector3() ) => { const a = t * PI * 2 * 14, r = 0.0142 + t * 0.0011; return v.set( 0.008 + t * 0.19, Math.sin( a ) * r, Math.cos( a ) * r ); };
			P.put( w ? 'gray' : 'rubber', new THREE.TubeGeometry( helix, 168, 0.0006, 3, false ) );
			info = { grip: 0.07, grip2: 0.16, len: 0.845, tip: 0.8, head: 0.7 }; break;
		}
		case 'crowbar': {
			// hex bar stock in red paint, bare where it works: a chisel end, and the goose neck to a split claw
			const c = new THREE.CatmullRomCurve3( [ V3( 0.0, 0, 0 ), V3( 0.3, 0, 0 ), V3( 0.54, 0, 0 ), V3( 0.592, 0.012, 0 ), V3( 0.622, 0.05, 0 ), V3( 0.608, 0.085, 0 ), V3( 0.575, 0.094, 0 ) ] );
			P.put( 'redP', toCreasedNormals( new THREE.TubeGeometry( c, 40, 0.0105, 6, false ), 0.5 ) );
			P.cyl( 'redP', - 0.001, 0.001, 0.0104, 0, 0, 6 );
			P.extS( 'blk', [ [ 0.002, - 0.0095 ], [ 0.002, 0.0095 ], [ - 0.034, 0.0022 ], [ - 0.037, - 0.0006 ] ], 0.0095, 0.0012 );
			P.cyl( 'redP', 0.574, 0.578, 0.0104, 0.094, 0, 6 );
			for ( const s of [ - 1, 1 ] ) P.extS( 'blk', [ [ 0.578, 0.0835 ], [ 0.578, 0.1045 ], [ 0.548, 0.0975 ], [ 0.545, 0.0948 ] ], 0.0042, 0.0008, s * 0.0058 );
			info = { grip: 0.1, len: 0.63, tip: 0.6, head: 0.58 }; break;
		}
		case 'lead_pipe': {
			// galvanised pipe: a threaded end showing its bore, a black malleable-iron elbow screwed on the far end
			const th = [ [ - 0.012, 0.0122 ], [ - 0.012, 0.0156 ] ];
			for ( let i = 0; i < 8; i ++ ) th.push( [ - 0.0105 + i * 0.0042, 0.0161 ], [ - 0.0084 + i * 0.0042, 0.0153 ] );
			th.push( [ 0.024, 0.0165 ], [ 0.508, 0.0165 ] );
			P.lathe( 'galv', th, 0, 0, 14 );
			P.lathe( 'rubber', [ [ 0.0102, 0.0 ], [ 0.01, 0.0122 ], [ - 0.0118, 0.0122 ] ], 0, 0, 14 );
			P.lathe( 'blk', [ [ 0.498, 0.0 ], [ 0.498, 0.0197 ], [ 0.501, 0.0212 ], [ 0.508, 0.0212 ], [ 0.511, 0.0198 ], [ 0.532, 0.0198 ] ], 0, 0, 16 );
			P.put( 'blk', new THREE.TorusGeometry( 0.026, 0.0198, 10, 8, PI / 2 ).rotateZ( - PI / 2 ), [ 0.532, 0.026, 0 ] );
			latheY( P, 'blk', [ [ 0.0198, 0.025 ], [ 0.0198, 0.05 ], [ 0.0212, 0.0525 ], [ 0.0212, 0.059 ], [ 0.0197, 0.062 ], [ 0.0165, 0.062 ] ], 0.558, 16 );
			latheY( P, 'galv', [ [ 0.0165, 0.06 ], [ 0.0165, 0.073 ], [ 0.0122, 0.073 ], [ 0.0122, 0.066 ] ], 0.558, 14 );
			P.put( 'rubber', new THREE.CircleGeometry( 0.0123, 14 ).rotateX( - PI / 2 ), [ 0.558, 0.066, 0 ] );
			info = { grip: 0.08, len: 0.57, tip: 0.55, head: 0.5 }; break;
		}
		case 'sledgehammer': {
			// a double-faced sledge: an octagonal forged head, chamfered, its faces scuffed bright, on a hickory handle
			toolHandle( P, 'hickory', [ [ - 0.006, - 0.022, 0.008 ], [ 0.03, - 0.02, 0.016 ], [ 0.1, - 0.0145, 0.05 ], [ 0.76, - 0.0135 ], [ 0.852, - 0.0145 ], [ 0.852, 0.0145 ], [ 0.76, 0.0135 ], [ 0.1, 0.0145, 0.05 ], [ 0.02, 0.0165, 0.012 ], [ - 0.006, 0.014, 0.008 ] ], 0.012, 0.0085 );
			const head = new THREE.LatheGeometry( [ [ 0.0, - 0.086 ], [ 0.028, - 0.086 ], [ 0.0345, - 0.08 ], [ 0.0345, - 0.03 ], [ 0.0322, - 0.026 ], [ 0.0322, 0.026 ], [ 0.0345, 0.03 ], [ 0.0345, 0.08 ], [ 0.028, 0.086 ], [ 0.0, 0.086 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), 8, PI / 8 );
			P.put( 'blk', edge( toCreasedNormals( head, 0.4 ), 'extY' ), [ 0.818, 0, 0 ] );
			for ( const s of [ - 1, 1 ] ) P.put( 'satin', new THREE.CircleGeometry( 0.0272, 8, PI / 8 ).rotateX( - s * PI / 2 ), [ 0.818, s * 0.0862, 0 ] );
			P.box( 'hickory', 0.85, 0.8545, - 0.0128, 0.0128, - 0.0098, 0.0098, 0.0015 );
			P.box( 'steel', 0.854, 0.8555, - 0.012, 0.012, - 0.0008, 0.0008, 0 );
			info = { grip: 0.08, grip2: 0.4, len: 0.86, tip: 0.84, head: 0.82 }; break;
		}
		case 'shovel':
			// round-point shovel lying flat (blade in the xz plane, its scoop up): a D-grip, a hickory shaft into a
			// riveted socket, a dished blade with a rolled tread and an edge worn bright
			P.cylZ( 'poly', - 0.044, 0, - 0.05, 0.05, 0.0115, 12 );
			for ( const s of [ - 1, 1 ] ) P.rod( 'poly', [ - 0.044, 0, s * 0.046 ], [ 0.008, 0, s * 0.0135 ], 0.0085, 8 );
			P.cyl( 'poly', 0.0, 0.05, 0.0178, 0, 0, 12, 0.0168 );
			P.cyl( 'hickory', 0.04, 0.72, 0.0158, 0, 0, 12, 0.0166 );
			P.lathe( 'blk', [ [ 0.68, 0.0174 ], [ 0.74, 0.018 ], [ 0.79, 0.0128 ], [ 0.802, 0.008 ] ], 0, 0, 12 );
			P.cylY( 'satin', 0.71, - 0.0192, 0.0192, 0.0026, 0, 8 );
			sheet( P, 'blk', 14, 12, ( u, v ) => {
				const tip = Math.max( 0, ( u - 0.62 ) / 0.38 );
				const w = ( 0.1 - 0.008 * u ) * Math.sqrt( Math.max( 0, 1 - tip * tip ) ) * ( 1 - 0.12 * tip );
				return [ 0.775 + u * 0.245, 0.022 * v * v * ( 1 - 0.5 * u ) - 0.004 * ( 1 - u ), v * w, u < 0.06 ? 0.0032 : 0.0016 ];
			}, 0.6 );
			info = { grip: - 0.02, grip2: 0.5, len: 1.02, tip: 0.98, head: 0.9, flat: 1 }; break;
		case 'golf_club': {
			// a 7-iron: a tapered rubber grip, a stepped chrome shaft, ferrule and hosel, a cavity-back head with its
			// scoring lines
			P.lathe( 'rubber', [ [ - 0.004, 0.0 ], [ - 0.004, 0.0118 ], [ 0.0, 0.013 ], [ 0.04, 0.0126 ], [ 0.2, 0.0102 ], [ 0.262, 0.0086 ], [ 0.27, 0.0072 ] ], 0, 0, 14 );
			const sh = [ [ 0.262, 0.0075 ] ];
			for ( let i = 0; i < 6; i ++ ) { const x = 0.33 + i * 0.07, r = 0.0072 - i * 0.00045; sh.push( [ x, r ], [ x + 0.003, r - 0.00035 ] ); }
			sh.push( [ 0.9, 0.0046 ] );
			P.lathe( 'chrome', sh, 0, 0, 12 );
			P.cyl( 'blk', 0.896, 0.91, 0.0052, 0, 0, 12, 0.0058 );
			P.cyl( 'chrome', 0.908, 0.952, 0.0062, 0, 0, 12, 0.0088 );
			P.extTop( 'chrome', [ [ 0.946, 0.009 ], [ 0.953, - 0.004 ], [ 0.962, - 0.058, 0.006 ], [ 0.966, - 0.074, 0.008 ], [ 0.982, - 0.079, 0.01 ], [ 0.99, - 0.07, 0.006 ], [ 0.992, - 0.02 ], [ 0.989, 0.006, 0.006 ], [ 0.972, 0.013, 0.004 ] ], - 0.0095, 0.0105, 0.0015 );
			for ( let i = 0; i < 8; i ++ ) P.box( 'blk', 0.962 + i * 0.0034, 0.9632 + i * 0.0034, 0.0102, 0.0108, - 0.062, - 0.008, 0 );
			P.box( 'blk', 0.966, 0.984, - 0.0101, - 0.0093, - 0.06, - 0.012, 0.001 );
			P.box( 'red', 0.97, 0.98, - 0.0105, - 0.01, - 0.045, - 0.025, 0.0005 );
			info = { grip: 0.07, len: 0.99, tip: 0.96, head: 0.95 }; break;
		}
		case 'katana': {
			// tsuka: ray skin under a diamond-wrapped cord, an iron kashira, brass menuki; an oval iron tsuba with its
			// two ports between brass seppa; the habaki; a curved blade: brushed flats above the ridge line, the
			// polished ha below it with the frosted hamon wandering along the edge, the kissaki sweeping up to the point
			ovalLathe( P, 'white', [ [ 0.0, 0.0128 ], [ 0.06, 0.0122 ], [ 0.2, 0.0122 ], [ 0.258, 0.0132 ] ], 12, 0.8 );
			ovalLathe( P, 'blk', [ [ - 0.013, 0.0 ], [ - 0.013, 0.0095 ], [ - 0.009, 0.0132 ], [ 0.003, 0.0134 ] ], 12, 0.8 );
			for ( let i = 0; i < 9; i ++ ) {
				const x = 0.02 + i * 0.026;
				for ( const s of [ - 1, 1 ] ) for ( const r of [ - 1, 1 ] ) P.boxC( 'cloth', x, 0.0, s * 0.0099, 0.034, 0.0068, 0.0018, 0.0006, [ 0, 0, r * 0.62 ] );
				if ( i < 8 ) for ( const s of [ - 1, 1 ] ) P.boxC( 'cloth', x + 0.013, s * 0.0124, 0.0, 0.009, 0.0022, 0.0202, 0.0008 );
			}
			for ( const s of [ - 1, 1 ] ) P.sphere( 'brass', 0.13, 0.0, s * 0.0106, 0.0058, 8, [ 2.2, 0.8, 0.4 ] );
			const ell = [];
			for ( let i = 0; i < 20; i ++ ) { const a = i / 20 * PI * 2; ell.push( [ Math.cos( a ) * 0.036, Math.sin( a ) * 0.039 ] ); }
			P.extFront( 'blk', ell, 0.2585, 0.2665, 0.0012, 3, [ circle( 0.0, 0.0262, 0.005, 8 ), circle( 0.0, - 0.0262, 0.005, 8 ) ] );
			for ( const x of [ 0.2555, 0.2665 ] ) ovalLathe( P, 'brass', [ [ x, 0.0 ], [ x, 0.0168 ], [ x + 0.003, 0.0168 ], [ x + 0.003, 0.0 ] ], 12, 0.72 );
			P.extR( 'brass', [ [ 0.269, - 0.0176 ], [ 0.298, - 0.0161 ], [ 0.298, 0.017 ], [ 0.269, 0.0178 ] ], 0.0062, 0.0015 );
			const st = [], ham = [];
			for ( const t of [ 0, 0.08, 0.18, 0.3, 0.42, 0.54, 0.66, 0.76, 0.84, 0.9, 0.93, 0.955, 0.975, 0.99, 1 ] ) {
				const x = 0.296 + t * 0.694, c = t * t * 0.028, w = 0.031 - 0.009 * t, kk = Math.max( 0, ( t - 0.9 ) / 0.1 );
				const yS = c + w * 0.5 - kk * kk * w * 0.06, yE = c - w * 0.5 + ( 1 - Math.sqrt( 1 - kk * kk ) ) * w * 0.94, d = yS - yE;
				st.push( [ x, yE, yE + 0.64 * d, yS, Math.max( 0.0002, 0.0036 - 0.0013 * t - kk * 0.0021 ), Math.max( 0.0002, 0.0029 - 0.0011 * t - kk * 0.0016 ) ] );
				ham.push( yE + d * ( 0.22 + 0.07 * Math.sin( t * 37 ) * ( 1 - kk ) ) );
			}
			blade( P, 'satin', 'blade', st, { hamon: ham } );
			info = { grip: 0.07, grip2: 0.18, len: 0.99, tip: 0.96, head: 0.8 }; break;
		}
		case 'tire_iron': {
			// an L lug wrench: hex bar with a flattened pry end, bent up into a socket for the wheel nuts
			P.put( 'blued', flat( new THREE.CylinderGeometry( 0.0098, 0.0098, 0.348, 6, 1 ).rotateZ( - PI / 2 ) ), [ 0.174, 0, 0 ] );
			P.extS( 'blued', [ [ 0.002, - 0.0088 ], [ 0.002, 0.0088 ], [ - 0.03, 0.0022 ], [ - 0.033, - 0.0008 ] ], 0.0092, 0.001 );
			const bend = new THREE.QuadraticBezierCurve3( V3( 0.346, 0, 0 ), V3( 0.38, 0, 0 ), V3( 0.38, 0.034, 0 ) );
			P.put( 'blued', toCreasedNormals( new THREE.TubeGeometry( bend, 8, 0.0098, 6, false ), 0.5 ) );
			P.put( 'blued', flat( new THREE.CylinderGeometry( 0.0098, 0.0098, 0.054, 6, 1 ) ), [ 0.38, 0.059, 0 ] );
			latheY( P, 'blued', [ [ 0.0098, 0.082 ], [ 0.0128, 0.084 ], [ 0.0172, 0.092 ], [ 0.0172, 0.121 ], [ 0.0162, 0.125 ], [ 0.0118, 0.125 ], [ 0.0118, 0.114 ] ], 0.38, 16 );
			P.put( 'rubber', new THREE.CircleGeometry( 0.0119, 6 ).rotateX( - PI / 2 ), [ 0.38, 0.1145, 0 ] );
			info = { grip: 0.08, len: 0.4, tip: 0.38, head: 0.36 }; break;
		}
		case 'frying_pan': {
			// cast iron: a thick floor (the striking face, up), a flared wall with a rolled lip, a handle with a hanging
			// hole, the helper lug opposite
			const prof = [ [ 0.0, 0.0 ], [ 0.098, 0.0 ], [ 0.106, 0.0012 ], [ 0.111, 0.0045 ], [ 0.127, 0.042 ], [ 0.1305, 0.0458 ], [ 0.129, 0.0482 ], [ 0.1255, 0.0475 ], [ 0.1105, 0.0094 ], [ 0.1045, 0.0068 ], [ 0.0, 0.0068 ] ];
			const g = new THREE.LatheGeometry( prof.map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), 32 );
			g.rotateX( PI );
			P.put( 'blk', g, [ 0.322, 0.02, 0 ] );
			P.put( 'blk', new THREE.TorusGeometry( 0.06, 0.0009, 4, 32 ).rotateX( PI / 2 ), [ 0.322, 0.0202, 0 ] );
			const hs = shape( [ [ 0.0, - 0.0105, 0.009 ], [ 0.0, 0.0105, 0.009 ], [ 0.19, 0.0165 ], [ 0.205, 0.024 ], [ 0.205, - 0.024 ], [ 0.19, - 0.0165 ] ], [ circle( 0.016, 0, 0.005, 10 ) ] );
			const hg = new THREE.ExtrudeGeometry( hs, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelOffset: - 0.0015, bevelSegments: 1, curveSegments: 4 } );
			hg.rotateX( - PI / 2 ); hg.translate( 0, - 0.004, 0 ); hg.rotateZ( - 0.09 );
			P.put( 'blk', edge( toCreasedNormals( hg, 0.6 ), 'extY' ) );
			P.extTop( 'blk', [ [ 0.448, - 0.02, 0.006 ], [ 0.47, - 0.013, 0.006 ], [ 0.47, 0.013, 0.006 ], [ 0.448, 0.02, 0.006 ] ], - 0.027, - 0.019, 0.0015 );
			info = { grip: 0.08, len: 0.45, tip: 0.45, head: 0.32 }; break;
		}
		case 'hammer':
			// a claw hammer: hickory handle, a forged head with a polished face, the claw split for nails and curving
			// back towards the handle
			toolHandle( P, 'hickory', [ [ - 0.004, - 0.016, 0.006 ], [ 0.02, - 0.0145, 0.012 ], [ 0.07, - 0.011, 0.04 ], [ 0.25, - 0.0108 ], [ 0.316, - 0.0115 ], [ 0.316, 0.0115 ], [ 0.25, 0.0108 ], [ 0.07, 0.0112, 0.04 ], [ 0.015, 0.0132, 0.012 ], [ - 0.004, 0.0115, 0.006 ] ], 0.0095, 0.0068 );
			P.extS( 'blk', [ [ 0.278, - 0.022, 0.004 ], [ 0.318, - 0.022, 0.004 ], [ 0.318, 0.02, 0.004 ], [ 0.278, 0.02, 0.004 ] ], 0.0112, 0.002 );
			latheY( P, 'blk', [ [ 0.0, 0.016 ], [ 0.0112, 0.016 ], [ 0.0098, 0.03 ], [ 0.0105, 0.042 ], [ 0.0142, 0.05 ], [ 0.0142, 0.056 ], [ 0.0128, 0.0585 ], [ 0.0, 0.0585 ] ], 0.298, 14 );
			P.put( 'satin', new THREE.CircleGeometry( 0.0128, 14 ).rotateX( - PI / 2 ), [ 0.298, 0.0587, 0 ] );
			for ( const s of [ - 1, 1 ] ) P.extS( 'blk', [ [ 0.279, - 0.02 ], [ 0.317, - 0.02 ], [ 0.312, - 0.042, 0.012 ], [ 0.296, - 0.066 ], [ 0.289, - 0.071 ], [ 0.287, - 0.064 ], [ 0.293, - 0.045, 0.01 ], [ 0.281, - 0.03 ] ], 0.0042, 0.0012, s * 0.0051 );
			P.box( 'hickory', 0.315, 0.3195, - 0.0105, 0.0105, - 0.0085, 0.0085, 0.0015 );
			P.box( 'steel', 0.319, 0.3205, - 0.0095, 0.0095, - 0.0006, 0.0006, 0 );
			info = { grip: 0.07, len: 0.33, tip: 0.31, head: 0.3 }; break;
		case 'wrench': {
			// a pipe wrench: a red cast I-beam handle (hang hole), the frame, the hook jaw's shank through it with
			// the knurled nut on its rack, the toothed hook and heel jaws
			const hole = [ circle( 0.011, 0.0, 0.0042, 10 ) ];
			P.extS( 'redP', [ [ 0.0, - 0.0085, 0.008 ], [ 0.24, - 0.011 ], [ 0.272, - 0.015, 0.008 ], [ 0.272, 0.017, 0.006 ], [ 0.24, 0.011 ], [ 0.0, 0.0085, 0.008 ] ], 0.0034, 0.0008, 0, hole );
			for ( const s of [ - 1, 1 ] ) P.extR( 'redP', [ [ 0.022, s * 0.0085 ], [ 0.24, s * 0.011 ], [ 0.24, s * 0.0076 ], [ 0.022, s * 0.0052 ] ], 0.0066, 0.0016 );
			P.extR( 'redP', [ [ - 0.002, - 0.0085, 0.008 ], [ 0.024, - 0.009 ], [ 0.024, 0.009 ], [ - 0.002, 0.0085, 0.008 ] ], 0.0066, 0.002, 0, hole );
			P.extR( 'redP', [ [ 0.262, - 0.014, 0.006 ], [ 0.322, - 0.016, 0.008 ], [ 0.338, - 0.004, 0.004 ], [ 0.338, 0.022 ], [ 0.3, 0.026, 0.004 ], [ 0.266, 0.02, 0.004 ] ], 0.0085, 0.0025 );
			P.box( 'steel', 0.3, 0.372, 0.008, 0.024, - 0.0055, 0.0055, 0.0015 );
			for ( let i = 0; i < 4; i ++ ) P.box( 'steel', 0.3535 + i * 0.0045, 0.3555 + i * 0.0045, 0.0238, 0.0254, - 0.0048, 0.0048, 0 );
			const nut = [];
			for ( let i = 0; i < 6; i ++ ) nut.push( [ 0.3385 + i * 0.0024, 0.0108 ], [ 0.3397 + i * 0.0024, 0.0118 ] );
			P.lathe( 'steel', nut, 0.016, 0, 14 );
			P.extR( 'steel', [ [ 0.352, 0.008 ], [ 0.378, 0.008, 0.004 ], [ 0.38, 0.058, 0.006 ], [ 0.37, 0.068, 0.004 ], [ 0.353, 0.064 ], [ 0.358, 0.054 ], [ 0.36, 0.026 ] ], 0.0058, 0.0014 );
			P.extR( 'blk', [ [ 0.3, 0.022 ], [ 0.326, 0.022 ], [ 0.326, 0.047, 0.002 ], [ 0.318, 0.051, 0.003 ], [ 0.3, 0.045, 0.004 ] ], 0.006, 0.0015 );
			for ( let i = 0; i < 7; i ++ ) {
				P.box( 'blk', 0.3572, 0.3594, 0.029 + i * 0.0035, 0.0302 + i * 0.0035, - 0.0058, 0.0058, 0 );
				if ( i < 6 ) P.box( 'blk', 0.3254, 0.3276, 0.0255 + i * 0.0035, 0.0267 + i * 0.0035, - 0.006, 0.006, 0 );
			}
			screw( P, 0.312, 0.034, 0.0062, 'z', 1, 0.0022, 'steel' );
			info = { grip: 0.08, len: 0.38, tip: 0.36, head: 0.34 }; break;
		}
		case 'pickaxe': {
			// a pick-mattock: the pick drawn to a point one way, the adze flattened into a chisel the other, both tips
			// worn bright; a collar round the eye; a hickory handle swelling into the eye
			toolHandle( P, 'hickory', [ [ - 0.006, - 0.021, 0.008 ], [ 0.03, - 0.019, 0.016 ], [ 0.1, - 0.0155, 0.05 ], [ 0.8, - 0.016 ], [ 0.86, - 0.019, 0.02 ], [ 0.902, - 0.019 ], [ 0.902, 0.019 ], [ 0.86, 0.019, 0.02 ], [ 0.8, 0.016 ], [ 0.1, 0.0155, 0.05 ], [ 0.02, 0.017, 0.012 ], [ - 0.006, 0.015, 0.008 ] ], 0.0125, 0.009 );
			P.box( 'blk', 0.85, 0.9, - 0.03, 0.03, - 0.0168, 0.0168, 0.004 );
			const st = [];
			for ( let i = 0; i <= 16; i ++ ) {
				const t = i / 16 * 2 - 1, a = Math.abs( t );
				const hx = t > 0 ? 0.0165 * ( 1 - 0.9 * a ** 1.4 ) : 0.0165 * ( 1 - 0.82 * a ** 1.2 );
				const hz = t > 0 ? 0.0135 * ( 1 - 0.9 * a ** 1.4 ) : 0.0135 + 0.007 * a;
				st.push( [ 0.832 + 0.042 * ( 1 - t * t ), t * 0.3, hx, hz ] );
			}
			bar( P, 'blk', st.slice( 1, 16 ) );
			bar( P, 'satin', st.slice( 0, 2 ) );
			bar( P, 'satin', st.slice( 15 ) );
			info = { grip: 0.08, grip2: 0.45, len: 0.9, tip: 0.86, head: 0.85 }; break;
		}
		case 'fishing_spear': {
			// a Hawaiian pole spear: fibreglass shaft, the latex sling looped off its butt, grip sleeves, a ferrule and
			// a three-prong paralyser tip with barbs
			P.cyl( 'tan', 0.0, 1.74, 0.0092, 0, 0, 10, 0.0088 );
			P.cyl( 'blk', - 0.012, 0.004, 0.0098, 0, 0, 10, 0.0094 );
			const loop = new THREE.CatmullRomCurve3( [ V3( 0.0, 0.006, 0 ), V3( - 0.06, 0.017, 0.002 ), V3( - 0.13, 0.011, 0.003 ), V3( - 0.152, 0, 0.002 ), V3( - 0.13, - 0.011, 0 ), V3( - 0.06, - 0.017, - 0.002 ), V3( 0.0, - 0.006, 0 ) ], true );
			P.put( 'orange', new THREE.TubeGeometry( loop, 36, 0.0042, 6, true ) );
			P.cyl( 'cloth', 0.004, 0.032, 0.0104, 0, 0, 10 );
			for ( const [ a, b ] of [ [ 0.52, 0.7 ], [ 0.92, 1.08 ] ] ) P.lathe( 'rubber', [ [ a, 0.0094 ], [ a + 0.004, 0.0108 ], [ b - 0.004, 0.0108 ], [ b, 0.0094 ] ], 0, 0, 12 );
			P.lathe( 'satin', [ [ 1.735, 0.0097 ], [ 1.762, 0.0097 ], [ 1.768, 0.0072 ], [ 1.785, 0.0064 ], [ 1.79, 0.0052 ] ], 0, 0, 10 );
			for ( let i = 0; i < 3; i ++ ) {
				const a = i / 3 * PI * 2, sa = Math.sin( a ), ca = Math.cos( a );
				P.rod( 'satin', [ 1.785, sa * 0.0028, ca * 0.0028 ], [ 1.978, sa * 0.0235, ca * 0.0235 ], 0.0021, 6, 0.0017 );
				P.rod( 'satin', [ 1.978, sa * 0.0235, ca * 0.0235 ], [ 1.996, sa * 0.0255, ca * 0.0255 ], 0.0017, 6, 0.0002 );
				P.rod( 'satin', [ 1.978, sa * 0.0245, ca * 0.0245 ], [ 1.962, sa * 0.031, ca * 0.031 ], 0.0011, 4, 0.0002 );
			}
			info = { grip: 0.6, grip2: 1.0, len: 1.99, tip: 1.98, head: 1.9, spear: 1 }; break;
		}
		case 'canoe_paddle':
			// a koa outrigger paddle: a palm grip, the shaft, a blade with a raised spine running out to its tip
			P.extTop( 'koa', [ [ 0.022, - 0.0165 ], [ 0.004, - 0.05, 0.012 ], [ - 0.026, - 0.056, 0.014 ], [ - 0.034, 0.0, 0.03 ], [ - 0.026, 0.056, 0.014 ], [ 0.004, 0.05, 0.012 ], [ 0.022, 0.0165 ] ], - 0.0145, 0.0145, 0.006 );
			P.cyl( 'koa', 0.0, 1.0, 0.0165, 0, 0, 12, 0.017 );
			sheet( P, 'koa', 18, 10, ( u, v ) => {
				const tip = Math.max( 0, ( u - 0.9 ) / 0.1 );
				const w = ( 0.018 + 0.068 * Math.min( 1, u / 0.32 ) ** 0.7 + 0.004 * u ) * Math.sqrt( Math.max( 0, 1 - tip * tip ) );
				return [ 0.94 + u * 0.48, 0, v * w, 0.0028 + 0.0095 * ( 1 - Math.abs( v ) ) ** 2 * ( 1 - 0.55 * u ) ];
			} );
			info = { grip: 0.0, grip2: 0.55, len: 1.42, tip: 1.4, head: 1.2, flat: 1 }; break;
		case 'police_baton':
			// an expandable baton: a textured foam grip, a black-chromed tube in three telescoping sections, bright
			// collars, a solid tip
			P.lathe( 'blk', [ [ - 0.012, 0.0 ], [ - 0.012, 0.0105 ], [ - 0.009, 0.0132 ], [ 0.002, 0.0132 ] ], 0, 0, 14 );
			P.lathe( 'rubber', [ [ 0.002, 0.0128 ], [ 0.012, 0.0134 ], [ 0.17, 0.0134 ], [ 0.186, 0.0124 ] ], 0, 0, 14 );
			P.lathe( 'blk', [ [ 0.184, 0.0124 ], [ 0.196, 0.0115 ], [ 0.198, 0.0098 ] ], 0, 0, 14 );
			P.cyl( 'blued', 0.196, 0.38, 0.0095, 0, 0, 14, 0.0094 );
			P.lathe( 'chrome', [ [ 0.376, 0.0097 ], [ 0.384, 0.0097 ], [ 0.386, 0.0078 ] ], 0, 0, 14 );
			P.cyl( 'blued', 0.384, 0.528, 0.0076, 0, 0, 12, 0.0074 );
			P.lathe( 'chrome', [ [ 0.524, 0.0076 ], [ 0.53, 0.0076 ], [ 0.532, 0.006 ] ], 0, 0, 12 );
			P.cyl( 'blued', 0.53, 0.54, 0.006, 0, 0, 12 );
			P.lathe( 'blued', [ [ 0.536, 0.006 ], [ 0.538, 0.0098 ], [ 0.546, 0.0104 ], [ 0.553, 0.0085 ], [ 0.556, 0.0 ] ], 0, 0, 14 );
			info = { grip: 0.08, len: 0.55, tip: 0.54, head: 0.48 }; break;
		case 'broken_bottle': {
			// a bottle broken off at the shoulder, held by the neck: the lip, the neck, a jagged rim of thick glass
			P.lathe( 'glassG', [ [ - 0.006, 0.0102 ], [ - 0.006, 0.0138 ], [ 0.0, 0.0142 ], [ 0.003, 0.0126 ], [ 0.07, 0.0128 ], [ 0.092, 0.0175 ], [ 0.112, 0.026 ], [ 0.128, 0.0318 ], [ 0.134, 0.0328 ] ], 0, 0, 16 );
			const hs = [ 0.012, 0.048, 0.02, 0.062, 0.008, 0.03, 0.054, 0.015, 0.04, 0.006, 0.026, 0.05, 0.01, 0.034 ];
			const n = hs.length, R = 0.0328, r = 0.0298, T = [];
			const at = ( i, rad, x ) => { const a = i / n * PI * 2; return [ x, Math.sin( a ) * rad, Math.cos( a ) * rad ]; };
			for ( let i = 0; i < n; i ++ ) {
				const j = ( i + 1 ) % n, a = ( i + 0.5 ) / n * PI * 2, out = [ 0, Math.sin( a ), Math.cos( a ) ];
				const xi = 0.134 + hs[ i ], xj = 0.134 + hs[ j ];
				quad( T, at( i, R, 0.134 ), at( j, R, 0.134 ), at( j, R, xj ), at( i, R, xi ), out );
				quad( T, at( i, r, 0.13 ), at( j, r, 0.13 ), at( j, r, xj ), at( i, r, xi ), [ 0, - out[ 1 ], - out[ 2 ] ] );
				quad( T, at( i, R, xi ), at( j, R, xj ), at( j, r, xj ), at( i, r, xi ), [ 1, 0, 0 ], 0.5 );
			}
			P.put( 'glassG', toGeo( T, 0.3 ) );
			info = { grip: 0.05, len: 0.2, tip: 0.19, head: 0.17 }; break;
		}
		default:
			P.cyl( 'hickory', 0, 0.4, 0.015, 0, 0, 10 );
			info = { grip: 0.08, len: 0.4, tip: 0.4 };
	}
	return { P, info };
}
