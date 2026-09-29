// Shared enums between the street worker (placement) and the main thread (meshes, colliders).
// Pure JS: imported by src/world/streetgen.js in the world workers.

// instanced street props
export const PROP = {
	STREETLIGHT: 0, STREETLIGHT2: 1, POLE: 2, POLE_T: 3, SIGNAL: 4, SIGN_POST: 5, HYDRANT: 6, TRASH_CAN: 7, NEWS_BOX: 8,
	BUS_SHELTER: 9, BENCH: 10, CONE: 11, SAWHORSE: 12, JERSEY: 13, SANDBAGS: 14, HESCO: 15, RAZOR: 16, BOOTH: 17,
	TRASH_BAG: 18, SUITCASE: 19, CARDBOARD: 20, BARREL: 21, MILE_POST: 22, GUIDE_POSTS: 23, METER: 24, BOOM: 25,
	FLOODLIGHT: 26, BODY_BAG: 27, TIRE: 28, SPIKES: 29, CART: 30, BIKE: 31, PALLET: 32, TENT: 33, BULB: 34, GUIDE_GANTRY: 35,
};
export const PROP_COUNT = 36;

// collider boxes per prop in its local frame: [ cx, cy, cz, hx, hy, hz, mat ] (mat index into MATS)
export const MATS = [ 'concrete', 'metal', 'wood', 'glass', 'dirt', 'rock', 'foliage' ];
export const PROP_BOXES = {
	[ PROP.STREETLIGHT ]: [ [ 0, 4, 0, 0.12, 4, 0.12, 1 ] ],
	[ PROP.STREETLIGHT2 ]: [ [ 0, 4, 0, 0.12, 4, 0.12, 1 ] ],
	[ PROP.POLE ]: [ [ 0, 5, 0, 0.16, 5, 0.16, 2 ] ],
	[ PROP.POLE_T ]: [ [ 0, 5, 0, 0.16, 5, 0.16, 2 ] ],
	[ PROP.SIGNAL ]: [ [ 0, 3.4, 0, 0.17, 3.4, 0.17, 1 ] ],
	[ PROP.SIGN_POST ]: [ [ 0, 1.3, 0, 0.05, 1.3, 0.05, 1 ] ],
	[ PROP.HYDRANT ]: [ [ 0, 0.35, 0, 0.18, 0.35, 0.18, 1 ] ],
	[ PROP.TRASH_CAN ]: [ [ 0, 0.5, 0, 0.3, 0.5, 0.3, 1 ] ],
	[ PROP.NEWS_BOX ]: [ [ 0, 0.55, 0, 0.26, 0.55, 0.24, 1 ] ],
	[ PROP.BUS_SHELTER ]: [ [ 0, 1.2, 0.7, 1.9, 1.2, 0.06, 3 ], [ - 1.9, 1.2, 0.2, 0.06, 1.2, 0.55, 3 ], [ 0, 1.3, 0.1, 2.0, 0.04, 0.8, 1 ], [ 0, 0.25, 0.35, 1.2, 0.25, 0.22, 1 ] ],
	[ PROP.BENCH ]: [ [ 0, 0.25, 0, 0.9, 0.25, 0.25, 2 ] ],
	[ PROP.SAWHORSE ]: [ [ 0, 0.5, 0, 1.2, 0.5, 0.25, 2 ] ],
	[ PROP.JERSEY ]: [ [ 0, 0.41, 0, 1.5, 0.41, 0.3, 0 ] ],
	[ PROP.SANDBAGS ]: [ [ 0, 0.45, 0, 1.0, 0.45, 0.33, 4 ] ],
	[ PROP.HESCO ]: [ [ 0, 0.68, 0, 0.55, 0.68, 0.55, 4 ] ],
	[ PROP.RAZOR ]: [ [ 0, 0.45, 0, 2.5, 0.45, 0.45, 1 ] ],
	[ PROP.BOOTH ]: [ [ 0, 1.3, 0, 1.0, 1.3, 1.0, 2 ] ],
	[ PROP.BARREL ]: [ [ 0, 0.48, 0, 0.3, 0.48, 0.3, 1 ] ],
	[ PROP.MILE_POST ]: [],
	[ PROP.GUIDE_POSTS ]: [ [ - 2.2, 1.6, 0, 0.08, 1.6, 0.08, 1 ], [ 2.2, 1.6, 0, 0.08, 1.6, 0.08, 1 ] ],
	[ PROP.GUIDE_GANTRY ]: [ [ 0, 3, 0, 0.2, 3, 0.2, 1 ] ],
	[ PROP.METER ]: [ [ 0, 0.65, 0, 0.06, 0.65, 0.06, 1 ] ],
	[ PROP.BOOM ]: [ [ 0, 0.55, 0, 0.25, 0.55, 0.25, 1 ] ],
	[ PROP.FLOODLIGHT ]: [ [ 0, 0.8, 0, 0.7, 0.8, 1.0, 1 ], [ 0, 3.5, 0, 0.1, 3.5, 0.1, 1 ] ],
	[ PROP.CART ]: [ [ 0, 0.5, 0, 0.3, 0.5, 0.48, 1 ] ],
	[ PROP.TENT ]: [ [ 0, 1.1, 0, 2.4, 1.1, 1.9, 6 ] ],
};

