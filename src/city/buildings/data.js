// Building records, deterministic shapes and palettes. Plain JS: shared by the main thread and the
// building worker so both agree on every building's massing, storeys and colours.
//
// world.meta.buildings.data holds 11 numbers per building: x, z, w, d, angle, base, lo, type, floors, city, style.
// `angle` is the bake angle: local x -> (cos a, sin a) in xz, local z -> (-sin a, cos a). three.js yaw = -angle.
// The front (street, main door) faces local -z.

export const NF = 11;

export const BT = {
	house: 1, apartment: 2, office: 3, hotel: 4, grocery: 5, convenience: 6, pharmacy: 7, hardware: 8, gunstore: 9,
	clothing: 10, sports: 11, surf: 12, restaurant: 13, bar: 14, fastfood: 15, gas: 16, police: 17, fire: 18,
	hospital: 19, clinic: 20, school: 21, church: 22, warehouse: 23, garage: 24, barracks: 25, mil_hq: 26,
	armory: 27, hangar: 28, terminal: 29, tower: 30, observatory: 31, bank: 32, post: 33, pawn: 34, shed: 35,
	mil_tent: 36, market: 37,
};
export const TYPE_OF = [];
for ( const k in BT ) TYPE_OF[ BT[ k ] ] = k;

// display names (the /locate list and "Gun store (Honolulu)")
export const LABEL = {
	house: 'House', apartment: 'Apartment building', office: 'Office building', hotel: 'Hotel', grocery: 'Grocery store',
	convenience: 'Convenience store', pharmacy: 'Pharmacy', hardware: 'Hardware store', gunstore: 'Gun store', clothing: 'Clothing store',
	sports: 'Sporting goods store', surf: 'Surf shop', restaurant: 'Restaurant', bar: 'Bar', fastfood: 'Fast food restaurant',
	gas: 'Gas station', police: 'Police station', fire: 'Fire station', hospital: 'Hospital', clinic: 'Clinic', school: 'School',
	church: 'Church', warehouse: 'Warehouse', garage: 'Auto repair shop', barracks: 'Barracks', mil_hq: 'Military headquarters',
	armory: 'Armory', hangar: 'Hangar', terminal: 'Airport terminal', tower: 'Control tower', observatory: 'Observatory', bank: 'Bank',
	post: 'Post office', pawn: 'Pawn shop', shed: 'Shed', mil_tent: 'Military tent', market: 'Market',
};
// short names for /locate (matched loosely, so "gun store", "gunstore" and "gun stores" all work)
export const LOCATE = {
	house: 'house', apartment: 'apartment', office: 'office', hotel: 'hotel', grocery: 'grocery store', convenience: 'convenience store',
	pharmacy: 'pharmacy', hardware: 'hardware store', gunstore: 'gun store', clothing: 'clothing store', sports: 'sports store', surf: 'surf shop',
	restaurant: 'restaurant', bar: 'bar', fastfood: 'fast food', gas: 'gas station', police: 'police station', fire: 'fire station',
	hospital: 'hospital', clinic: 'clinic', school: 'school', church: 'church', warehouse: 'warehouse', garage: 'garage', barracks: 'barracks',
	mil_hq: 'military hq', armory: 'armory', hangar: 'hangar', terminal: 'terminal', tower: 'control tower', observatory: 'observatory',
	bank: 'bank', post: 'post office', pawn: 'pawn shop', shed: 'shed', mil_tent: 'military tent', market: 'market',
};

// ---- deterministic randomness ------------------------------------------------------------------------

export function hash32( a, b = 0, c = 0 ) {
	let h = Math.imul( a | 0, 0x27d4eb2d ) ^ Math.imul( b | 0, 0x165667b1 ) ^ Math.imul( c | 0, 0x2f0d5f3b ) ^ 0x9e3779b9;
	h = Math.imul( h ^ ( h >>> 15 ), 0x85ebca6b );
	h = Math.imul( h ^ ( h >>> 13 ), 0xc2b2ae35 );
	return ( h ^ ( h >>> 16 ) ) >>> 0;
}
export function strHash( s ) {
	let h = 2166136261;
	for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	return h >>> 0;
}
export function rng( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6D2B79F5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}
export const pick = ( R, a ) => a[ Math.floor( R() * a.length ) % a.length ];

// ---- records -----------------------------------------------------------------------------------------

