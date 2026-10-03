// Weapon models for the arms items: improvised and Hawaiian melee weapons, the rail-free gun fittings and the thrown
// things. They are drawn with the weapons module's toolkit — src/weapons/GunModels.js looks a kind up here and passes
// its Parts instance and helpers in (H: { THREE, V3, shape, handle, PI }), so the world item, the inventory icon and
// the first-person view all come from one drawing and this file needs no import of the weapons module.
//
// Frames (GunModels.js): melee +x from the pommel to the tip, +y the striking edge or face, z the flat; info: grip (x of
// the main hand), grip2 (the second hand), len, tip, head, flat (lies on y), spear, hold (a view hold other than the
// one the length picks). Attachments: muzzle fittings start at x = 0 and run +x, lights hang to +z of the clamp.
// Throwables: centred where the hand closes, the long way up (+y).
import * as THREE from 'three';

const PI = Math.PI;

// materials the weapon shader adds to its palette (same fields as GunModels.js MAT)
export const ARMS_MAT = {
	pale: { color: 0xc8a273, metalness: 0.0, roughness: 0.48, fin: 'wood' }, // maple, ash, willow
	plank: { color: 0x9a7a55, metalness: 0.0, roughness: 0.8, fin: 'wood' }, // a weathered 2×4
	tape: { color: 0x8d9197, metalness: 0.2, roughness: 0.5 }, // duct tape
	gripTape: { color: 0x1d1d1f, metalness: 0.0, roughness: 0.92, fin: 'matte' },
	ivory: { color: 0xe8dfc4, metalness: 0.0, roughness: 0.38 }, // shark teeth
	sennit: { color: 0x8c6a3c, metalness: 0.0, roughness: 0.95, fin: 'matte' }, // coconut-fibre cord
	polycarb: { color: 0xbccbd4, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.3 },
	blue: { color: 0x2756a6, metalness: 0.0, roughness: 0.55 },
	gold: { color: 0xd9b04c, metalness: 0.85, roughness: 0.32 },
	paper: { color: 0xc61d17, metalness: 0.0, roughness: 0.62 }, // firecracker paper
	nylon: { color: 0x3f4430, metalness: 0.0, roughness: 0.85, fin: 'matte' }, // webbing
};

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const tube = ( pts, r, seg, rs = 5 ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), seg, r, rs, false );

// a kitchen-knife blade along +x from x0, its edge (+y) curving up to the point, centred on z = zc
function knife( P, mat, x0, len, h, zc = 0 ) {
	P.extS( mat, [ [ x0, - 0.004 ], [ x0 + len * 0.7, - 0.005 ], [ x0 + len * 0.86, - 0.003 ], [ x0 + len, h * 0.08, 0.004 ], [ x0 + len * 0.8, h * 0.72, 0.03 ], [ x0 + len * 0.3, h, 0.02 ], [ x0, h * 0.95 ] ], 0.0012, 0.0011, zc, [], 4 );
}

// the baseball bat's lathe profile (GunModels.js) and its radius at x
const BAT = [ [ - 0.012, 0.0 ], [ - 0.012, 0.022 ], [ 0.0, 0.024 ], [ 0.006, 0.0135 ], [ 0.3, 0.0145 ], [ 0.52, 0.03 ], [ 0.8, 0.033 ], [ 0.84, 0.03 ], [ 0.845, 0.0 ] ];
function batR( x ) {
	for ( let i = 1; i < BAT.length; i ++ ) {
		const [ x0, r0 ] = BAT[ i - 1 ], [ x1, r1 ] = BAT[ i ];
		if ( x <= x1 ) return r0 + ( r1 - r0 ) * ( x - x0 ) / Math.max( 1e-6, x1 - x0 );
	}
	return 0;
}

// tape wound round a pole and whatever is laid along it (z from z0 to z1), as a band from x to x + w
function tapeBand( P, x, w, y0, y1, z0, z1 ) { P.box( 'tape', x, x + w, y0, y1, z0, z1, Math.min( 0.012, ( y1 - y0 ) * 0.48, ( z1 - z0 ) * 0.4 ) ); }

// a ring of small triangles (shark teeth, barbs) along a polyline, pointing out to one side
function teethAlong( P, mat, pts, side, step, size, H ) {
	const g0 = new THREE.ExtrudeGeometry( H.shape( [ [ - size * 0.45, 0 ], [ size * 0.45, 0 ], [ size * 0.08, size * 1.25 ] ] ), { depth: 0.0032, bevelEnabled: false } ).translate( 0, 0, - 0.0016 );
	let carry = step * 0.5;
	for ( let i = 1; i < pts.length; i ++ ) {
		const [ ax, ay ] = pts[ i - 1 ], [ bx, by ] = pts[ i ];
		const L = Math.hypot( bx - ax, by - ay ), tx = ( bx - ax ) / L, ty = ( by - ay ) / L;
		// outward normal: the tangent turned towards `side`
		const nx = - ty * side, ny = tx * side;
		for ( let d = carry; d < L; d += step ) {
			const x = ax + tx * d, y = ay + ty * d;
			P.put( mat, g0.clone(), [ x + nx * 0.002, y + ny * 0.002, 0 ], [ 0, 0, Math.atan2( ny, nx ) - PI / 2 ] );
			// the lashing that holds each tooth: a turn of cord through the wood beside it
			P.put( 'sennit', new THREE.CylinderGeometry( 0.0021, 0.0021, 0.025, 5 ).rotateX( PI / 2 ), [ x - nx * 0.004 - tx * 0.006, y - ny * 0.004 - ty * 0.006, 0 ] );
			carry = d + step - L;
		}
		if ( carry < 0 ) carry = 0;
	}
}

