// Outdoor loot site kinds (docs/ITEMS_PLAN.md "Outdoor loot sites"), shared by the planner, the layouts and the
// runtime. Node-safe: plain data and deterministic hashing only.
//
//   KINDS[ kind ] = { label, table, respawn (game hours before a taken item comes back), rare }
//   hash32 / strHash / rng: the same integer hashes and generator the buildings use, so a site's rolls depend only on
//   the world seed, its cell and the item slot

export const KINDS = {
	roadside: { label: 'Dropped bag', table: 'site_roadside', respawn: 72 },
	bus_stop: { label: 'Bus stop', table: 'site_bus_stop', respawn: 72 },
	crash_car: { label: 'Car crash', table: 'site_crash_car', respawn: 96 },
	beach_camp: { label: 'Beach camp', table: 'site_beach_camp', respawn: 72 },
	campsite: { label: 'Campsite', table: 'site_campsite', respawn: 96 },
	hiker: { label: 'Dead hiker', table: 'site_hiker', respawn: 120 },
	fishing_spot: { label: 'Fishing spot', table: 'site_fishing_spot', respawn: 72 },
	checkpoint: { label: 'Police checkpoint', table: 'site_checkpoint', respawn: 120 },
	military_checkpoint: { label: 'Army checkpoint', table: 'site_military_checkpoint', respawn: 144 },
	heli_crash: { label: 'Helicopter crash', table: 'site_heli_crash', respawn: 240, rare: true },
	fema_camp: { label: 'FEMA camp', table: 'site_fema_camp', respawn: 120 },
	farm_stand: { label: 'Farm stand', table: 'site_farm_stand', respawn: 72 },
	picnic: { label: 'Picnic', table: 'site_picnic', respawn: 72 },
	body: { label: 'Body', table: 'site_body', respawn: 120 },
	supply_drop: { label: 'Supply drop', table: 'site_supply_drop', respawn: Infinity, rare: true },
	stash: { label: 'Stash', table: 'site_stash', respawn: Infinity, rare: true },
};
export const KIND_LIST = Object.keys( KINDS );

// streaming grids (metres): common sites per CELL, helicopter crashes and stashes on their own coarse grids so a
// rare thing can be looked up kilometres away for a note or a radio without planning thousands of small cells
export const CELL = 96;
export const HELI_CELL = 2048;
export const STASH_CELL = 384;

// ---- deterministic randomness (as src/city/buildings/data.js) ------------------------------------------------------

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
export const range = ( R, a, b ) => a + ( b - a ) * R();

// weighted choice over { key: weight }
export function pickWeighted( R, w ) {
	let total = 0;
	for ( const k in w ) if ( w[ k ] > 0 ) total += w[ k ];
	if ( total <= 0 ) return null;
	let x = R() * total;
	for ( const k in w ) { if ( w[ k ] <= 0 ) continue; x -= w[ k ]; if ( x <= 0 ) return k; }
	for ( const k in w ) if ( w[ k ] > 0 ) return k;
	return null;
}

// a seed as an unsigned int (saves keep it as a number or a string)
export function seedOf( s ) { return typeof s === 'number' ? s >>> 0 : strHash( String( s ?? 1 ) ); }