export function readBuilding( data, i, o = {} ) {
	const k = i * NF;
	o.i = i; o.x = data[ k ]; o.z = data[ k + 1 ]; o.w = data[ k + 2 ]; o.d = data[ k + 3 ];
	o.angle = data[ k + 4 ]; o.base = data[ k + 5 ]; o.lo = data[ k + 6 ];
	o.type = TYPE_OF[ data[ k + 7 ] ] || 'house'; o.floors = data[ k + 8 ]; o.city = data[ k + 9 ]; o.style = data[ k + 10 ];
	o.yaw = - o.angle; o.c = Math.cos( o.angle ); o.s = Math.sin( o.angle );
	return o;
}

// building-local (lx, lz) -> world xz
export function toWorld( r, lx, lz, out ) {
	out[ 0 ] = r.x + lx * r.c - lz * r.s;
	out[ 1 ] = r.z + lx * r.s + lz * r.c;
	return out;
}
export function toLocal( r, wx, wz, out ) {
	const dx = wx - r.x, dz = wz - r.z;
	out[ 0 ] = dx * r.c + dz * r.s;
	out[ 1 ] = - dx * r.s + dz * r.c;
	return out;
}

// ---- palettes (sRGB 0..255) -----------------------------------------------------------------------------

export const PAL = {
	siding: [ [ 238, 234, 224 ], [ 239, 227, 196 ], [ 201, 216, 182 ], [ 176, 192, 160 ], [ 190, 212, 220 ], [ 239, 222, 158 ], [ 232, 200, 186 ], [ 160, 176, 156 ], [ 222, 214, 200 ], [ 205, 190, 160 ] ],
	trim: [ [ 244, 242, 236 ], [ 62, 92, 70 ], [ 96, 70, 52 ], [ 238, 236, 228 ], [ 70, 88, 104 ] ],
	tin: [ [ 150, 62, 44 ], [ 70, 104, 78 ], [ 168, 174, 176 ], [ 132, 84, 58 ], [ 70, 116, 120 ], [ 214, 214, 206 ], [ 110, 110, 108 ] ],
	stucco: [ [ 222, 206, 176 ], [ 230, 216, 186 ], [ 224, 186, 162 ], [ 236, 226, 182 ], [ 236, 232, 222 ], [ 204, 204, 198 ], [ 198, 222, 204 ], [ 214, 204, 222 ], [ 240, 214, 190 ], [ 206, 226, 230 ] ],
	concrete: [ [ 196, 192, 184 ], [ 182, 178, 170 ], [ 208, 202, 190 ], [ 170, 168, 164 ], [ 214, 208, 196 ] ],
	glass: [ [ 70, 104, 112 ], [ 96, 110, 128 ], [ 112, 98, 82 ], [ 64, 86, 102 ], [ 120, 132, 138 ] ],
	door: [ [ 120, 74, 44 ], [ 150, 40, 36 ], [ 40, 70, 60 ], [ 238, 236, 228 ], [ 60, 70, 90 ], [ 96, 60, 36 ], [ 180, 150, 100 ] ],
	awning: [ [ 170, 40, 36 ], [ 36, 96, 70 ], [ 38, 70, 128 ], [ 214, 170, 50 ], [ 60, 60, 64 ], [ 200, 90, 40 ], [ 30, 120, 130 ] ],
	wall_in: [ [ 238, 234, 224 ], [ 234, 228, 212 ], [ 222, 226, 222 ], [ 236, 226, 206 ], [ 214, 222, 228 ], [ 242, 240, 234 ] ],
};

// ---- shapes: massing, storeys and heights -------------------------------------------------------------

const TOWER_TYPES = { office: 1, apartment: 1, hotel: 1 };

// every building's effective storey count. The bake is conservative; the big-city cores get a skyline.
export function storeysOf( r, cities, type = r.type ) {
	const city = cities[ r.city ];
	let n = Math.max( 1, r.floors | 0 );
	if ( ! city || ! TOWER_TYPES[ type ] ) return n;
	const R = rng( hash32( r.i, 0x70e5 ) );
	const dc = Math.hypot( r.x - city.x, r.z - city.z ) / Math.max( 1, city.radius );
	if ( city.id === 'honolulu' ) {
		if ( dc < 0.55 ) {
			const k = Math.pow( 1 - dc / 0.55, 1.3 );
			n = Math.max( n, Math.round( 5 + k * 26 * ( 0.55 + 0.45 * R() ) + R() * 3 ) );
		} else if ( dc < 0.8 && type !== 'office' ) n = Math.max( n, 3 + Math.floor( R() * 4 ) );
	} else if ( city.id === 'waikiki' ) {
		if ( type === 'hotel' ) n = Math.max( n, 10 + Math.floor( R() * 22 ) );
		else n = Math.max( n, dc < 0.8 ? 7 + Math.floor( R() * 16 ) : 3 + Math.floor( R() * 6 ) );
	} else if ( city.kind === 'metro' && dc < 0.3 ) {
		n = Math.max( n, 4 + Math.floor( R() * 5 ) );
	}
	return Math.min( 34, n );
}

