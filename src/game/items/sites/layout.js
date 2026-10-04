// What each site looks like and where its loot lies, in the site's local frame (metres; +z is the front: the road
// for roadside kinds, the sea for beach kinds; for scenes anchored on a road event, +x runs outbound along the road
// and +z is the road normal times the travel direction, the centreline at z = 0). Node-safe and deterministic:
// layout( site ) depends only on the site record (its seed and fields).
//
//   layout( site ) -> {
//     props:   [ { t: type, x, z, yaw, dy?, ...params } ]    built by props.js; each sits on the ground at its x, z
//     slots:   [ { x, z, h, p, table? } ]                      loot lying here (h above the ground: a table top, a bench);
//                                                            p = chance it holds something; table defaults to site_<kind>
//     decals:  [ { d: kind, x, z, s, yaw } ]                   blood, ash, soil, oil, papers, scorch flat on the ground
//     bodies:  [ { x, z, yaw, as } ]                           dead people (a creatures avatar, else a covered body prop)
//     fx:      [ { fx: 'smoke' | 'flare' | 'embers', x, z, h } ]
//     acts:    [ { act, x, z, h, r, box? } ]                   F interactions (Sites.js): light_fire, salvage, cut_chute,
//                                                            cash_box, dig; aimed at a sphere of radius r at height h,
//                                                            or with box: [ hx, hy, hz ] at a box in the site's frame
//   }
import { KINDS, rng, range, pick } from './kinds.js';

const PI = Math.PI;
const HALF = PI / 2;

// a few slots that always want a particular kind of thing (otherwise the site's own table)
export const SLOT_TABLES = {
	rod: { rolls: [ 1, 1 ], items: [ [ 'fishing_rod', 3 ], [ 'fishing_rod_improvised', 1 ], [ 'fishing_spear', 0.8 ] ] },
	bait: { rolls: [ 1, 1 ], items: [ [ 'fishing_bait', 3, [ 2, 8 ] ], [ 'raw_fish', 1 ], [ 'tackle_box', 1 ] ] },
	drinks: { rolls: [ 1, 1 ], items: [ [ 'beer_can', 2, [ 1, 4 ] ], [ 'soda_cola', 1.2 ], [ 'water_bottle', 1.5 ], [ 'pog_juice', 0.8 ], [ 'coconut_water', 0.6 ], [ 'iced_tea', 0.6 ], [ 'sports_drink', 0.5 ] ] },
	fruit: { rolls: [ 1, 1 ], items: [ { tag: 'fruit', cat: 'food', not: [ 'wild' ], w: 4 }, [ 'banana', 2, [ 2, 6 ] ], [ 'papaya', 1.2 ], [ 'pineapple', 1.2 ], [ 'mango', 1 ], [ 'coconut', 1 ] ] },
	police: { rolls: [ 1, 1 ], items: [ [ 'ammo_9mm', 3, [ 8, 30 ] ], [ 'mag_glock17', 1.2 ], [ 'walkie_talkie', 1 ], [ 'flashlight', 1 ], [ 'road_flare', 1, [ 1, 3 ] ], [ 'police_baton', 0.6 ], [ 'glock17', 0.15 ] ] },
	ammo_mil: { rolls: [ 1, 1 ], items: [ [ 'ammo_556', 3 ], [ 'mag_stanag30', 1.5 ], [ 'ammo_9mm', 1 ], [ 'mre', 1.5 ], [ 'chemlight', 0.8, [ 1, 3 ] ], [ 'grenade_smoke', 0.15 ] ] },
	relief: { rolls: [ 1, 1 ], items: [ [ 'mre', 3 ], [ 'water_jug', 1.5 ], [ 'water_bottle', 2 ], [ 'bandage', 1 ], [ 'purification_tablets', 0.8 ], [ 'n95_mask', 0.6 ], [ 'first_aid_kit', 0.4 ] ] },
	weapon_mil: { rolls: [ 1, 1 ], items: [ { ids: [ 'm4a1', 'm16a4', 'hk416', 'scar_l', 'g36', 'm14_ebr' ], w: 3 }, { ids: [ 'mp5', 'mp7' ], w: 0.8 }, [ 'm249', 0.15 ], [ 'm24', 0.2 ] ] },
};

const S = ( x, z, h = 0, p = 0.7, table ) => ( { x, z, h, p, table } );
const D = ( d, x, z, s, yaw = 0 ) => ( { d, x, z, s, yaw } );

export function layout( site ) {
	const R = rng( site.seed ^ 0x1a7 );
	const L = { props: [], slots: [], decals: [], bodies: [], fx: [], acts: [] };
	const P = ( t, x, z, yaw = 0, o = {} ) => { L.props.push( { t, x, z, yaw, ...o } ); };
	const fn = BUILD[ site.kind ];
	if ( fn ) fn( site, L, P, R );
	// set dressing (litter, a washing line, a sign) from a stream of its own, so the loot spots never move
	const dress = DRESS[ site.kind ];
	if ( dress ) dress( site, L, P, rng( site.seed ^ 0x5d3e ) );
	return L;
}