// block letters (3×5 cells) on a face at height z, read from in front of +z; the item's +x is up, so the line runs
// from +y to -y. cx: the middle of the line in x, u: a cell
const GLYPH = {
	P: [ '111', '101', '111', '100', '100' ], O: [ '111', '101', '101', '101', '111' ], L: [ '100', '100', '100', '100', '111' ],
	I: [ '111', '010', '010', '010', '111' ], C: [ '111', '100', '100', '100', '111' ], E: [ '111', '100', '110', '100', '111' ],
};
function blockText( P, mat, text, cx, u, z ) {
	const n = text.length, y0 = ( n * 4 - 1 ) * u / 2, x0 = cx + 2.5 * u;
	[ ...text ].forEach( ( ch, i ) => ( GLYPH[ ch ] || [] ).forEach( ( row, r ) => [ ...row ].forEach( ( b, c ) => {
		if ( b !== '1' ) return;
		const y = y0 - ( i * 4 + c ) * u, x = x0 - r * u;
		P.box( mat, x - u, x, y - u, y, z, z + 0.0008, 0 );
	} ) ) );
}

// ======================================================================================================================
// melee
// ======================================================================================================================

export const ARMS_MELEE = {
	// a 2×4 offcut, tape on the grip end, nails through the far end (points out of the face you see when it is raised)
	spiked_plank( P ) {
		P.box( 'plank', 0, 0.9, - 0.044, 0.044, - 0.016, 0.016, 0.003 );
		P.box( 'tape', 0.015, 0.25, - 0.0465, 0.0465, - 0.0185, 0.0185, 0.004 );
		for ( const x of [ 0.05, 0.12, 0.19 ] ) P.box( 'tape', x, x + 0.014, - 0.048, 0.048, - 0.0198, 0.0198, 0.003 );
		const nails = [ [ 0.56, - 0.024 ], [ 0.6, 0.022 ], [ 0.64, - 0.004 ], [ 0.68, - 0.027 ], [ 0.71, 0.026 ], [ 0.75, 0.002 ], [ 0.79, - 0.025 ], [ 0.82, 0.024 ], [ 0.86, - 0.006 ] ];
		nails.forEach( ( [ x, y ], i ) => {
			P.cylZ( 'blk', x, y, - 0.0182, - 0.0158, 0.0055, 8 );
			// driven at slightly different angles, as a hurried job is
			P.rod( 'steel', [ x, y, - 0.016 ], [ x + 0.006 * Math.sin( i * 2.1 ), y + 0.006 * Math.cos( i * 1.7 ), 0.085 ], 0.0024, 6, 0.0005 );
		} );
		// two hammered into the edge and bent over
		for ( const x of [ 0.66, 0.79 ] ) { P.rod( 'steel', [ x, 0.044, 0 ], [ x + 0.008, 0.075, 0.002 ], 0.0018, 5, 0.0016 ); P.rod( 'steel', [ x + 0.008, 0.075, 0.002 ], [ x + 0.03, 0.084, 0.004 ], 0.0016, 5, 0.0005 ); }
		return { grip: 0.07, grip2: 0.2, len: 0.9, tip: 0.88, head: 0.75 };
	},

	// a wooden bat with barbed wire wound round the barrel
	barbed_bat( P ) {
		P.lathe( 'wood', BAT, 0, 0, 16 );
		P.lathe( 'gripTape', [ [ 0.006, 0.0149 ], [ 0.2, 0.0159 ] ], 0, 0, 14 );
		const x0 = 0.42, x1 = 0.8, turns = 6.5, n = 150, pts = [];
		for ( let i = 0; i <= n; i ++ ) {
			const t = i / n, x = x0 + ( x1 - x0 ) * t, a = t * turns * PI * 2, r = batR( x ) + 0.0025;
			pts.push( V( x, Math.cos( a ) * r, Math.sin( a ) * r ) );
		}
		P.put( 'steel', tube( pts, 0.0017, 150, 5 ) );
		// the second strand twisted along the first
		const pts2 = pts.map( ( p, i ) => { const a = i * 0.9; return V( p.x, p.y + Math.cos( a ) * 0.0025, p.z + Math.sin( a ) * 0.0025 ); } );
		P.put( 'steel', tube( pts2, 0.0013, 150, 3 ) );
		// barbs: short wire ends standing off the strands
		for ( let i = 0; i < 24; i ++ ) {
			const t = ( i + 0.5 ) / 24, x = x0 + ( x1 - x0 ) * t, a = t * turns * PI * 2, r = batR( x ) + 0.0025;
			for ( const s of [ - 1, 1 ] ) P.rod( 'steel', [ x, Math.cos( a ) * r, Math.sin( a ) * r ], [ x + s * 0.008, Math.cos( a + s * 0.25 ) * ( r + 0.013 ), Math.sin( a + s * 0.25 ) * ( r + 0.013 ) ], 0.0012, 4, 0.0004 );
		}
		return { grip: 0.07, grip2: 0.16, len: 0.845, tip: 0.8, head: 0.7 };
	},

	// a machete lashed to the end of a pole with duct tape
	machete_spear( P, H ) {
		H.handle( P, 'walnut', 0.0, 1.5, 0.016, 0.0145, 10 );
		P.box( 'poly', 1.36, 1.5, - 0.016, 0.014, 0.0145, 0.0365, 0.008 );
		P.extS( 'blade', [ [ 1.5, - 0.012 ], [ 1.895, - 0.004 ], [ 1.96, 0.012, 0.01 ], [ 1.945, 0.05, 0.02 ], [ 1.825, 0.058, 0.03 ], [ 1.515, 0.04 ], [ 1.5, 0.03 ] ], 0.0014, 0.0012, 0.0255, [], 4 );
		for ( const x of [ 1.37, 1.41, 1.45, 1.485 ] ) tapeBand( P, x, 0.022, - 0.0195, 0.0175, - 0.0185, 0.0395 );
		return { grip: 0.45, grip2: 0.95, len: 1.96, tip: 1.95, head: 1.8, spear: 1 };
	},

	// a kitchen knife taped to a broom handle
	knife_spear( P, H ) {
		H.handle( P, 'pale', 0.0, 1.38, 0.0135, 0.0125, 10 );
		P.box( 'poly', 1.27, 1.38, - 0.012, 0.012, 0.0125, 0.0285, 0.006 );
		knife( P, 'blade', 1.38, 0.2, 0.042, 0.0205 );
		for ( const x of [ 1.285, 1.335 ] ) tapeBand( P, x, 0.03, - 0.018, 0.016, - 0.018, 0.033 );
		return { grip: 0.4, grip2: 0.85, len: 1.58, tip: 1.57, head: 1.48, spear: 1 };
	},

	// a screwdriver ground to a point, its handle wound with tape
	screwdriver_shiv( P ) {
		P.lathe( 'red', [ [ - 0.002, 0.0 ], [ - 0.002, 0.011 ], [ 0.004, 0.0142 ], [ 0.085, 0.0132 ], [ 0.1, 0.009 ], [ 0.106, 0.005 ], [ 0.107, 0.0 ] ], 0, 0, 12 );
		P.lathe( 'tape', [ [ 0.012, 0.0151 ], [ 0.07, 0.0146 ] ], 0, 0, 12 );
		P.cyl( 'steel', 0.104, 0.205, 0.0036, 0, 0, 8, 0.0031 );
		P.cyl( 'chrome', 0.205, 0.25, 0.0031, 0, 0, 8, 0.0003 );
		return { grip: 0.05, len: 0.25, tip: 0.25 };
	},

	// a composite hockey stick: the shaft, a taped knob, and the blade angled off the heel with cloth tape round it
	hockey_stick( P ) {
		P.box( 'poly', 0.0, 1.24, - 0.016, 0.016, - 0.0115, 0.0115, 0.004 );
		P.box( 'white', 0.0, 0.05, - 0.0178, 0.0178, - 0.0132, 0.0132, 0.005 );
		const hx = 1.2, hy = 0.0, ux = 0.66, uy = - 0.75, nx = 0.75, ny = 0.66;
		const at = ( u, n ) => [ hx + ux * u + nx * n, hy + uy * u + ny * n ];
		P.extS( 'poly', [ at( - 0.02, - 0.014 ), at( 0.3, - 0.01 ), [ ...at( 0.315, 0.035 ), 0.02 ], [ ...at( 0.29, 0.068 ), 0.02 ], at( 0.03, 0.074 ), at( - 0.06, 0.03 ) ], 0.0062, 0.0015 );
		P.extS( 'white', [ at( 0.06, - 0.0128 ), at( 0.24, - 0.0108 ), at( 0.24, 0.0695 ), at( 0.06, 0.0728 ) ], 0.0071, 0.001 );
		return { grip: 0.08, grip2: 0.5, len: 1.45, tip: 1.42, head: 1.32 };
	},

	// the shovel, its spade filed to a bright edge
	sharpened_shovel( P, H ) {
		H.handle( P, 'wood', 0.0, 0.72, 0.016, 0.017, 10 );
		P.extS( 'blk', [ [ - 0.04, - 0.05 ], [ 0.0, - 0.05 ], [ 0.0, 0.05 ], [ - 0.04, 0.05 ] ], 0.011, 0.004, 0, [ [ [ - 0.034, - 0.04 ], [ - 0.006, - 0.04 ], [ - 0.006, 0.04 ], [ - 0.034, 0.04 ] ] ] );
		P.cyl( 'blk', 0.7, 0.78, 0.019, 0, 0, 10, 0.022 );
		P.extTop( 'rust', [ [ 0.77, - 0.1, 0.01 ], [ 0.77, 0.1, 0.01 ], [ 0.95, 0.09, 0.04 ], [ 1.005, 0.0, 0.006 ], [ 0.95, - 0.09, 0.04 ] ], - 0.003, 0.003, 0.001 );
		P.extTop( 'blade', [ [ 0.925, - 0.091 ], [ 0.953, - 0.093, 0.02 ], [ 1.011, 0.0, 0.003 ], [ 0.953, 0.093, 0.02 ], [ 0.925, 0.091 ], [ 0.94, 0.079 ], [ 0.99, 0.0 ], [ 0.94, - 0.079 ] ], - 0.0024, 0.0024, 0.0004 );
		return { grip: - 0.02, grip2: 0.5, len: 1.01, tip: 0.99, head: 0.9, flat: 1 };
	},

	// a two-piece pool cue: dark butt with a bumper and inlay rings, a brass joint, a pale shaft, ferrule and tip
	pool_cue( P ) {
		P.lathe( 'walnut', [ [ - 0.004, 0.0 ], [ - 0.004, 0.0136 ], [ 0.002, 0.0148 ], [ 0.62, 0.0127 ] ], 0, 0, 14 );
		P.lathe( 'rubber', [ [ - 0.014, 0.0 ], [ - 0.014, 0.0122 ], [ - 0.004, 0.0137 ] ], 0, 0, 12 );
		for ( const x of [ 0.06, 0.32, 0.34 ] ) P.lathe( 'white', [ [ x, 0.0148 - x * 0.0034 ], [ x + 0.006, 0.0148 - x * 0.0034 ] ], 0, 0, 14 );
		P.cyl( 'gold', 0.615, 0.635, 0.0131, 0, 0, 14 );
		P.lathe( 'pale', [ [ 0.634, 0.0126 ], [ 1.42, 0.0066 ] ], 0, 0, 12 );
		P.cyl( 'white', 1.42, 1.444, 0.0066, 0, 0, 10 );
		P.cyl( 'blue', 1.444, 1.452, 0.0063, 0, 0, 10, 0.0056 );
		return { grip: 0.12, grip2: 0.52, len: 1.452, tip: 1.45, head: 1.25 };
	},

	// a pale wooden rolling pin
	rolling_pin( P ) {
		P.lathe( 'pale', [ [ 0.0, 0.0 ], [ 0.0, 0.0105 ], [ 0.005, 0.0122 ], [ 0.07, 0.0115 ], [ 0.085, 0.0088 ], [ 0.096, 0.0088 ], [ 0.098, 0.0285 ], [ 0.102, 0.0302 ], [ 0.358, 0.0302 ], [ 0.362, 0.0285 ], [ 0.364, 0.0088 ], [ 0.375, 0.0088 ], [ 0.39, 0.0115 ], [ 0.455, 0.0122 ], [ 0.46, 0.0105 ], [ 0.46, 0.0 ] ], 0, 0, 18 );
		return { grip: 0.045, len: 0.46, tip: 0.46, head: 0.3, hold: 'one' };
	},

	// a butcher's cleaver: riveted wooden handle, broad blade with a hanging hole, a bright edge (+y)
	meat_cleaver( P ) {
		P.box( 'walnut', 0.0, 0.12, - 0.013, 0.011, - 0.009, 0.009, 0.006 );
		for ( const x of [ 0.028, 0.062, 0.096 ] ) P.cylZ( 'steel', x, - 0.001, - 0.0096, 0.0096, 0.0027, 8 );
		P.cyl( 'steel', 0.116, 0.134, 0.0112, - 0.001, 0, 10, 0.0095 );
		const hole = [];
		for ( let i = 0; i < 12; i ++ ) { const a = - i / 12 * PI * 2; hole.push( [ 0.282 + Math.cos( a ) * 0.0075, 0.002 + Math.sin( a ) * 0.0075 ] ); }
		P.extS( 'blade', [ [ 0.13, - 0.016 ], [ 0.303, - 0.016, 0.004 ], [ 0.308, 0.084, 0.006 ], [ 0.136, 0.079 ], [ 0.13, 0.024 ] ], 0.0016, 0.0012, 0, [ hole ] );
		P.extS( 'chrome', [ [ 0.137, 0.071 ], [ 0.306, 0.075 ], [ 0.306, 0.0835 ], [ 0.137, 0.0788 ] ], 0.00175, 0.0004 );
		return { grip: 0.06, len: 0.31, tip: 0.3, head: 0.24, hold: 'one' };
	},

	// a garden sickle: a wooden handle and a crescent blade, sharp on the inside of the curve
	sickle( P, H ) {
		H.handle( P, 'wood', 0.0, 0.13, 0.0142, 0.0125, 10 );
		P.cyl( 'steel', 0.125, 0.146, 0.0108, 0, 0, 10, 0.0092 );
		const cx = 0.245, cy = 0.072, R = 0.112, a0 = - 2.55, a1 = 1.95, n = 22;
		const outer = [], inner = [], edge = [];
		for ( let i = 0; i <= n; i ++ ) {
			const t = i / n, a = a0 + ( a1 - a0 ) * t, w = 0.036 * ( 1 - t * 0.85 ) * Math.min( 1, ( 1 - t ) * 6 ) + 0.002, c = Math.cos( a ), s = Math.sin( a );
			outer.push( [ cx + c * R, cy + s * R ] );
			inner.push( [ cx + c * ( R - w ), cy + s * ( R - w ) ] );
			edge.push( [ cx + c * ( R - w + Math.min( w, 0.007 ) ), cy + s * ( R - w + Math.min( w, 0.007 ) ) ] );
		}
		P.extS( 'steel', [ ...outer, ...inner.slice().reverse() ], 0.0014, 0.0008, 0, [], 2 );
		P.extS( 'blade', [ ...edge, ...inner.slice().reverse() ], 0.00145, 0.0003, 0, [], 2 );
		return { grip: 0.06, len: 0.36, tip: 0.33, head: 0.3, hold: 'one' };
	},

	// a willow cricket bat: rubber-gripped cane handle, a flat face (+y) and a ridged back
	cricket_bat( P ) {
		P.cyl( 'gripTape', 0.0, 0.27, 0.0165, 0, 0, 12 );
		for ( let i = 0; i < 9; i ++ ) P.lathe( 'gripTape', [ [ 0.012 + i * 0.028, 0.0174 ], [ 0.021 + i * 0.028, 0.0174 ] ], 0, 0, 12 );
		P.cyl( 'pale', 0.265, 0.32, 0.0152, 0, 0, 12, 0.021 );
		P.extFront( 'pale', [ [ - 0.054, 0.013 ], [ 0.054, 0.013 ], [ 0.054, - 0.004, 0.006 ], [ 0.026, - 0.02 ], [ 0.0, - 0.03, 0.02 ], [ - 0.026, - 0.02 ], [ - 0.054, - 0.004, 0.006 ] ], 0.31, 0.865, 0.004 );
		// the maker's sticker on the face
		P.box( 'blue', 0.36, 0.46, 0.0128, 0.0142, - 0.035, 0.035, 0.0005 );
		return { grip: 0.06, grip2: 0.19, len: 0.865, tip: 0.85, head: 0.65 };
	},

	// a plantation bolo: wooden grip, brass ferrule, the blade widening to a heavy belly near the point
	bolo_knife( P ) {
		P.box( 'walnut', 0.0, 0.12, - 0.014, 0.014, - 0.011, 0.011, 0.008 );
		P.cyl( 'gold', 0.114, 0.128, 0.0128, 0, 0, 10 );
		P.extS( 'blade', [ [ 0.125, - 0.009 ], [ 0.4, - 0.005 ], [ 0.47, 0.004, 0.012 ], [ 0.495, 0.032, 0.02 ], [ 0.465, 0.07, 0.02 ], [ 0.33, 0.071 ], [ 0.2, 0.04 ], [ 0.13, 0.024 ] ], 0.0016, 0.0013, 0, [], 4 );
		return { grip: 0.06, len: 0.495, tip: 0.48, head: 0.4 };
	},

	// a farm pitchfork: four tines off a crossbar on a long ash handle
	pitchfork( P, H ) {
		H.handle( P, 'pale', 0.0, 1.22, 0.015, 0.016, 10 );
		P.cyl( 'blk', 1.19, 1.275, 0.0185, 0, 0, 10, 0.013 );
		P.box( 'blk', 1.265, 1.292, - 0.072, 0.072, - 0.0065, 0.0065, 0.004 );
		for ( const y of [ - 0.062, - 0.021, 0.021, 0.062 ] ) {
			P.rod( 'blk', [ 1.278, y, 0 ], [ 1.45, y * 1.06, 0.01 ], 0.0046, 6, 0.0039 );
			P.rod( 'blk', [ 1.45, y * 1.06, 0.01 ], [ 1.6, y * 1.1, 0.028 ], 0.0039, 6, 0.0007 );
		}
		return { grip: 0.45, grip2: 0.9, len: 1.6, tip: 1.58, head: 1.5, spear: 1 };
	},

	// brass knuckles: four finger rings in a row along the grip and the palm bar
	brass_knuckles( P ) {
		for ( let i = 0; i < 4; i ++ ) P.put( 'gold', new THREE.TorusGeometry( 0.0108, 0.0043, 6, 16 ), [ 0.006 + i * 0.0245, 0.0 , 0.02 ] );
		P.box( 'gold', - 0.006, 0.08, - 0.004, 0.004, 0.006, 0.012, 0.002 );
		P.put( 'gold', new THREE.TorusGeometry( 0.044, 0.0058, 6, 18, PI ).scale( 1, 0.42, 1 ), [ 0.0365, 0.0, 0.004 ], [ PI / 2, 0, 0 ] );
		return { grip: 0.04, len: 0.1, tip: 0.1, hold: 'knife' };
	},

	// a riot shield: a clear polycarbonate plate in front of the hand (+z), a rubber rim and a dark band, the handle
	// on two posts on its back and a strap for the forearm below it
	riot_shield( P ) {
		const X = 0.45, Y = 0.27, z = 0.052;
		P.box( 'polycarb', - X, X, - Y, Y, z, z + 0.006, 0 );
		for ( const [ x0, x1, y0, y1 ] of [ [ - X - 0.008, X + 0.008, Y, Y + 0.008 ], [ - X - 0.008, X + 0.008, - Y - 0.008, - Y ], [ X, X + 0.008, - Y, Y ], [ - X - 0.008, - X, - Y, Y ] ] ) P.box( 'rubber', x0, x1, y0, y1, z - 0.004, z + 0.01, 0.002 );
		P.box( 'blk', 0.15, 0.26, - Y, Y, z + 0.0062, z + 0.0075, 0 );
		blockText( P, 'white', 'POLICE', 0.205, 0.0142, z + 0.0075 );
		P.cyl( 'rubber', - 0.075, 0.075, 0.0128, 0, 0, 10 );
		for ( const x of [ - 0.09, 0.09 ] ) P.box( 'blk', x - 0.012, x + 0.012, - 0.011, 0.011, - 0.012, z, 0.003 );
		P.box( 'nylon', - 0.27, - 0.21, - 0.06, 0.06, 0.028, z, 0.006 );
		return { grip: 0.0, len: 0.9, tip: 0.45, head: 0.3, hold: 'shield' };
	},

	// ---- Hawaiian ----

	// leiomano: a koa paddle-shaped club, shark teeth lashed round the edge of its head, a cord loop at the butt
	leiomano( P, H ) {
		const up = [ [ 0.0, 0.0155 ], [ 0.13, 0.0135 ], [ 0.17, 0.03, 0.02 ], [ 0.22, 0.052, 0.03 ], [ 0.29, 0.062, 0.04 ], [ 0.35, 0.052, 0.03 ], [ 0.385, 0.03, 0.02 ], [ 0.402, 0.0, 0.01 ] ];
		const lo = up.slice( 0, - 1 ).reverse().map( ( [ x, y, r ] ) => r ? [ x, - y, r ] : [ x, - y ] );
		P.extS( 'koa', [ ...up, ...lo ], 0.0105, 0.004, 0, [], 4 );
		const edgeU = [ [ 0.175, 0.033 ], [ 0.22, 0.054 ], [ 0.29, 0.0645 ], [ 0.35, 0.054 ], [ 0.386, 0.031 ], [ 0.405, 0.0 ] ];
		teethAlong( P, 'ivory', edgeU, 1, 0.024, 0.016, H );
		teethAlong( P, 'ivory', edgeU.map( ( [ x, y ] ) => [ x, - y ] ), - 1, 0.024, 0.016, H );
		for ( let i = 0; i < 6; i ++ ) P.box( 'sennit', 0.01 + i * 0.019, 0.02 + i * 0.019, - 0.017, 0.017, - 0.012, 0.012, 0.004 );
		P.put( 'sennit', new THREE.TorusGeometry( 0.018, 0.0026, 5, 14 ), [ - 0.022, 0, 0 ] );
		return { grip: 0.065, len: 0.42, tip: 0.4, head: 0.3, hold: 'one' };
	},

	// pāhoa: a hardwood dagger, leaf-shaped point with a ridge, a cord-bound grip and a wrist loop
	pahoa( P ) {
		P.extS( 'lam', [ [ - 0.01, - 0.012 ], [ 0.1, - 0.014 ], [ 0.12, - 0.022, 0.006 ], [ 0.2, - 0.017 ], [ 0.29, - 0.004 ], [ 0.312, 0.0 ], [ 0.29, 0.004 ], [ 0.2, 0.017 ], [ 0.12, 0.022, 0.006 ], [ 0.1, 0.014 ], [ - 0.01, 0.012 ] ], 0.007, 0.003, 0, [], 3 );
		P.extS( 'lam', [ [ 0.125, - 0.003 ], [ 0.292, - 0.001 ], [ 0.292, 0.001 ], [ 0.125, 0.003 ] ], 0.0086, 0.001 );
		for ( let i = 0; i < 9; i ++ ) P.box( 'sennit', 0.004 + i * 0.0105, 0.0115 + i * 0.0105, - 0.0158, 0.0158, - 0.0094, 0.0094, 0.004 );
		P.put( 'sennit', new THREE.TorusGeometry( 0.017, 0.0024, 5, 14 ), [ - 0.026, 0, 0 ] );
		return { grip: 0.05, len: 0.312, tip: 0.31 };
	},

	// newa: a short hardwood war club, a slim grip swelling to a heavy round head
	newa( P ) {
		P.lathe( 'lam', [ [ - 0.01, 0.0 ], [ - 0.01, 0.012 ], [ 0.0, 0.0152 ], [ 0.2, 0.0132 ], [ 0.28, 0.02 ], [ 0.33, 0.035 ], [ 0.38, 0.0462 ], [ 0.42, 0.0455 ], [ 0.45, 0.035 ], [ 0.47, 0.017 ], [ 0.476, 0.0 ] ], 0, 0, 16 );
		P.lathe( 'sennit', [ [ 0.015, 0.0158 ], [ 0.11, 0.0149 ] ], 0, 0, 12 );
		for ( const x of [ 0.02, 0.06, 0.1 ] ) P.lathe( 'sennit', [ [ x, 0.0166 ], [ x + 0.004, 0.0166 ] ], 0, 0, 12 );
		P.put( 'sennit', new THREE.TorusGeometry( 0.019, 0.0028, 5, 14 ), [ - 0.03, 0, 0 ] );
		return { grip: 0.065, len: 0.476, tip: 0.47, head: 0.4, hold: 'one' };
	},

	// a koa spear (ihe): a long tapered shaft, a carved barbed head bound with cord below it
	koa_spear( P, H ) {
		P.lathe( 'koa', [ [ 0.0, 0.0 ], [ 0.0, 0.0115 ], [ 0.05, 0.0152 ], [ 1.65, 0.0165 ], [ 2.0, 0.013 ], [ 2.17, 0.0098 ], [ 2.3, 0.0 ] ], 0, 0, 10 );
		for ( const x of [ 2.02, 2.085 ] ) for ( const s of [ 1, - 1 ] ) P.extS( 'koa', s > 0 ? [ [ x, 0.008 ], [ x + 0.04, 0.0085 ], [ x - 0.012, 0.03 ] ] : [ [ x, - 0.008 ], [ x - 0.012, - 0.03 ], [ x + 0.04, - 0.0085 ] ], 0.0034, 0.0008 );
		for ( let i = 0; i < 6; i ++ ) P.lathe( 'sennit', [ [ 1.93 + i * 0.012, 0.0148 ], [ 1.938 + i * 0.012, 0.0148 ] ], 0, 0, 10 );
		void H;
		return { grip: 0.75, grip2: 1.15, len: 2.3, tip: 2.3, head: 2.15, spear: 1 };
	},
};