// the massing: arch(etype), built rect inside the lot footprint, storeys and heights. All in building-local
// metres: x across the front, z from front (-d/2) to back (+d/2).
const COMMERCIAL = { convenience: 1, restaurant: 1, clothing: 1, fastfood: 1, bar: 1, pawn: 1, sports: 1, pharmacy: 1, surf: 1, bank: 1 };

// what a lot really holds: Waikīkī's residential blocks are condos, and downtown Honolulu stacks offices,
// flats and hotels over its shops (the listed business keeps the street level)
export function effectiveType( r, cities ) {
	const city = cities[ r.city ];
	if ( ! city ) return { type: r.type, shop: null };
	// the airports' lots by the runway (the bake keeps a warehouse and a hangar there): the terminal and the
	// control tower
	if ( city.kind === 'airport' ) {
		if ( r.type === 'warehouse' ) return { type: 'terminal', shop: null };
		if ( r.type === 'hangar' ) return { type: 'tower', shop: null };
	}
	if ( city.id === 'waikiki' && r.type === 'house' ) return { type: 'apartment', shop: null };
	if ( city.id === 'honolulu' && COMMERCIAL[ r.type ] && r.w >= 20 ) {
		const dc = Math.hypot( r.x - city.x, r.z - city.z ) / Math.max( 1, city.radius );
		const h = hash32( r.i, 0x3d1 );
		if ( dc < 0.5 && ( h % 100 ) < 65 ) return { type: [ 'office', 'office', 'apartment', 'hotel' ][ ( h >> 8 ) & 3 ], shop: r.type };
	}
	return { type: r.type, shop: null };
}