// a ring of loot slots around a point, chances falling off
function ring( L, cx, cz, n, r0, r1, R, ps = [ 0.9, 0.7, 0.55, 0.4, 0.3, 0.25 ], table ) {
	const a0 = R() * PI * 2;
	for ( let k = 0; k < n; k ++ ) {
		const a = a0 + k * 2.39996 + ( R() - 0.5 ) * 0.5, r = range( R, r0, r1 );
		L.slots.push( S( cx + Math.cos( a ) * r, cz + Math.sin( a ) * r, 0, ps[ Math.min( k, ps.length - 1 ) ], table ) );
	}
}

const COLORS = {
	car: [ 0x8a8f96, 0x2b2f36, 0xd8d8d2, 0x6e1d1d, 0x24406b, 0x3d5a3a, 0xb59a62, 0x9aa3ad, 0x1c1c1e, 0x7a2f12 ],
	tent: [ 0x3f6e3a, 0xb8642a, 0x2f5f8f, 0xc49a2c, 0x7d2f2a, 0x55606b ],
	towel: [ 0, 1, 2, 3, 4, 5 ],
	cooler: [ 0x2a64b0, 0xc93a2c, 0x2e8a5a, 0xe8e6df ],
	suitcase: [ 0x22262c, 0x6a1f2a, 0x24406b, 0x7a7f86, 0xb07a3a, 0x3c5a48 ],
	umbrella: [ 0, 1, 2, 3 ],
};