// ======================================================================================================================
// attachments (the rail-free gun fittings)
// ======================================================================================================================

export const ARMS_ATTACH = {
	// a nylon sling, coiled, with its two swivels
	arms_sling( P ) {
		for ( const [ y, R ] of [ [ 0.004, 0.068 ], [ 0.011, 0.062 ] ] ) P.put( 'nylon', new THREE.TorusGeometry( R, 0.0062, 4, 28 ).scale( 1, 1, 0.28 ).rotateX( PI / 2 ), [ 0, y, 0 ] );
		P.box( 'blk', 0.045, 0.075, 0.0, 0.012, - 0.016, 0.016, 0.003 );
		for ( const x of [ - 0.07, - 0.05 ] ) P.put( 'steel', new THREE.TorusGeometry( 0.011, 0.0022, 5, 14 ), [ x, 0.006, 0.05 ], [ PI / 2, 0, 0.6 ] );
		return { len: 0.14 };
	},
	// a neoprene stock sleeve with a cheek pad and a strip of elastic loops
	arms_wrap( P ) {
		P.put( 'gripTape', new THREE.CylinderGeometry( 0.032, 0.03, 0.15, 16, 1, true ).rotateZ( - PI / 2 ), [ 0, 0, 0 ], null, [ 1, 1.25, 0.8 ] );
		P.box( 'nylon', - 0.05, 0.05, 0.022, 0.04, - 0.022, 0.022, 0.008 );
		for ( let i = 0; i < 5; i ++ ) P.box( 'nylon', - 0.06 + i * 0.024, - 0.044 + i * 0.024, - 0.012, 0.012, 0.024, 0.031, 0.002 );
		return { len: 0.15 };
	},
	// a flashlight taped along the right of the barrel (+z), two wide bands of duct tape round both
	arms_tapedlight( P ) {
		P.cyl( 'blk', - 0.085, 0.055, 0.0142, 0, 0.026, 14 );
		P.cyl( 'blk', 0.055, 0.075, 0.0142, 0, 0.026, 16, 0.0195 );
		P.cyl( 'blk', 0.075, 0.098, 0.0195, 0, 0.026, 16 );
		const lamp = P.sub( 'lamp', 0.098, 0, 0.026 );
		lamp.cyl( 'white', 0.097, 0.0995, 0.0172, 0, 0.026, 16 );
		P.box( 'red', - 0.02, - 0.008, 0.012, 0.016, 0.022, 0.03, 0.001 );
		for ( const x of [ - 0.06, 0.02 ] ) {
			P.cyl( 'tape', x, x + 0.03, 0.0163, 0, 0.026, 14 );
			P.box( 'tape', x, x + 0.03, - 0.0145, 0.0145, - 0.012, 0.026, 0.004 );
		}
		return { lamp: [ 0.0995, 0, 0.026 ] };
	},
	// a bayonet: the muzzle ring and crossguard, the grip back under the barrel, the blade forward of the muzzle
	arms_bayonet( P ) {
		P.torusX( 'blk', 0.0, 0, 0, 0.0118, 0.0028, 14 );
		P.box( 'blk', - 0.006, 0.006, - 0.034, - 0.008, - 0.0055, 0.0055, 0.002 );
		P.box( 'poly', - 0.128, - 0.006, - 0.044, - 0.024, - 0.0085, 0.0085, 0.005 );
		for ( let i = 0; i < 6; i ++ ) P.box( 'poly', - 0.118 + i * 0.019, - 0.11 + i * 0.019, - 0.0455, - 0.0425, - 0.0088, 0.0088, 0.001 );
		P.box( 'blk', - 0.136, - 0.124, - 0.0455, - 0.019, - 0.0095, 0.0095, 0.002 );
		P.extS( 'darkblade', [ [ 0.002, - 0.042 ], [ 0.15, - 0.037 ], [ 0.176, - 0.03, 0.004 ], [ 0.148, - 0.021 ], [ 0.002, - 0.022 ] ], 0.0017, 0.0012 );
		P.extS( 'blade', [ [ 0.01, - 0.0415 ], [ 0.15, - 0.0368 ], [ 0.175, - 0.0302 ], [ 0.15, - 0.035 ], [ 0.01, - 0.039 ] ], 0.00185, 0.0003 );
		return { len: 0.176 };
	},
	// a kitchen knife taped under the barrel: its handle along the barrel, two bands of tape round both
	arms_tapebay( P ) {
		P.box( 'poly', - 0.112, 0.0, - 0.044, - 0.022, - 0.008, 0.008, 0.005 );
		P.extS( 'blade', [ [ 0.0, - 0.046 ], [ 0.13, - 0.044 ], [ 0.19, - 0.03, 0.004 ], [ 0.1, - 0.022 ], [ 0.0, - 0.022 ] ], 0.0012, 0.001 );
		for ( const x of [ - 0.088, - 0.032 ] ) {
			P.box( 'tape', x, x + 0.03, - 0.048, 0.013, - 0.0135, 0.0135, 0.006 );
		}
		return { len: 0.19 };
	},
};