export function shapeOf( r, cities ) {
	const R = rng( hash32( r.i, 0x5a9e ) );
	const eff = effectiveType( r, cities );
	const t = eff.type, W = r.w, D = r.d;
	const S = {
		type: t, shop: eff.shop, arch: t, variant: 0, n: storeysOf( r, cities, t ), Hs: null, raise: 0.25, bw: W, bd: D, ox: 0, oz: 0,
		roof: 'flat', pitch: 0.3, overhang: 0.5, pave: false, units: 1,
	};
	const front = ( bd ) => { S.bd = Math.min( D, bd ); S.oz = - D / 2 + S.bd / 2; };
	let H = 3.3, H0 = null;
	switch ( t ) {
		case 'house': {
			const v = r.style % 10;
			S.variant = v < 4 ? 'plantation' : v < 6 ? 'plantation_gable' : v < 8 ? 'cmu' : 'modern';
			S.raise = S.variant.startsWith( 'plantation' ) ? 0.72 + R() * 0.3 : 0.3;
			S.n = Math.min( 2, S.n );
			H = 2.9;
			S.roof = S.variant === 'plantation_gable' ? 'gable' : S.variant === 'modern' && R() < 0.5 ? 'flat' : 'hip';
			S.pitch = S.variant.startsWith( 'plantation' ) ? 0.5 + R() * 0.15 : 0.32 + R() * 0.1;
			S.overhang = 0.6;
			// the lānai (porch) takes the front strip of a plantation house
			S.porch = S.variant.startsWith( 'plantation' ) ? 2.2 : S.variant === 'cmu' && R() < 0.5 ? 1.8 : 0;
			if ( S.porch ) { S.bd = D; }
			// a stair needs room: narrow or shallow two-storey houses become bungalows
			if ( S.n > 1 && ( D - S.porch < 7.4 || W < 7.5 ) ) S.n = 1;
			break;
		}
		case 'apartment':
			if ( S.n >= 5 && W >= 17 ) { S.arch = 'tower'; break; }
			// walk-ups top out at four storeys (no lift); the narrow Waikīkī lots keep them low
			S.arch = 'walkup'; H = 2.95; S.n = Math.min( S.n, 4 );
			S.bw = Math.min( W, 18 + Math.floor( R() * 3 ) * 4 );
			front( 26 + Math.floor( R() * 4 ) * 5 );
			S.pave = true;
			break;
		case 'office':
			if ( S.n >= 4 && W >= 17 ) { S.arch = 'tower'; break; }
			// a narrow office lot: a mid-rise block (no lifts in the plan, so no more than six floors)
			S.arch = 'office'; H = 3.6; H0 = 4.2; front( 28 ); S.n = Math.min( S.n, 6 );
			S.pave = true;
			break;
		case 'hotel':
			S.arch = S.n >= 4 && W >= 17 ? 'tower' : 'office'; H = 3.2; H0 = 4.2;
			if ( S.arch === 'office' ) { front( 26 ); S.pave = true; }
			break;
		case 'grocery': case 'hardware': case 'market':
			S.arch = 'bigbox'; H = t === 'market' ? 6 : 6.5; front( Math.min( 40, Math.max( 24, W * 0.8 ) ) ); S.pave = true; break;
		case 'convenience': case 'pharmacy': case 'gunstore': case 'clothing': case 'sports': case 'surf': case 'pawn': case 'bank': case 'post': {
			S.arch = 'shop'; H = 4.4;
			front( t === 'bank' || t === 'post' ? 20 : 16 + Math.floor( R() * 3 ) * 3 );
			// wide lots become little strip malls with a row of storefronts
			S.units = W > 21 && t !== 'bank' && t !== 'post' ? Math.max( 2, Math.min( 4, Math.round( W / 9 ) ) ) : 1;
			S.pave = true;
			break;
		}
		case 'restaurant': case 'bar': case 'fastfood':
			S.arch = 'food'; H = 4.2; front( 18 + Math.floor( R() * 3 ) * 2 );
			S.units = W > 26 ? 2 : 1;
			S.pave = true;
			break;
		case 'gas':
			S.arch = 'gas'; H = 3.9;
			S.bw = Math.min( W - 2, 16 ); S.bd = Math.min( D - 16, 10 );
			S.oz = D / 2 - S.bd / 2 - 1.5;
			S.pave = true;
			break;
		case 'police': S.arch = 'police'; H = 3.5; H0 = 3.9; S.n = 2; S.bw = Math.min( W, 24 ); front( 24 ); S.pave = true; break;
		case 'fire': S.arch = 'fire'; H = 3.3; H0 = 5.2; S.n = 2; S.bw = Math.min( W - 2, 28 ); front( 22 ); S.pave = true; break;
		case 'hospital': S.arch = 'hospital'; H = 3.8; H0 = 4.4; S.bw = W; front( 38 ); break;
		case 'clinic': S.arch = 'clinic'; H = 3.6; S.n = 1; S.bw = Math.min( W, 22 ); front( 18 ); S.pave = true; break;
		case 'school': S.arch = 'school'; H = 3.7; S.n = 2; S.bw = Math.min( W, 30 ); front( 44 ); break;
		case 'church': S.arch = 'church'; H = 7.5; S.n = 1; S.bw = Math.min( W, 13 + Math.floor( R() * 2 ) * 2 ); front( 26 ); S.roof = 'gable'; S.pitch = 0.85; S.overhang = 0.4; break;
		case 'warehouse': S.arch = 'warehouse'; H = 8.5; S.n = 1; S.bw = Math.min( W, 40 ); front( Math.min( 44, D ) ); S.roof = 'gable'; S.pitch = 0.18; S.overhang = 0.3; S.pave = true; break;
		case 'garage': S.arch = 'garage'; H = 5.6; S.n = 1; S.bw = Math.min( W, 24 ); front( 20 ); S.pave = true; break;
		case 'barracks': S.arch = 'barracks'; H = 3.3; S.n = 3; S.bw = Math.min( W - 4, 44 ); S.bd = 14; S.oz = - D / 2 + 3 + S.bd / 2; S.roof = 'gable'; S.pitch = 0.3; break;
		case 'mil_hq': S.arch = 'hq'; H = 3.6; H0 = 4.0; S.n = 2; S.bw = Math.min( W - 4, 34 ); S.bd = 20; S.oz = - D / 2 + 4 + S.bd / 2; break;
		case 'armory': S.arch = 'armory'; H = 4.5; S.n = 1; S.bw = Math.min( W - 6, 26 ); S.bd = 16; S.oz = - D / 2 + 4 + S.bd / 2; break;
		case 'hangar': S.arch = 'hangar'; H = 13; S.n = 1; S.bw = Math.min( W, 48 ); S.bd = Math.min( D, 50 ); S.roof = 'arch'; S.pave = true; break;
		case 'terminal':
			// one tall hall: landside (the front) a drop-off lane and parking, airside (the back) the apron
			S.arch = 'terminal'; H = 6.2; S.n = 1;
			S.bw = Math.min( W - 4, 52 ); S.bd = Math.min( D - 18, 28 ); S.oz = - D / 2 + Math.min( 14, ( D - S.bd ) / 2 ) + S.bd / 2;
			S.pave = true;
			break;
		case 'tower':
			// the shaft (stair and equipment rooms) and the glazed cab on top
			S.arch = 'ctower'; H = 3.4; H0 = 3.8; S.n = Math.max( 7, Math.min( 9, r.floors + 1 ) ); S.bw = 8; S.bd = 8;
			S.oz = Math.max( 0, D / 2 - S.bd / 2 - 10 );
			S.pave = true;
			break;
		case 'observatory': S.arch = 'dome'; H = 5.5; S.n = 1; S.bw = S.bd = Math.min( W, D, 18 ); S.roof = 'dome'; break;
		case 'mil_tent': S.arch = 'tent'; H = 2.2; S.n = 1; S.bw = Math.min( W, 10 ); S.bd = Math.min( D, 5.5 ); S.roof = 'tent'; S.raise = 0.05; break;
		case 'shed': S.arch = 'garage'; H = 3.2; S.n = 1; break;
	}
	if ( S.arch === 'tower' ) {
		const sub = t;
		S.variant = sub;
		H = sub === 'office' ? 3.7 : sub === 'hotel' ? 3.15 : 3.05;
		H0 = sub === 'office' ? 5.2 : 4.8;
		// point tower on the front of the lot, or a long slab down a deep lot (the Waikīkī hotel type)
		if ( D > W * 1.7 && R() < 0.6 ) {
			S.bw = Math.min( W - 3, 20 + Math.floor( R() * 3 ) * 2 );
			S.bd = Math.min( D - 6, 44 + Math.floor( R() * 5 ) * 6 );
			S.oz = - D / 2 + 3 + S.bd / 2;
		} else {
			S.bw = Math.min( W - 2, 24 + Math.floor( R() * 4 ) * 3 );
			S.bd = Math.min( D - 4, 24 + Math.floor( R() * 5 ) * 3 );
			S.oz = - D / 2 + 3 + S.bd / 2;
		}
		S.pave = true;
	}
	S.bw = Math.max( 5, S.bw ); S.bd = Math.max( 4, S.bd );
	S.Hs = [];
	for ( let i = 0; i < S.n; i ++ ) S.Hs.push( i === 0 && H0 ? H0 : H );
	// the control tower's cab: taller, glazed all round
	if ( S.arch === 'ctower' ) S.Hs[ S.n - 1 ] = 4.2;
	S.fy = r.base + S.raise; // floor of the ground storey (world y)
	S.ys = [];
	let y = S.fy;
	for ( let i = 0; i < S.n; i ++ ) { S.ys.push( y ); y += S.Hs[ i ]; }
	S.top = y; // top of the walls (flat roof deck / eaves)
	// how far a pitched roof, dome or roof clutter rises above the walls (for bounds and shadows)
	const span = Math.min( S.bw, S.bd );
	S.roofH = S.roof === 'hip' || S.roof === 'gable' ? span / 2 * S.pitch + 0.3 : S.roof === 'arch' ? S.bw * 0.28 : S.roof === 'dome' ? S.bw * 0.5 : S.roof === 'tent' ? 0.9 : 1.6;
	if ( S.arch === 'church' ) S.roofH += 8;
	if ( S.arch === 'ctower' ) S.roofH += 7; // antennas and the radar
	return S;
}

