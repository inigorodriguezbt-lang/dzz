// Magazines: curved and straight box magazines from a band profile, drums, belt boxes. Mag frame: top centre at the
// origin (where it seats in the magwell), body down -y, front +x.
import { PI, Parts, topRound } from './kit.js';

// ---- magazines ----------------------------------------------------------------------------------------------------
// Mag frame: top centre at the origin (where it seats in the magwell), body down -y, front +x.

// a curved band profile: centreline bends forward by `bend` over length L, depth d0 at the top and d1 at the bottom
function bandProfile( L, d0, d1, bend, pw = 1.6, n = 8, rBottom = 0.004 ) {
	const front = [], back = [];
	for ( let i = 0; i <= n; i ++ ) {
		const s = i / n;
		const cx = bend * Math.pow( s, pw ), cy = - L * s;
		const dx = bend * pw * Math.pow( Math.max( s, 1e-3 ), pw - 1 ), dy = - L;
		const l = Math.hypot( dx, dy );
		const nx = - dy / l, ny = dx / l; // forward normal
		const d = ( d0 + ( d1 - d0 ) * s ) / 2;
		front.push( [ cx + nx * d, cy + ny * d, i === n ? rBottom : 0 ] );
		back.push( [ cx - nx * d, cy - ny * d, i === n ? rBottom : 0 ] );
	}
	return [ ...front, ...back.reverse() ];
}

const MAG_SHAPES = {
	pistol: { L: 0.118, d: 0.031, w: 0.021, bend: 0, mat: 'blk', base: 'poly' },
	stanag: { L: 0.188, d: 0.062, w: 0.0225, bend: 0.026, pw: 2.4, mat: 'alu', base: 'blk', ribs: 1 },
	stanag60: { L: 0.215, d: 0.064, w: 0.046, bend: 0.01, pw: 2, mat: 'poly', base: 'poly' },
	mini14: { L: 0.125, d: 0.058, w: 0.022, bend: 0.01, mat: 'blued', base: 'blued' },
	ak74: { L: 0.215, d: 0.068, d1: 0.074, w: 0.027, bend: 0.075, pw: 1.45, mat: 'plum', base: 'plum', ribs: 1 },
	akm: { L: 0.225, d: 0.07, d1: 0.076, w: 0.028, bend: 0.085, pw: 1.45, mat: 'blued', base: 'blued', ribs: 1 },
	g36: { L: 0.2, d: 0.066, w: 0.025, bend: 0.032, pw: 1.6, mat: 'smoke', base: 'poly', studs: 1 },
	aug: { L: 0.2, d: 0.064, w: 0.025, bend: 0.024, pw: 1.8, mat: 'smoke', base: 'poly' },
	fal: { L: 0.168, d: 0.078, w: 0.027, bend: 0.006, mat: 'blk', base: 'blk' },
	m14: { L: 0.152, d: 0.075, w: 0.026, bend: 0.004, mat: 'blk', base: 'blk' },
	svd: { L: 0.125, d: 0.088, w: 0.03, bend: 0.02, mat: 'blk', base: 'blk', ribs: 1 },
	m82: { L: 0.12, d: 0.112, w: 0.038, bend: 0, mat: 'blk', base: 'blk' },
	cz527: { L: 0.05, d: 0.058, w: 0.022, bend: 0, mat: 'blk', base: 'blk' },
	saiga: { L: 0.2, d: 0.098, w: 0.034, bend: 0.05, pw: 1.5, mat: 'poly', base: 'poly' },
	smg_curved: { L: 0.2, d: 0.034, w: 0.021, bend: 0.036, pw: 1.7, mat: 'blk', base: 'blk' },
	smg: { L: 0.2, d: 0.032, w: 0.021, bend: 0, mat: 'blk', base: 'blk' },
};
// per magazine id tweaks
const MAG_ID = {
	mag_1911: { d: 0.029, w: 0.016, L: 0.108 }, mag_deagle: { d: 0.041, w: 0.022, L: 0.13 }, mag_makarov: { d: 0.028, w: 0.017, L: 0.092 },
	mag_ruger22: { d: 0.024, w: 0.013, L: 0.12 }, mag_m9: { L: 0.122 }, mag_p226: { L: 0.12 }, mag_glock17: { base: 'poly', mat: 'poly' },
	mag_uzi: { L: 0.245, d: 0.034 }, mag_mp7: { L: 0.18, d: 0.024, w: 0.018, mat: 'poly', base: 'poly' }, mag_vector: { L: 0.2, d: 0.034, w: 0.024, mat: 'poly', base: 'poly' },
	mag_mac10: { L: 0.24, d: 0.036, w: 0.024 }, mag_ump45: { L: 0.2, d: 0.041, w: 0.024, mat: 'poly', base: 'poly', bend: 0.006 },
};