const BUILD = {
	roadside( s, L, P, R ) {
		const ev = s.ev === 'jam';
		// scenes on a road event lie on the shoulder of the outbound side
		const cx = ev ? range( R, - 6, 6 ) : 0, cz = ev ? ( s.hw || 4 ) + 1.6 : 0;
		const v = Math.floor( R() * 3 );
		const yaw = R() * PI * 2;
		if ( v === 0 || v === 2 ) {
			P( 'suitcase', cx, cz, yaw, { open: true, c: pick( R, COLORS.suitcase ), clothes: Math.floor( R() * 6 ) } );
			P( 'clothes', cx + range( R, 0.6, 1.1 ), cz + range( R, - 0.6, 0.6 ), R() * 6, { n: 3, seed: s.seed & 255 } );
		}
		if ( v === 2 ) P( 'suitcase', cx - 1.2, cz + 0.7, yaw + 1.2, { open: false, upright: R() < 0.5, c: pick( R, COLORS.suitcase ) } );
		if ( v === 1 ) {
			P( 'cart', cx, cz, yaw, { fallen: R() < 0.7 } );
			P( 'grocery_bags', cx + 0.9, cz + 0.4, R() * 6 );
		}
		if ( R() < 0.5 ) L.decals.push( D( 'papers', cx + range( R, - 1, 1 ), cz + range( R, - 1, 1 ), 2.2, R() * 6 ) );
		if ( R() < 0.25 ) L.decals.push( D( 'blood_drag', cx - 1.5, cz, 2.4, R() * 6 ) );
		ring( L, cx, cz, 3 + ( R() < 0.4 ? 1 : 0 ), 0.5, 1.6, R );
	},

	bus_stop( s, L, P, R ) {
		P( 'bus_shelter', 0, 0, 0 );
		P( 'bus_sign', 2.1, 0.95, - HALF );
		P( 'trash_can', - 2.15, 0.35, R() * 6 );
		L.slots.push( S( - 0.6, - 0.3, 0.47, 0.8 ), S( 0.55, - 0.3, 0.47, 0.5 ), S( 1.1, 0.5, 0, 0.45 ), S( - 1.4, 0.6, 0, 0.3 ) );
		if ( R() < 0.6 ) L.decals.push( D( 'papers', range( R, - 1, 1 ), 0.6, 1.8, R() * 6 ) );
		if ( R() < 0.3 ) { L.bodies.push( { x: 0.4, z: 1.1, yaw: R() * 6, as: 'civilian' } ); L.decals.push( D( 'blood_pool', 0.4, 1.1, 1.8, R() * 6 ) ); }
	},

	crash_car( s, L, P, R ) {
		if ( s.ev === 'crash' ) {
			// the road's own wrecks sit on the lanes behind the event point; the cargo was flung onto the shoulder
			const hw = s.hw || 4;
			P( 'suitcase', range( R, - 6, 0 ), hw + range( R, 1.2, 2.5 ), R() * 6, { open: true, c: pick( R, COLORS.suitcase ), clothes: Math.floor( R() * 6 ) } );
			P( 'clothes', range( R, - 8, - 3 ), hw + 1.4, R() * 6, { n: 4, seed: s.seed & 255 } );
			if ( R() < 0.5 ) P( 'suitcase', range( R, - 10, - 4 ), hw + 2.6, R() * 6, { open: false, c: pick( R, COLORS.suitcase ) } );
			L.decals.push( D( 'papers', - 4, hw + 1.6, 3, R() * 6 ) );
			for ( let k = 0; k < 4; k ++ ) L.slots.push( S( range( R, - 10, 2 ), hw + range( R, 0.6, 3 ), 0, [ 0.85, 0.7, 0.55, 0.4 ][ k ] ) );
			L.slots.push( S( range( R, - 8, - 2 ), range( R, - 1, 2.5 ), 0, 0.35 ) );
			return;
		}
		// off the road into the ditch, maybe on its roof; the boot burst open
		const flip = !! s.flip;
		const cy = R() * 0.9 - 0.45 + ( R() < 0.5 ? 0 : PI );
		P( 'car', 0, - 0.4, cy, { c: pick( R, COLORS.car ), flip, burnt: R() < 0.25, side: ! flip && R() < 0.25 } );
		L.decals.push( D( 'oil', range( R, - 1, 1 ), range( R, - 1, 1 ), 3.2, R() * 6 ), D( 'glass', 0.5, 1.6, 2.6, R() * 6 ) );
		L.decals.push( D( 'skid', 0, 4.5, 5, cy ) );
		const bx = Math.sin( cy ) * - 3, bz = Math.cos( cy ) * - 3 - 0.4; // behind the car
		P( 'suitcase', bx + range( R, - 0.8, 0.8 ), bz + range( R, - 0.8, 0.8 ), R() * 6, { open: true, c: pick( R, COLORS.suitcase ), clothes: Math.floor( R() * 6 ) } );
		P( 'clothes', bx + range( R, - 1.5, 1.5 ), bz + range( R, - 1.5, 1.5 ), R() * 6, { n: 3, seed: s.seed & 255 } );
		ring( L, 0, - 0.4, 4, 2.4, 4, R, [ 0.85, 0.7, 0.55, 0.4 ] );
		if ( R() < 0.35 ) { L.bodies.push( { x: range( R, - 1, 1 ), z: 2.6, yaw: R() * 6, as: 'civilian' } ); L.decals.push( D( 'blood_pool', 0, 2.6, 1.8 ) ); }
	},

	beach_camp( s, L, P, R ) {
		const two = R() < 0.6;
		P( 'towel', 0, 0, range( R, - 0.15, 0.15 ), { c: Math.floor( R() * 6 ) } );
		if ( two ) P( 'towel', 1.05, 0.2, range( R, - 0.25, 0.25 ), { c: Math.floor( R() * 6 ) } );
		P( 'umbrella', two ? 0.5 : 0.9, - 1.15, R() * 6, { c: Math.floor( R() * 4 ), tilt: range( R, 0.12, 0.3 ), fallen: R() < 0.2 } );
		P( 'cooler', - 1.05, - 0.6, range( R, - 0.4, 0.4 ), { c: pick( R, COLORS.cooler ), open: R() < 0.4 } );
		if ( R() < 0.6 ) P( 'beach_chair', - 1.7, 0.5, range( R, - 0.3, 0.3 ), { c: Math.floor( R() * 4 ) } );
		if ( R() < 0.4 ) P( 'sandcastle', range( R, 1.6, 2.4 ), range( R, 1, 1.8 ), R() * 6 );
		L.slots.push( S( 0, 0.25, 0.06, 0.9 ), S( 0.05, - 0.35, 0.06, 0.55 ), S( - 0.55, - 0.2, 0, 0.7, SLOT_TABLES.drinks ) );
		if ( two ) L.slots.push( S( 1.05, 0.3, 0.06, 0.6 ) );
		L.slots.push( S( range( R, 1.4, 2 ), range( R, - 1.2, - 0.6 ), 0, 0.35 ) );
	},

	campsite( s, L, P, R ) {
		const a = R() < 0.5;
		P( a ? 'tent_dome' : 'tent_ridge', 0, - 2.3, range( R, - 0.25, 0.25 ), { c: pick( R, COLORS.tent ), open: R() < 0.7 } );
		P( 'fire_pit', 0, 1.2, R() * 6, { tripod: R() < 0.5 } );
		L.decals.push( D( 'ash', 0, 1.2, 1.8, R() * 6 ) );
		P( 'log_seat', - 1.45, 1.55, 0.5 + R() * 0.4 );
		if ( R() < 0.7 ) P( 'log_seat', 1.5, 0.8, - 0.9 + R() * 0.4 );
		if ( R() < 0.6 ) P( 'camp_chair', 1.5, 2.3, - 2.4 + R() * 0.6, { c: pick( R, [ 0x2f5f8f, 0x3f6e3a, 0x7d2f2a, 0x333333 ] ) } );
		if ( R() < 0.55 ) P( 'woodpile', - 2.3, - 0.6, R() * 6 );
		if ( R() < 0.4 ) P( 'tarp_shelter', 2.6, - 1.4, range( R, - 0.5, 0.5 ), { c: pick( R, [ 0x2f5f8f, 0x3f6e3a, 0x8a7a5a ] ) } );
		L.slots.push( S( 0, - 0.85, 0, 0.85 ), S( - 1.1, 1.0, 0, 0.7 ), S( 0.7, 1.85, 0, 0.6 ), S( 0.3, - 2.3, 0.02, 0.5 ), S( 1.6, 0.2, 0, 0.35 ) );
		L.acts.push( { act: 'light_fire', x: 0, z: 1.2, h: 0.2, r: 0.8 } );
		if ( R() < 0.18 ) { L.bodies.push( { x: - 0.6, z: - 0.9, yaw: R() * 6, as: R() < 0.5 ? 'civilian' : 'runner' } ); L.decals.push( D( 'blood_pool', - 0.6, - 0.9, 1.7 ) ); }
	},

	hiker( s, L, P, R ) {
		L.bodies.push( { x: 0, z: 0, yaw: R() * 6, as: R() < 0.6 ? 'runner' : 'civilian' } );
		L.decals.push( D( 'blood_pool', 0, 0, 2, R() * 6 ), D( 'blood_drag', range( R, - 1, 1 ), 1.4, 2.4, R() * 6 ) );
		P( 'trek_pole', range( R, 0.8, 1.4 ), range( R, - 0.8, 0.8 ), R() * 6 );
		if ( R() < 0.5 ) P( 'trek_pole', range( R, - 1.5, - 0.8 ), range( R, - 0.6, 0.6 ), R() * 6 );
		ring( L, 0, 0, 4, 0.8, 2.2, R, [ 0.9, 0.75, 0.55, 0.4 ] );
	},

	fishing_spot( s, L, P, R ) {
		P( 'rod_holder', 0.5, 0.9, 0 );
		if ( R() < 0.5 ) P( 'rod_holder', - 0.5, 1.05, 0.2 );
		P( 'bucket', - 0.65, 0.3, R() * 6, { c: pick( R, [ 0xe8e6df, 0xd86a1e, 0x2a64b0 ] ) } );
		P( 'camp_chair', - 0.1, - 0.35, range( R, - 0.3, 0.3 ), { c: pick( R, [ 0x2f5f8f, 0x3f6e3a, 0x7d2f2a ] ) } );
		if ( R() < 0.6 ) P( 'cooler', - 1.25, - 0.45, R() * 6, { c: pick( R, COLORS.cooler ) } );
		L.slots.push( S( 0.55, 0.3, 0, 0.75, SLOT_TABLES.rod ), S( - 0.6, 0.75, 0, 0.7, SLOT_TABLES.bait ), S( 0.35, - 0.45, 0, 0.55 ), S( - 1.05, 0.05, 0, 0.45, SLOT_TABLES.drinks ) );
		if ( R() < 0.2 ) { L.bodies.push( { x: - 1.6, z: - 1.4, yaw: R() * 6, as: 'civilian' } ); L.decals.push( D( 'blood_pool', - 1.6, - 1.4, 1.6 ) ); }
	},

	checkpoint( s, L, P, R ) {
		if ( s.ev === 'roadblock' ) {
			// the roads module drew the cruisers, barriers and spike strip; a supply table on the shoulder and loot
			// around the cars
			const hw = s.hw || 4;
			P( 'folding_table', 9, hw + 3.4, 0 );
			P( 'crate_police', 10.6, hw + 3.3, R() * 0.4 );
			P( 'canopy', 9, hw + 3.4, 0, { c: 0x23406e } );
			L.slots.push( S( 8.4, hw + 3.3, 0.76, 0.9, SLOT_TABLES.police ), S( 9.6, hw + 3.4, 0.76, 0.7 ), S( 10.6, hw + 3.3, 0.5, 0.6 ) );
			L.slots.push( S( range( R, - 1, 3 ), hw * 0.45 - 2.2, 0, 0.6 ), S( range( R, - 4, 0 ), - hw * 0.2, 0, 0.5 ), S( range( R, 2, 6 ), hw + 1.2, 0, 0.45 ) );
			return;
		}
		const ro = s.ro ?? 6, rw = s.rw ?? 7;
		// a pop-up canopy over a folding table on the shoulder, a cruiser parked across, barriers over the lanes
		P( 'canopy', 0, - 0.6, 0, { c: 0x23406e } );
		P( 'folding_table', 0, - 0.5, 0 );
		P( 'radio_set', 0.55, - 0.55, 0.3, { dy: 0.76 } );
		P( 'car', - 6, s.ro !== undefined ? ro - rw * 0.25 : 1.5, HALF + range( R, 0.3, 0.7 ), { c: 0xe8e8e4, police: true, doors: R() < 0.6 } );
		const z0 = s.ro !== undefined ? ro - rw / 2 + 0.6 : 2, z1 = s.ro !== undefined ? ro + rw / 2 - 0.6 : 6;
		let k = 0;
		for ( let z = z0; z <= z1 + 0.01; z += 2.4, k ++ ) {
			if ( k % 2 === 0 ) P( 'sawhorse', 4.5, z, HALF + range( R, - 0.15, 0.15 ), { fallen: R() < 0.15 } );
			else P( 'cone', 4.5 + range( R, - 0.4, 0.4 ), z, R() * 6, { fallen: R() < 0.25 } );
		}
		for ( let x = - 2; x <= 7; x += 3 ) if ( R() < 0.7 ) P( 'cone', x, z0 - 0.6, R() * 6, { fallen: R() < 0.2 } );
		P( 'tape', - 2, z0 - 0.6, 0, { len: 9 } );
		P( 'body_bag', - 2.6, - 2.3, range( R, - 0.2, 0.2 ) );
		if ( R() < 0.6 ) P( 'body_bag', - 1.4, - 2.5, range( R, - 0.3, 0.3 ) );
		L.decals.push( D( 'blood_pool', - 3.2, 1, 2.2, R() * 6 ), D( 'papers', 1.5, 0.8, 2.4, R() * 6 ) );
		L.slots.push( S( - 0.45, - 0.45, 0.76, 0.9, SLOT_TABLES.police ), S( 0.05, - 0.4, 0.76, 0.7 ), S( - 4.2, s.ro !== undefined ? ro - rw / 2 - 0.4 : 0.2, 0, 0.5 ), S( - 1.9, - 1.6, 0, 0.5 ), S( 1.9, 0.6, 0, 0.35 ) );
		if ( R() < 0.5 ) L.bodies.push( { x: 2.4, z: z0 + 0.4, yaw: R() * 6, as: 'police' } );
	},

	military_checkpoint( s, L, P, R ) {
		if ( s.ev === 'checkpoint' ) {
			// the roads module drew the HESCO, barriers, booth, humvees and the tent; a crate cache behind the nest
			const hw = s.hw || 4, sd = s.sd || 1;
			const cz = sd * ( hw + 4.2 );
			P( 'crate_mil', - 12, cz, 0.1 );
			P( 'crate_mil', - 12, cz, 0.05, { dy: 0.5 } );
			P( 'crate_mil', - 13.1, cz + 0.2 * sd, - 0.1 );
			P( 'ammo_cans', - 10.9, cz, 0.3 );
			P( 'camo_net', - 12.2, cz, 0, { w: 4.6, d: 3.6 } );
			L.slots.push( S( - 12.2, cz, 1.0, 0.9, SLOT_TABLES.ammo_mil ), S( - 13.1, cz + 0.2 * sd, 0.5, 0.7 ), S( - 10.9, cz - 0.7 * sd, 0, 0.6 ) );
			L.slots.push( S( 6 + range( R, - 2, 2 ), - sd * ( hw + 6 ), 0, 0.6 ), S( 5 + range( R, - 2, 2 ), - sd * ( hw + 5.2 ), 0, 0.45 ) );
			return;
		}
		const onRoad = s.ro !== undefined;
		// a sandbag nest facing the road, a GP tent and a crate stack under camouflage netting
		P( 'sandbags', 0, 1.2, 0, { len: 4.2, rows: 3 } );
		P( 'sandbags', - 2.1, 0, HALF, { len: 2.4, rows: 3 } );
		P( 'sandbags', 2.1, 0, - HALF, { len: 2.4, rows: 3 } );
		P( 'radio_set', 0.6, 0.6, R() * 0.6 );
		P( 'tent_mil', - 5.4, - 3.2, range( R, - 0.1, 0.1 ) );
		P( 'crate_mil', 3.6, - 3, 0.1 );
		P( 'crate_mil', 3.6, - 3, 0.04, { dy: 0.5 } );
		P( 'crate_mil', 4.7, - 2.8, - 0.15 );
		P( 'ammo_cans', 2.8, - 2.2, 0.4 );
		P( 'barrel', 5.3, - 4.1, 0.3, { c: 0x4f5530 } );
		P( 'camo_net', 3.8, - 3, 0.1, { w: 4.8, d: 4 } );
		if ( onRoad ) {
			const z0 = s.ro - s.rw / 2 + 0.8, z1 = s.ro + s.rw / 2 - 0.8;
			for ( let z = z0; z <= z1 + 0.01; z += 3 ) P( 'razor_wire', 6, z, HALF + range( R, - 0.1, 0.1 ), { len: 2.8 } );
		} else P( 'razor_wire', 0, 3.4, 0, { len: 6 } );
		if ( R() < 0.6 ) P( 'flag_pole', - 2.6, 1.8, 0 );
		L.decals.push( D( 'papers', - 4.6, - 0.8, 2, R() * 6 ) );
		L.slots.push( S( 3.6, - 3, 1.0, 0.9, SLOT_TABLES.ammo_mil ), S( 4.7, - 2.8, 0.5, 0.6 ), S( - 5.4, - 3.2, 0.02, 0.7 ), S( - 5.2, - 1, 0, 0.5 ), S( 0, 0.3, 0, 0.6 ), S( - 1, - 0.6, 0, 0.35 ) );
		if ( R() < 0.45 ) { L.bodies.push( { x: - 0.8, z: 2.6, yaw: R() * 6, as: 'military' } ); L.decals.push( D( 'blood_pool', - 0.8, 2.6, 2 ) ); }
	},

	heli_crash( s, L, P, R ) {
		P( 'heli', 0, 0, 0, { roll: range( R, 0.2, 0.45 ) * ( R() < 0.5 ? 1 : - 1 ) } );
		P( 'heli_tail', - 9.5, 2.6, range( R, 0.4, 0.9 ) );
		P( 'rotor_blade', 3.4, - 5.2, range( R, 0, 6 ) );
		P( 'rotor_blade', - 4.2, 5.4, range( R, 0, 6 ) );
		if ( R() < 0.6 ) P( 'rotor_blade', 7.4, 3.2, range( R, 0, 6 ) );
		for ( let k = 0; k < 6; k ++ ) P( 'debris', range( R, - 8, 8 ), range( R, - 7, 7 ), R() * 6, { s: range( R, 0.5, 1.3 ) } );
		P( 'crate_mil', 4.4, 3.2, 0.5 );
		L.decals.push( D( 'scorch', 0.5, 0.2, 13, R() * 6 ), D( 'scorch', - 9, 2.5, 6, R() * 6 ), D( 'oil', 2, - 1, 4, R() * 6 ) );
		L.fx.push( { fx: 'smoke', x: 0.8, z: - 0.4, h: 2.2 }, { fx: 'embers', x: 1.6, z: 0.4, h: 0.3 }, { fx: 'embers', x: - 8.8, z: 2.2, h: 0.2 } );
		L.bodies.push( { x: 5.2, z: - 1.2, yaw: R() * 6, as: 'military' } );
		if ( R() < 0.7 ) L.bodies.push( { x: - 3.2, z: - 3.6, yaw: R() * 6, as: R() < 0.7 ? 'military' : 'pilot' } );
		L.slots.push( S( 4.4, 3.2, 0.5, 0.95, SLOT_TABLES.weapon_mil ), S( 3.2, 2.2, 0, 0.9 ), S( 5.6, 0.2, 0, 0.85 ), S( - 2.2, 4, 0, 0.75 ), S( 1.2, - 4, 0, 0.7, SLOT_TABLES.ammo_mil ),
			S( - 4.6, - 2.2, 0, 0.6 ), S( - 7.6, 0.8, 0, 0.5 ), S( 6.4, 4.6, 0, 0.5 ) );
		// the whole hull, nose to tail stump: look at any of it
		L.acts.push( { act: 'salvage', x: - 0.4, z: 0, h: 1.5, r: 5.6, box: [ 5.2, 1.6, 1.35 ] } );
	},

	fema_camp( s, L, P, R ) {
		const n = 3 + ( R() < 0.5 ? 1 : 0 );
		for ( let k = 0; k < n; k ++ ) P( 'tent_fema', ( k - ( n - 1 ) / 2 ) * 6.6, - 5.2, range( R, - 0.03, 0.03 ), { sign: k === 1 } );
		P( 'canopy', - 3.2, 1.6, 0, { c: 0xdedad0, big: true } );
		P( 'cot', - 4.4, 1.6, HALF + range( R, - 0.1, 0.1 ) );
		P( 'cot', - 2, 1.6, HALF + range( R, - 0.1, 0.1 ) );
		P( 'folding_table', 3.5, 1.8, 0 );
		P( 'pallet_load', 9.8, 2.6, R() * 0.3, { load: 'boxes' } );
		P( 'pallet_load', 10.4, - 0.6, R() * 0.3, { load: 'water' } );
		if ( R() < 0.6 ) P( 'pallet', 8.2, 4.8, R() * 0.8 );
		for ( let k = 0; k < 3; k ++ ) P( 'barrel', - 11 + k * 0.7, 3 + ( k % 2 ) * 0.3, R() * 6, { c: 0x2a5aa8 } );
		P( 'generator', - 11.4, - 0.6, 0.3 );
		P( 'sign_board', 0, 6, 0, { cell: 'fema' } );
		P( 'porta_potty', 13.6, - 6, - 0.2 );
		if ( R() < 0.7 ) P( 'porta_potty', 13.6, - 4.6, - 0.2 );
		for ( let k = 0; k < 3; k ++ ) if ( R() < 0.75 ) P( 'body_bag', - 7.4 + k * 0.85, 6.2, HALF + range( R, - 0.1, 0.1 ) );
		L.decals.push( D( 'papers', 0.5, 2.6, 3, R() * 6 ), D( 'papers', 7, - 1, 2.5, R() * 6 ) );
		L.slots.push(
			S( 3.0, 1.8, 0.76, 0.8, SLOT_TABLES.relief ), S( 4.1, 1.8, 0.76, 0.6 ), S( - 4.4, 1.6, 0.47, 0.55 ), S( - 2, 1.6, 0.47, 0.45 ),
			S( 9.8, 1.4, 0, 0.6, SLOT_TABLES.relief ), S( 9.2, - 0.8, 0, 0.5 ), S( - 6.6, - 2.4, 0, 0.5 ), S( 0, - 2.4, 0, 0.55 ), S( 6.6, - 2.4, 0, 0.45 ),
			S( - 10.4, 2.2, 0, 0.4 ), S( - 0.6, 3.5, 0, 0.3 ) );
		if ( R() < 0.5 ) L.bodies.push( { x: 1.5, z: 4.4, yaw: R() * 6, as: R() < 0.5 ? 'medic' : 'civilian' } );
	},

	farm_stand( s, L, P, R ) {
		P( 'farm_stand', 0, 0, 0, { sign: Math.floor( R() * 3 ) } );
		P( 'produce_crate', - 0.75, - 0.05, 0.1, { dy: 0.86, fruit: Math.floor( R() * 4 ) } );
		P( 'produce_crate', 0.75, - 0.1, - 0.08, { dy: 0.86, fruit: Math.floor( R() * 4 ) } );
		P( 'produce_crate', - 1.6, 0.6, 0.3, { fruit: 3 } );
		P( 'honesty_box', 1.55, 0.55, 0 );
		if ( s.ro !== undefined ) P( 'sign_aframe', 3.2, s.ro - s.rw / 2 - 1.4, HALF, { cell: R() < 0.5 ? 'fruit' : 'papaya' } );
		L.slots.push( S( 0, 0.05, 0.86, 0.9, SLOT_TABLES.fruit ), S( - 0.3, 0.2, 0.86, 0.75, SLOT_TABLES.fruit ), S( 0.95, 0.25, 0.86, 0.6 ), S( - 1.2, 1.0, 0, 0.45 ), S( 1.3, 1.1, 0, 0.35 ) );
		L.acts.push( { act: 'cash_box', x: 1.55, z: 0.55, h: 1.0, r: 0.6 } );
	},

	picnic( s, L, P, R ) {
		P( 'picnic_table', 0, 0, 0 );
		if ( R() < 0.7 ) P( 'bbq', 1.9, - 0.9, R() * 6 );
		if ( R() < 0.6 ) P( 'trash_can', - 1.7, - 1, R() * 6 );
		if ( R() < 0.5 ) P( 'cooler', - 1.3, 0.9, R() * 6, { c: pick( R, COLORS.cooler ) } );
		L.slots.push( S( - 0.4, 0.05, 0.77, 0.85 ), S( 0.45, - 0.1, 0.77, 0.6, SLOT_TABLES.drinks ), S( 0.6, 0.72, 0.46, 0.3 ), S( 1.6, - 0.3, 0, 0.35 ) );
		if ( R() < 0.5 ) L.decals.push( D( 'papers', range( R, - 1, 1 ), range( R, - 1, 1 ), 2, R() * 6 ) );
	},

	body( s, L, P, R ) {
		L.bodies.push( { x: 0, z: 0, yaw: R() * 6, as: pick( R, [ 'civilian', 'civilian', 'tourist', 'runner', 'police' ] ) } );
		L.decals.push( D( 'blood_pool', 0, 0, range( R, 2, 2.8 ), R() * 6 ) );
		if ( R() < 0.6 ) L.decals.push( D( 'blood_drag', range( R, - 1.2, 1.2 ), range( R, 1.2, 2 ), 2.6, R() * 6 ) );
		ring( L, 0, 0, 4, 0.7, 1.7, R, [ 0.95, 0.75, 0.5, 0.3 ] );
	},

	supply_drop( s, L, P, R ) {
		P( 'drop_crate', 0, 0, R() * 0.4, { open: true } );
		P( 'parachute', - 3.8, 1.6, 0, { to: [ 3.8, - 1.6 ] } );
		L.fx.push( { fx: 'flare', x: 1.6, z: 0.9, h: 0.05 } );
		L.slots.push( S( - 0.2, 0, 1.03, 1, SLOT_TABLES.relief ), S( 0.35, 0.1, 1.03, 0.8 ), S( 1.2, - 0.6, 0, 0.9 ), S( - 1.2, 0.8, 0, 0.8 ), S( 0.7, 1.2, 0, 0.7 ), S( - 0.9, - 1.0, 0, 0.6 ), S( 1.6, 0.4, 0, 0.45 ) );
		L.acts.push( { act: 'cut_chute', x: - 3.8, z: 1.6, h: 0.3, r: 1.8 } );
	},

	stash( s, L, P, R ) {
		// before digging: a cairn and turned soil; after (s.dug): an open box in a hole, the cache around it
		if ( ! s.dug ) {
			P( 'cairn', 0.7, 0.3, R() * 6 );
			L.decals.push( D( 'soil', 0, 0, 1.6, R() * 6 ) );
			L.acts.push( { act: 'dig', x: 0, z: 0, h: 0.2, r: 1 } );
			return;
		}
		P( 'cairn', 0.7, 0.3, R() * 6, { scattered: true } );
		P( 'dirt_mound', - 0.9, 0.2, R() * 6 );
		P( 'stash_tote', 0, 0, R() * 6 );
		L.decals.push( D( 'hole', 0, 0, 1.5, R() * 6 ) );
		const table = s.rich ? 'site_stash_rich' : 'site_stash';
		ring( L, 0, 0, s.rich ? 6 : 5, 0.7, 1.4, R, [ 1, 0.95, 0.85, 0.7, 0.55, 0.45 ], table );
	},
};