// ======================================================================================================================
// throwables
// ======================================================================================================================

export const ARMS_THROW = {
	// a braided string of firecrackers: little red tubes splayed off a central cord, the fuse out of the top
	firecracker_string( P ) {
		P.cylY( 'string', 0, - 0.1, 0.1, 0.0014, 0, 4 );
		for ( let i = 0; i < 26; i ++ ) {
			const y = - 0.092 + i * 0.0072, a = i * 2.4, c = Math.cos( a ), s = Math.sin( a );
			P.rod( 'paper', [ c * 0.002, y, s * 0.002 ], [ c * 0.026, y - 0.012, s * 0.026 ], 0.0042, 6 );
			P.rod( 'card', [ c * 0.026, y - 0.012, s * 0.026 ], [ c * 0.0275, y - 0.0128, s * 0.0275 ], 0.0042, 6 );
		}
		P.box( 'paper', - 0.014, 0.014, 0.098, 0.118, - 0.0025, 0.0025, 0.002 );
		P.box( 'gold', - 0.008, 0.008, 0.103, 0.113, - 0.003, 0.003, 0.001 );
		P.rod( 'green2', [ 0, 0.118, 0 ], [ 0.012, 0.156, 0.004 ], 0.0013, 4 );
	},
	// a 5,000-pop New Year roll: a red drum of wound crackers, gold rims, the fuse sticking out of its side
	firecracker_roll( P ) {
		P.cylY( 'paper', 0, - 0.028, 0.028, 0.072, 0, 28 );
		for ( const y of [ - 0.03, 0.026 ] ) P.cylY( 'gold', 0, y, y + 0.004, 0.0735, 0, 28 );
		P.cylY( 'card', 0, 0.028, 0.0285, 0.016, 0, 12 );
		for ( let ring = 0; ring < 3; ring ++ ) {
			const R = 0.028 + ring * 0.016, n = 10 + ring * 6;
			for ( let i = 0; i < n; i ++ ) {
				const a = ( i + ring * 0.5 ) / n * PI * 2, c = Math.cos( a ), s = Math.sin( a );
				P.rod( 'paper', [ c * R, 0.028, s * R ], [ c * ( R + 0.011 ), 0.036, s * ( R + 0.011 ) ], 0.0034, 5 );
			}
		}
		P.box( 'gold', - 0.03, 0.03, - 0.012, 0.012, 0.0725, 0.0742, 0.001 );
		P.rod( 'green2', [ 0.072, 0.0, 0 ], [ 0.11, 0.012, 0.01 ], 0.0014, 4 );
	},
	// a throwing knife: one piece of dark steel, a slim spear point, a cord-wrapped handle with a hole at the end
	throwing_knife( P ) {
		const hole = [];
		for ( let i = 0; i < 10; i ++ ) { const a = - i / 10 * PI * 2; hole.push( [ Math.cos( a ) * 0.0045, - 0.052 + Math.sin( a ) * 0.0045 ] ); }
		P.extS( 'darkblade', [ [ - 0.009, - 0.062, 0.004 ], [ 0.009, - 0.062, 0.004 ], [ 0.0095, 0.035 ], [ 0.0145, 0.046 ], [ 0.0045, 0.165 ], [ 0.0, 0.178 ], [ - 0.0045, 0.165 ], [ - 0.0145, 0.046 ], [ - 0.0095, 0.035 ] ], 0.0019, 0.0012, 0, [ hole ], 3 );
		P.extS( 'blade', [ [ - 0.0005, 0.05 ], [ 0.0005, 0.05 ], [ 0.0012, 0.16 ], [ 0.0, 0.172 ], [ - 0.0012, 0.16 ] ], 0.0021, 0.0002 );
		for ( let i = 0; i < 8; i ++ ) P.box( 'nylon', - 0.0108, 0.0108, - 0.042 + i * 0.0094, - 0.035 + i * 0.0094, - 0.0034, 0.0034, 0.002 );
	},
};