// the built rect in building-local coords
export function rectOf( S ) {
	return { x0: S.ox - S.bw / 2, x1: S.ox + S.bw / 2, z0: S.oz - S.bd / 2, z1: S.oz + S.bd / 2 };
}

// the gas station pumps in building-local coords (the canopy sits in front of the kiosk)
export function pumpsOf( r, S ) {
	if ( S.arch !== 'gas' ) return [];
	const zc = S.oz - S.bd / 2 - 7.5;
	const out = [];
	const nx = r.w > 30 ? 3 : 2;
	for ( let i = 0; i < nx; i ++ ) {
		const x = ( i - ( nx - 1 ) / 2 ) * 7;
		out.push( [ x, zc - 1.6 ], [ x, zc + 1.6 ] );
	}
	return out;
}

// cell index helpers
export const NEAR_CELL = 128;
export const FAR_CELL = 512;
export const cellKey = ( i, j ) => ( i + 4096 ) * 8192 + ( j + 4096 );

// texture-array layers (materials.js builds the array in this order)
export const L = {
	plain: 0, stucco: 1, plaster: 2, beige: 3, bluewall: 4, panels: 5, planks: 6, oldplanks: 7, brick: 8, tinroof: 9, roof: 10,
	greyroof: 11, bitumen: 12, woodfloor: 13, tiles: 14, carpet: 15, concrete: 16, metal: 17, rust: 18, fabric: 19, sidewalk: 20,
	asphalt: 21, wood: 22, ceiltile: 23, products: 24, books: 25, lattice: 26, lino: 27, terrazzo: 28, cmu: 29, parking: 30, tilewall: 31,
	sign0: 32, spandrel: 33,
};
// layers backed by a real texture (with a normal map); the rest are drawn procedurally
export const TEX_LAYERS = [ null, 'stucco', 'plaster', 'beige', 'bluewall', 'panels', 'planks', 'oldplanks', 'brick', 'tinroof', 'roof',
	'greyroof', 'bitumen', 'woodfloor', 'tiles', 'carpet', 'concrete', 'metal', 'rust', 'fabric', 'sidewalk', 'asphalt' ];