// wrecked vehicle bodies: L, W, H, front axle z (negative = forward), rear axle z, half track, wheel radius, clearance
export const CAR = { SEDAN: 0, HATCH: 1, SUV: 2, PICKUP: 3, VAN: 4, POLICE: 5, HUMVEE: 6, MTRUCK: 7, BUS: 8 };
export const CAR_COUNT = 9;
export const CAR_DIMS = [
	{ L: 4.75, W: 1.82, H: 1.44, zf: - 1.42, zr: 1.40, tr: 0.78, r: 0.32 },
	{ L: 4.10, W: 1.76, H: 1.50, zf: - 1.26, zr: 1.22, tr: 0.76, r: 0.31 },
	{ L: 4.85, W: 1.92, H: 1.78, zf: - 1.45, zr: 1.42, tr: 0.82, r: 0.37 },
	{ L: 5.40, W: 1.98, H: 1.86, zf: - 1.78, zr: 1.62, tr: 0.84, r: 0.38 },
	{ L: 5.10, W: 2.00, H: 2.12, zf: - 1.68, zr: 1.58, tr: 0.86, r: 0.35 },
	{ L: 4.95, W: 1.86, H: 1.52, zf: - 1.46, zr: 1.46, tr: 0.80, r: 0.33 },
	{ L: 4.60, W: 2.18, H: 1.86, zf: - 1.66, zr: 1.64, tr: 0.92, r: 0.42 },
	{ L: 7.20, W: 2.45, H: 3.10, zf: - 2.55, zr: 2.15, tr: 1.02, r: 0.55 },
	{ L: 12.0, W: 2.55, H: 3.10, zf: - 4.25, zr: 3.35, tr: 1.06, r: 0.50 },
];
// car flags (bit field in the placement record)
export const CF = {
	DOOR_FL: 1, DOOR_FR: 2, DOOR_RL: 4, DOOR_RR: 8, TRUNK: 16, HOOD: 32, GLASS_SOME: 64, GLASS_ALL: 128,
	FLAT_FL: 256, FLAT_FR: 512, FLAT_RL: 1024, FLAT_RR: 2048, NO_TYRES: 4096, LOOT: 8192, LIGHTS: 16384,
};
export const CAR_STRIDE = 12; // type, x, y, z, yaw, pitch, roll, color, rust, burn, flags, seed

// ground decals
export const DECAL = { BLOOD_POOL: 0, BLOOD_SPLAT: 1, BLOOD_DRAG: 2, SKID: 3, OIL: 4, SCORCH: 5, GLASS: 6, PAPERS: 7, STAIN: 8, BLOOD_PRINTS: 9, TIRE_MARKS: 10, GRAFFITI: 11 };
export const DECAL_STRIDE = 8; // kind, x, y, z, yaw, sx, sz, alpha

export const PROP_STRIDE = 8; // type, x, y, z, yaw, sx, sy, param
export const SIGN_STRIDE = 10; // atlas (0 static, 1 dynamic), cell, x, y, z, yaw, w, h, doubleSided, pitch
export const BOX_STRIDE = 8; // x, y, z, hx, hy, hz, yaw, mat

// static sign atlas (2048 x 2048), cells in pixels: [ x, y, w, h ]
export const ATLAS_SIZE = 2048;
export const atlasStreet = ( i ) => [ ( i % 4 ) * 256, Math.floor( i / 4 ) * 32, 256, 32 ];
export const atlasMile = ( n ) => [ 1024 + ( n % 10 ) * 64, Math.floor( n / 10 ) * 64, 64, 64 ];
export const atlasMisc = ( k ) => [ 1664 + ( k % 3 ) * 128, Math.floor( k / 3 ) * 128, 128, 128 ];
export const atlasWide = ( k ) => [ ( k % 4 ) * 512, 768 + Math.floor( k / 4 ) * 128, 512, 128 ];
export const atlasDigit = ( d ) => [ d * 64, 1280, 64, 96 ];
export const MISC = { STOP: 0, SPEED25: 1, SPEED35: 2, SPEED45: 3, SPEED55: 4, BUS: 5, TSUNAMI: 6, DNE: 7, YIELD: 8, PED: 9, BIOHAZARD: 10, CURVE: 11, NO_PARKING: 12, ONE_WAY: 13, H1: 14, AIRPORT: 15, MILITARY: 16, CURFEW: 17 };
export const WIDE = { ROAD_CLOSED: 0, CHECKPOINT_AHEAD: 1, QUARANTINE: 2, TURN_BACK: 3, RESTRICTED: 4, EVAC: 5, POLICE_LINE: 6, ARMY_HALT: 7, HELP: 8, ALL_STOP: 9, INFECTED: 10, STAY_INSIDE: 11, DETOUR: 12, NO_TRESPASS: 13, CURFEW: 14, SHELTER: 15 };
// sign cell ids in the placement record (static atlas): street names 0..95, miles 100..199, misc 200..217, wide 300..315
export const SIGN_CELL = { street: ( i ) => i, mile: ( n ) => 100 + n, misc: ( k ) => 200 + k, wide: ( k ) => 300 + k };
export function atlasRect( cell ) {
	if ( cell < 100 ) return atlasStreet( cell );
	if ( cell < 200 ) return atlasMile( cell - 100 );
	if ( cell < 300 ) return atlasMisc( cell - 200 );
	return atlasWide( cell - 300 );
}