export function magParts( def, P = new Parts() ) {
	const spec = def.model || {};
	const shp = spec.shape || 'stanag';
	if ( shp === 'drum' ) {
		// AKM drum: feed tower + round drum
		P.box( 'blk', - 0.034, 0.034, - 0.07, 0.0, - 0.013, 0.013, 0.003 );
		P.cylZ( 'blk', 0.035, - 0.14, - 0.036, 0.036, 0.082, 28 );
		P.cylZ( 'poly', 0.035, - 0.14, - 0.04, 0.04, 0.03, 16 );
		P.cylZ( 'blk', 0.035, - 0.14, - 0.041, 0.041, 0.012, 12 );
		for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; P.box( 'blk', 0.035 + Math.cos( a ) * 0.075 - 0.004, 0.035 + Math.cos( a ) * 0.075 + 0.004, - 0.14 + Math.sin( a ) * 0.075 - 0.004, - 0.14 + Math.sin( a ) * 0.075 + 0.004, - 0.038, 0.038, 0.002 ); }
		topRound( P, 0.0, 0.004, '7.62x39' );
		return P;
	}
	if ( shp === 'box' || shp === 'box_pkm' ) {
		const pk = shp === 'box_pkm';
		const [ sx, sy, sz ] = pk ? [ 0.13, 0.135, 0.078 ] : [ 0.135, 0.12, 0.085 ];
		P.box( 'od', - sx / 2, sx / 2, - sy, - 0.01, - sz / 2, sz / 2, 0.006 );
		P.box( pk ? 'od' : 'od', - sx / 2 - 0.002, sx / 2 + 0.002, - 0.022, - 0.006, - sz / 2 - 0.002, sz / 2 + 0.002, 0.004 ); // lid
		if ( pk ) { P.box( 'blk', - 0.03, 0.03, - 0.006, 0.0, - 0.005, 0.005, 0.002 ); P.cylZ( 'blk', 0, - 0.05, sz / 2, sz / 2 + 0.004, 0.012, 8 ); }
		else { P.box( 'rubber', - sx / 2 + 0.01, sx / 2 - 0.01, - sy * 0.6, - sy * 0.4, sz / 2, sz / 2 + 0.003, 0.002 ); }
		// belt stub: links + rounds leading up into the feed tray
		for ( let i = 0; i < 4; i ++ ) {
			const x = - 0.03 + i * 0.0105;
			P.cylZ( 'brass', x, 0.004, - 0.024, 0.02, 0.0046, 8 );
			P.cylZ( 'copper', x, 0.004, 0.02, 0.028, 0.0046, 8, 0.0015 );
			P.box( 'blk', x - 0.004, x + 0.004, - 0.003, 0.009, - 0.02, 0.012, 0 );
		}
		return P;
	}
	const S = { ...MAG_SHAPES[ shp ] || MAG_SHAPES.stanag, ...( MAG_ID[ def.id ] || {} ) };
	const L = S.L, d = S.d, w = S.w;
	const prof = bandProfile( L, d, S.d1 ?? d, S.bend || 0, S.pw || 1.6, S.bend ? 8 : 1, 0.004 );
	P.extS( S.mat, prof, w / 2, 0.0022 );
	if ( S.ribs ) {
		const inner = bandProfile( L * 0.86, d * 0.72, ( S.d1 ?? d ) * 0.72, ( S.bend || 0 ) * 0.86, S.pw || 1.6, 6, 0.004 ).map( ( [ x, y, r ] ) => [ x, y - L * 0.06, r ] );
		P.extS( S.mat, inner, w / 2 + 0.0012, 0.001 );
	}
	if ( S.studs ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'poly', - d * 0.3, - 0.03, s * w / 2, s * ( w / 2 + 0.004 ), 0.005, 8 );
	// base plate at the end of the curve
	const bx = S.bend || 0, by = - L;
	const ang = S.bend ? Math.atan2( ( S.bend * ( S.pw || 1.6 ) ), L ) : 0;
	P.boxC( S.base, bx, by - 0.004, 0, ( S.d1 ?? d ) + 0.006, 0.009, w + 0.004, 0.003, [ 0, 0, ang ] );
	// feed lips + the top round
	P.box( S.mat === 'smoke' ? 'poly' : S.mat, - d / 2, d / 2 * 0.6, - 0.012, 0.0, - w / 2 - 0.0005, w / 2 + 0.0005, 0.0015 );
	topRound( P, - d * 0.1, 0.004, def.magazine?.caliber, Math.min( d * 0.8, 0.07 ) );
	return P;
}

// a cartridge lying along +x with its base at x