// the identical integer hash the facade shader uses to vary windows (boarded, broken, blinds, curtains)
export function winHash( seed, bi ) {
	let h = ( Math.imul( seed, 747796405 ) + Math.imul( bi + 1, 2891336453 | 0 ) ) >>> 0;
	h ^= h >>> 16; h = Math.imul( h, 0x7feb352d ) >>> 0;
	h ^= h >>> 15; h = Math.imul( h, 0x846ca68b | 0 ) >>> 0;
	h ^= h >>> 16;
	return h >>> 0;
}

// decal atlas cells (textures.js): blood pools / splatters, smears and drag trails, hand prints, papers, dirt and
// leaves, broken glass, footprints, scorch
export const DECAL = { blood: [ 0, 1, 2, 3 ], smear: [ 4, 5, 6 ], hands: 7, paper: [ 8, 9, 10, 11 ], dirt: 12, glass: 13, steps: 14, scorch: 15 };
// uv rect [ u0, v0, u1, v1 ] of decal cell k (flipY: canvas row 0 at the top)
export function decalUV( k ) {
	const col = k % 4, row = ( k / 4 ) | 0;
	return [ col / 4 + 0.002, 1 - ( row + 1 ) / 4 + 0.002, ( col + 1 ) / 4 - 0.002, 1 - row / 4 - 0.002 ];
}

// what the facade shader shows in window bi of a facade piece with this seed: 0 glass, 1 boarded up, 2 broken.
// The seed's top 4 bits carry the building's boarded share (x 1/20); the interior builder mirrors this exactly.
export function winState( seed, bi ) {
	const h = winHash( seed, bi );
	const r = ( h & 1023 ) / 1024;
	if ( r < ( seed >>> 12 ) / 20 ) return 1;
	if ( r > 0.955 ) return 2;
	return 0;
}

// interior colliders (worker -> main): cx cy cz hx hy hz yaw mat kind, building-local
export const BOX_STRIDE = 9;
export const PMAT = [ 'concrete', 'wood', 'metal', 'glass', 'rock', 'dirt', 'foliage', 'flesh' ];
export const PK = [ 'solid', 'glass', 'noclimb' ];

// Seat a building on the ground actually under its built rect. The bake's base is the highest ground under the
// whole lot, which leaves the floor a metre or more above the street on slopes; the highest ground under the
// walls is enough (the floor must not sink below the terrain inside). Deterministic: the main thread and the
// workers run it on the same height field.
export function fitToGround( r, hf, cities ) {
	const R = rectOf( shapeOf( r, cities ) );
	let mx = - Infinity, mn = Infinity;
	for ( let a = 0; a <= 6; a ++ ) for ( let b = 0; b <= 6; b ++ ) {
		const lx = R.x0 + ( R.x1 - R.x0 ) * a / 6, lz = R.z0 + ( R.z1 - R.z0 ) * b / 6;
		const h = hf.heightAt( r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c );
		if ( h > mx ) mx = h;
		if ( h < mn ) mn = h;
	}
	if ( Number.isFinite( mx ) ) { r.base = Math.min( r.base, mx ); r.lo = Math.min( r.lo, mn ); }
	return r;
}