// litter piles and the odd extra prop (nothing here holds loot or changes what does)
const litter = ( P, R, set, x, z, n, r ) => P( 'litter', x + range( R, - 0.3, 0.3 ), z + range( R, - 0.3, 0.3 ), R() * 6, { set, n, r } );
const DRESS = {
	roadside( s, L, P, R ) { const c = L.props[ 0 ] || { x: 0, z: 0 }; litter( P, R, 'street', c.x, c.z, 6, 1.7 ); },
	bus_stop( s, L, P, R ) { litter( P, R, 'street', 0.3, 0.7, 7, 1.5 ); },
	crash_car( s, L, P, R ) {
		if ( s.ev === 'crash' ) { litter( P, R, 'crash', - 4, ( s.hw || 4 ) + 1.4, 7, 2.5 ); return; }
		litter( P, R, 'crash', 0.6, 2.2, 8, 2 );
		litter( P, R, 'street', - 1.5, - 3, 4, 1.4 );
	},
	beach_camp( s, L, P, R ) { litter( P, R, 'beach', 0.4, 0.6, 5, 1.6 ); },
	campsite( s, L, P, R ) {
		litter( P, R, 'camp', 0.2, 0.9, 8, 2.2 );
		// a washing line strung behind the tent
		P( 'clothesline', range( R, - 0.4, 0.4 ), - 4.1, range( R, - 0.15, 0.15 ), { len: 3 } );
	},
	hiker( s, L, P, R ) { litter( P, R, 'camp', 0.6, - 0.4, 3, 1.2 ); },
	fishing_spot( s, L, P, R ) { litter( P, R, 'fish', - 0.3, 0.1, 6, 1.4 ); },
	checkpoint( s, L, P, R ) {
		if ( s.ev === 'roadblock' ) { const hw = s.hw || 4; litter( P, R, 'police', 9, hw + 2.6, 7, 2 ); litter( P, R, 'police', 2, hw * 0.4, 6, 2.5 ); return; }
		litter( P, R, 'police', 0.6, 0.7, 8, 1.8 );
		litter( P, R, 'police', 3.2, 2.6, 6, 1.6 );
	},
	military_checkpoint( s, L, P, R ) {
		if ( s.ev === 'checkpoint' ) { const sd = s.sd || 1; litter( P, R, 'mil', - 11.6, sd * ( ( s.hw || 4 ) + 3.2 ), 8, 1.8 ); return; }
		// brass behind the nest, HESCO closing the flank, a warning sign
		litter( P, R, 'mil', 0, 0.45, 10, 1.4 );
		litter( P, R, 'mil', - 4.6, 0.2, 5, 1.6 );
		P( 'hesco', 3.85, 1.3, range( R, - 0.05, 0.05 ), { n: 2 } );
		P( 'warn_sign', - 3.9, 1.7, range( R, - 0.3, 0.3 ), { cell: 'restricted' } );
	},
	heli_crash( s, L, P, R ) {
		litter( P, R, 'wreck', 2.5, - 2.2, 9, 3 );
		litter( P, R, 'wreck', - 5, 3, 7, 2.6 );
		litter( P, R, 'mil', 5, 1.5, 6, 1.5 );
	},
	fema_camp( s, L, P, R ) {
		litter( P, R, 'relief', 0.5, 2.2, 10, 3 );
		litter( P, R, 'relief', 6.4, 0.2, 7, 2.2 );
		litter( P, R, 'relief', - 7, 2.6, 5, 1.8 );
		// somebody's washing between two tents, chairs out front
		P( 'clothesline', - 3.3, - 2.95, 0, { len: 3.2 } );
		P( 'camp_chair', 2.4, - 1.9, range( R, 2.6, 3.6 ), { c: 0x3a5a7a } );
		if ( R() < 0.6 ) P( 'camp_chair', 4.6, - 2.0, range( R, 2.6, 3.6 ), { c: 0x7d2f2a } );
	},
	farm_stand( s, L, P, R ) { litter( P, R, 'farm', 0.2, 1.1, 6, 1.4 ); },
	picnic( s, L, P, R ) { litter( P, R, 'picnic', 0, 0.1, 7, 1.7 ); },
	body( s, L, P, R ) { litter( P, R, 'street', range( R, - 0.8, 0.8 ), range( R, 0.8, 1.4 ), 3, 0.9 ); },
	supply_drop( s, L, P, R ) { litter( P, R, 'drop', 0.6, 1.2, 7, 1.8 ); },
};

// every slot's item key: the site key and the slot index
export const slotKey = ( site, k ) => `${site.key}:${k}`;
export const tableOf = ( site, slot ) => slot.table || KINDS[ site.kind ]?.table;
