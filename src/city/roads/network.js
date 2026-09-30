// The road network, shared by the world workers (meshes, props) and the main thread (queries, spawning).
// Pure JS (no three.js) so a worker can import it. Built deterministically from world.json on both sides:
//   - highways (meta.roads) as Catmull-Rom curves through the baked 6 m knots, split into the "runs" that are
//     actually drawn: a highway disappears where it runs through a city grid (the streets carry it there) or
//     where a higher-class highway already covers the same path (routes share corridors in the bake);
//   - city streets (meta.streets) with their intersection nodes on each city's grid;
//   - runways + a parallel taxiway, military / airport perimeter fences with gates;
//   - paved parking lots on the ground the buildings leave free in the town blocks, with driveways;
//   - the static outbreak "events" along the highways: roadblocks, checkpoints, traffic jams, crashes.
import { augmentBuildings } from '../buildings/infill.js';
import { TYPE_OF } from '../buildings/data.js';

export const CELL = 320; // streaming cell (m)
export const MILE = 1609.34 / 8; // one real mile at the world's 1:8 horizontal scale
export const FLAG_CITY = 32;

// road surface classes (shader: rd.z)
export const RC = { FREEWAY: 0, HIGHWAY: 1, DIRT: 2, STREET: 3, INTER: 4, RUNWAY: 5, TAXIWAY: 6, WALK: 7, APRON: 8, LOT: 9 };
// street kinds (shader: rd2.z for streets)
export const SK = { METRO: 0, TOWN: 1, VILLAGE: 2, BASE: 3 };

// ---- hashing ---------------------------------------------------------------------------------------

export function hashStr( s ) {
	let h = 2166136261;
	for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	return h >>> 0;
}

export function mulberry32( a ) {
	return () => {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul( a ^ a >>> 15, 1 | a );
		t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;
	};
}

// integer hash -> [0, 1)
export function hh( a, b = 0, c = 0 ) {
	let n = Math.imul( a | 0, 374761393 ) + Math.imul( b | 0, 668265263 ) + Math.imul( c | 0, 1442695041 );
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	n = Math.imul( n ^ ( n >>> 15 ), 2246822519 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
}

// ---- segment spatial hash ----------------------------------------------------------------------------

export class SegHash {
	constructor( cell = 48 ) { this.cell = cell; this.map = new Map(); this.stamp = 0; }
	static key( i, j ) { return ( i + 32768 ) * 65536 + ( j + 32768 ); }
	add( seg, pad = 0 ) {
		const c = this.cell;
		const i0 = Math.floor( ( Math.min( seg.ax, seg.bx ) - pad ) / c ), i1 = Math.floor( ( Math.max( seg.ax, seg.bx ) + pad ) / c );
		const j0 = Math.floor( ( Math.min( seg.az, seg.bz ) - pad ) / c ), j1 = Math.floor( ( Math.max( seg.az, seg.bz ) + pad ) / c );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const k = SegHash.key( i, j );
			let a = this.map.get( k );
			if ( ! a ) { a = []; this.map.set( k, a ); }
			a.push( seg );
		}
		seg._st = 0;
		return seg;
	}
	query( x, z, r, fn ) {
		const st = ++ this.stamp, c = this.cell;
		const i0 = Math.floor( ( x - r ) / c ), i1 = Math.floor( ( x + r ) / c ), j0 = Math.floor( ( z - r ) / c ), j1 = Math.floor( ( z + r ) / c );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const a = this.map.get( SegHash.key( i, j ) );
			if ( ! a ) continue;
			for ( const s of a ) {
				if ( s._st === st ) continue;
				s._st = st;
				if ( fn( s ) === false ) return;
			}
		}
	}
}

export let segT = 0; // parameter of the last segDist call
export function segDist( s, x, z ) {
	const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1e-9;
	let t = ( ( x - s.ax ) * dx + ( z - s.az ) * dz ) / l2;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	segT = t;
	return Math.hypot( x - s.ax - dx * t, z - s.az - dz * t );
}

// ---- place names (highway nodes that aren't cities) and route numbers ------------------------------

const NODE_NAMES = {
	polihale: 'Polihale', kekaha: 'Kekaha', kokee: 'Kōkeʻe', kalalau: 'Kalalau', kalaheo: 'Kalāheo', kilauea: 'Kīlauea',
	keebeach: 'Keʻe Beach', poipu: 'Poʻipū', makapuu: 'Makapuʻu', waimanalo: 'Waimānalo', kahaluu: 'Kahaluʻu', kaaawa: 'Kaʻaʻawa',
	kahuku: 'Kahuku', sunset: 'Sunset Beach', waialua: 'Waialua', mokuleia: 'Mokulēʻia', kaenaw: 'Kaʻena Point', makaha: 'Mākaha',
	nanakuli: 'Nānākuli', kahala: 'Kāhala', nuuanu: 'Nuʻuanu Pali', diamondhead: 'Diamond Head', h3mid: 'Hālawa', kaluakoi: 'Kaluakoʻi',
	hoolehua: 'Hoʻolehua', kualapuu: 'Kualapuʻu', halawa: 'Hālawa Valley', pukoo: 'Pukoʻo', kaumalapau: 'Kaumālapau Harbor',
	keomuku: 'Keōmuku', gardengods: 'Garden of the Gods', kapalua: 'Kapalua', kahakuloa: 'Kahakuloa', waihee: 'Waiheʻe',
	olowalu: 'Olowalu', maalaea: 'Māʻalaea', makena: 'Mākena', ulupalakua: 'ʻUlupalakua', kaupo: 'Kaupō', kipahulu: 'Kīpahulu',
	nahiku: 'Nāhiku', haiku: 'Haʻikū', makawao: 'Makawao', kula: 'Kula', haleakala: 'Haleakalā', honomu: 'Honomū',
	laupahoehoe: 'Laupāhoehoe', waipio: 'Waipiʻo Valley', kalapana: 'Kalapana', pahala: 'Pāhala', southpoint: 'South Point',
	oceanview: 'Ocean View', kealakekua: 'Kealakekua', saddlewest: 'Saddle Road', saddlemid: 'Saddle Road', saddleeast: 'Saddle Road',
	mkaccess: 'Mauna Kea', kohala: 'Kohala', kilaueacrater: 'Volcanoes Natl Park', puna: 'Puna', hookena: 'Hoʻokena',
	niihaun: 'Niʻihau North', niihaus: 'Niʻihau South', ito: 'Hilo Airport', ogg: 'Kahului Airport', koa: 'Kona Airport', lih: 'Līhuʻe Airport',
	hnl: 'Airport',
};

const ROUTES = [
	[ 'H-1', 'kapolei-waipahu waipahu-pearlcity pearlcity-aiea aiea-hnl hnl-kalihi kalihi-honolulu kaimuki-kahala' ],
	[ 'H-2', 'wahiawa-mililani mililani-pearlcity' ], [ 'H-3', 'aiea-h3mid h3mid-kaneohe' ],
	[ '61', 'honolulu-nuuanu nuuanu-kailua' ], [ '72', 'kahala-hawaiikai hawaiikai-makapuu makapuu-waimanalo waimanalo-kailua diamondhead-kahala' ],
	[ '83', 'kaneohe-kahaluu kahaluu-kaaawa kaaawa-laie laie-kahuku kahuku-sunset sunset-haleiwa' ], [ '99', 'haleiwa-wahiawa wahiawa-schofield' ],
	[ '93', 'kapolei-nanakuli nanakuli-waianae waianae-makaha' ], [ '76', 'kapolei-ewa waipahu-ewa' ], [ '92', 'honolulu-waikiki waikiki-kaimuki waikiki-diamondhead honolulu-manoa' ],
	[ '630', 'kailua-kaneohe kailua-mcbh' ], [ '930', 'haleiwa-waialua' ], [ '73', 'pearlcity-pearlharbor' ],
	[ '50', 'pmrf-kekaha kekaha-waimeak waimeak-hanapepe hanapepe-kalaheo kalaheo-lihue' ], [ '56', 'lihue-kapaa kapaa-kilauea kilauea-princeville princeville-hanalei' ],
	[ '520', 'kalaheo-koloa koloa-poipu koloa-lihue' ], [ '550', 'waimeak-kokee' ], [ '570', 'lihue-lih' ],
	[ '460', 'kaluakoi-maunaloa maunaloa-hoolehua hoolehua-kaunakakai' ], [ '470', 'hoolehua-kualapuu kualapuu-kaunakakai' ], [ '450', 'kaunakakai-pukoo' ],
	[ '440', 'lanaicity-manele lanaicity-kaumalapau' ],
	[ '30', 'kapalua-kaanapali kaanapali-lahaina lahaina-olowalu olowalu-maalaea maalaea-wailuku' ], [ '32', 'wailuku-kahului' ], [ '36', 'kahului-ogg paia-kahului haiku-paia' ],
	[ '31', 'maalaea-kihei kihei-wailea' ], [ '311', 'kihei-kahului' ], [ '360', 'hana-nahiku nahiku-haiku kipahulu-hana' ], [ '37', 'kahului-pukalani pukalani-kula ulupalakua-kula' ],
	[ '378', 'kula-haleakala' ], [ '390', 'pukalani-makawao makawao-paia' ], [ '340', 'waihee-wailuku' ],
	[ '11', 'hilo-keaau keaau-volcano volcano-pahala pahala-naalehu naalehu-oceanview oceanview-hookena hookena-captaincook captaincook-kealakekua kealakekua-kona hilo-ito volcano-kilaueacrater' ],
	[ '19', 'kona-koa koa-waikoloabeach waikoloabeach-kawaihae kawaihae-waimeabi waimeabi-honokaa honokaa-laupahoehoe laupahoehoe-honomu honomu-hilo' ],
	[ '270', 'kawaihae-kohala kohala-hawi' ], [ '130', 'keaau-pahoa' ], [ '200', 'hilo-saddleeast saddleeast-saddlemid saddlemid-pta pta-saddlewest saddlewest-waikoloa' ],
	[ '190', 'waimeabi-waikoloa waikoloa-waikoloabeach' ], [ '250', 'kohala-waimeabi' ],
];
const ROUTE_OF = new Map();
for ( const [ r, list ] of ROUTES ) for ( const n of list.split( ' ' ) ) ROUTE_OF.set( n, r );

// the 80 street names the city grids draw from (real Hawaiian street names)
export const STREET_NAMES = [
	'Kalākaua Ave', 'Kapiʻolani Blvd', 'Beretania St', 'King St', 'Kūhiō Ave', 'Ala Moana Blvd', 'Nuʻuanu Ave', 'Liliha St',
	'Kamehameha Hwy', 'Keʻeaumoku St', 'Piʻikoi St', 'Kaheka St', 'Makaloa St', 'Kona St', 'Pensacola St', 'Ward Ave',
	'Kamakeʻe St', 'Queen St', 'Halekauwila St', 'Pohukaina St', 'Punchbowl St', 'Alapaʻi St', 'Kīnaʻu St', 'Lunalilo St',
	'Wilder Ave', 'Dole St', 'Waiʻalae Ave', 'Koko Head Ave', 'Harding Ave', 'Maunakea St', 'ʻAʻala St', 'Hotel St',
	'Pauahi St', 'Kukui St', 'Vineyard Blvd', 'Nimitz Hwy', 'Waiakamilo Rd', 'Kalihi St', 'Dillingham Blvd', 'Kapālama Ave',
	'Kaumualiʻi Hwy', 'Hoʻolai St', 'Rice St', 'Haleko Rd', 'Olohana St', 'Lewers St', 'Seaside Ave', 'Kaʻiulani Ave',
	'ʻŌhua Ave', 'Paoakalani Ave', 'Kapahulu Ave', 'Monsarrat Ave', 'Kīlauea Ave', 'Kalanianaʻole Hwy', 'Kaʻahumanu Ave', 'Keawe St',
	'Kinoʻole St', 'Kanoelehua Ave', 'Ponahawai St', 'Waiānuenue Ave', 'Mamo St', 'Haʻili St', 'Ululani St', 'Kalanikoa St',
	'Front St', 'Baldwin Ave', 'Lahainaluna Rd', 'Market St', 'Vineyard St', 'Main St', 'Hana Hwy', 'Līpoa St',
	'Aliʻi Dr', 'Palani Rd', 'Kuakini Hwy', 'Hualālai Rd', 'Pualani St', 'Hoʻokena St', 'Moanalua Rd', 'Kamokila Blvd',
];
// military / airport base streets
export const BASE_NAMES = [ 'Wright Ave', 'Trimble Rd', 'Lyman Rd', 'Macomb Rd', 'Carter Dr', 'Hewitt St', 'Foote Ave', 'Waianae Ave', 'Kolekole Ave', 'Flagler Rd' ];

export function placeName( id, meta ) {
	const c = meta.cities.find( c => c.id === id );
	if ( c ) return c.name;
	return NODE_NAMES[ id ] || id.charAt( 0 ).toUpperCase() + id.slice( 1 );
}

// ---- highway curves --------------------------------------------------------------------------------

// point on a road at arc length s (Catmull-Rom through the knots); writes out = [x, z, tx, tz, yData]
export function roadPoint( r, s, out ) {
	const cum = r.cum, n = r.n;
	if ( s <= 0 ) s = 0; else if ( s >= r.len ) s = r.len;
	let lo = 0, hi = n - 1;
	while ( hi - lo > 1 ) { const m = ( lo + hi ) >> 1; if ( cum[ m ] <= s ) lo = m; else hi = m; }
	const i = lo, L = cum[ i + 1 ] - cum[ i ] || 1e-6;
	const t = ( s - cum[ i ] ) / L;
	const i0 = Math.max( 0, i - 1 ), i2 = Math.min( n - 1, i + 1 ), i3 = Math.min( n - 1, i + 2 );
	const X = r.x, Z = r.z;
	const t2 = t * t, t3 = t2 * t;
	const cr = ( p0, p1, p2, p3 ) => 0.5 * ( 2 * p1 + ( - p0 + p2 ) * t + ( 2 * p0 - 5 * p1 + 4 * p2 - p3 ) * t2 + ( - p0 + 3 * p1 - 3 * p2 + p3 ) * t3 );
	const dcr = ( p0, p1, p2, p3 ) => 0.5 * ( ( - p0 + p2 ) + 2 * ( 2 * p0 - 5 * p1 + 4 * p2 - p3 ) * t + 3 * ( - p0 + 3 * p1 - 3 * p2 + p3 ) * t2 );
	out[ 0 ] = cr( X[ i0 ], X[ i ], X[ i2 ], X[ i3 ] );
	out[ 1 ] = cr( Z[ i0 ], Z[ i ], Z[ i2 ], Z[ i3 ] );
	let tx = dcr( X[ i0 ], X[ i ], X[ i2 ], X[ i3 ] ), tz = dcr( Z[ i0 ], Z[ i ], Z[ i2 ], Z[ i3 ] );
	const l = Math.hypot( tx, tz ) || 1;
	out[ 2 ] = tx / l; out[ 3 ] = tz / l;
	out[ 4 ] = r.y[ i ] + ( r.y[ i2 ] - r.y[ i ] ) * t;
	return out;
}

// ---- the build ------------------------------------------------------------------------------------------

export function buildNetwork( meta, hf ) {
	// the buildings module appends its infill lots to meta.buildings (deterministic, idempotent); the parking lots
	// must see them, so every side builds them first whatever module happens to run first
	augmentBuildings( meta, hf );
	const net = {
		meta, hf, cities: meta.cities,
		frames: fitFrames( meta ),
		streets: [], nodes: new Map(), roads: [], runways: [], fences: [], events: [], signs: [], markers: [], regs: [], lots: [],
		edges: new Map(), // 'city:axis:i:j' (the street's low grid end) -> street
		shash: new SegHash( 48 ), // streets
		rhash: new SegHash( 48 ), // drawn highway runs
		allhash: new SegHash( 64 ), // every highway knot segment, drawn or not
		lhash: new SegHash( 48 ), // parking lots (their diagonals)
		zones: [], // rectangles no street may cross (runways, taxiways): { x, z, cx, sx, hl, hw }
	};
	buildRunways( net, meta );
	buildStreets( net, meta );
	buildRoads( net, meta, hf );
	buildFences( net, meta );
	buildLots( net, meta, hf );
	buildEvents( net, meta );
	return net;
}

// The bake stores each city's grid angle rounded to 0.01 rad: rebuilt from that, the grid drifts by up to ~3 m
// against the baked streets, buildings and flattened street beds far from the centre (Honolulu). Fit every
// city's frame (origin + angle; the block pitch is exact) to its baked street ends instead (2-D Procrustes).
function fitFrames( meta ) {
	const pts = meta.cities.map( () => [] );
	for ( const s of meta.streets ) {
		const c = meta.cities[ s[ 0 ] ];
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		for ( const [ x, z ] of [ [ s[ 1 ], s[ 2 ] ], [ s[ 4 ], s[ 5 ] ] ] ) {
			const i = Math.round( ( ( x - c.x ) * ca + ( z - c.z ) * sa ) / c.pu ), j = Math.round( ( - ( x - c.x ) * sa + ( z - c.z ) * ca ) / c.pv );
			pts[ s[ 0 ] ].push( x, z, i * c.pu, j * c.pv );
		}
	}
	return meta.cities.map( ( c, k ) => {
		const P = pts[ k ], n = P.length / 4;
		let angle = c.angle, ox = c.x, oz = c.z;
		if ( n >= 4 ) {
			let mx = 0, mz = 0, mu = 0, mv = 0;
			for ( let q = 0; q < P.length; q += 4 ) { mx += P[ q ]; mz += P[ q + 1 ]; mu += P[ q + 2 ]; mv += P[ q + 3 ]; }
			mx /= n; mz /= n; mu /= n; mv /= n;
			let dot = 0, cross = 0;
			for ( let q = 0; q < P.length; q += 4 ) {
				const px = P[ q ] - mx, pz = P[ q + 1 ] - mz, qu = P[ q + 2 ] - mu, qv = P[ q + 3 ] - mv;
				dot += qu * px + qv * pz; cross += qu * pz - qv * px;
			}
			// (world = origin + R( angle ) ( u, v ), as the bake's toW)
			if ( dot > 0 ) {
				angle = Math.atan2( cross, dot );
				const ca = Math.cos( angle ), sa = Math.sin( angle );
				ox = mx - ( mu * ca - mv * sa ); oz = mz - ( mu * sa + mv * ca );
			}
		}
		const ca = Math.cos( angle ), sa = Math.sin( angle );
		return { x: ox, z: oz, angle, ca, sa, toW: ( u, v ) => [ ox + u * ca - v * sa, oz + u * sa + v * ca ], toG: ( x, z ) => [ ( x - ox ) * ca + ( z - oz ) * sa, - ( x - ox ) * sa + ( z - oz ) * ca ] };
	} );
}

// runway + a parallel taxiway on the side with fewer buildings
function buildRunways( net, meta ) {
	// (the baked buildings only: the taxiway side must not depend on the buildings module's infill)
	const B = meta.buildings.data, NB = meta.buildings.infill ? meta.buildings.infill.from * 11 : B.length;
	for ( let k = 0; k < meta.runways.length; k ++ ) {
		const rw = meta.runways[ k ];
		const cx = Math.cos( rw.angle ), sx = Math.sin( rw.angle );
		// right of the runway direction
		const nx = - sx, nz = cx;
		let side = 1, cnt = [ 0, 0 ];
		for ( let i = 0; i < NB; i += 11 ) {
			const dx = B[ i ] - rw.x, dz = B[ i + 1 ] - rw.z;
			const along = dx * cx + dz * sx, across = dx * nx + dz * nz;
			if ( Math.abs( along ) > rw.len / 2 + 40 ) continue;
			const a = Math.abs( across );
			if ( a > rw.w / 2 + 12 && a < rw.w / 2 + 70 ) cnt[ across > 0 ? 0 : 1 ] ++;
		}
		if ( cnt[ 1 ] < cnt[ 0 ] ) side = - 1;
		const taxiOff = side * ( rw.w / 2 + 34 ), taxiW = 15;
		const heading = ( a ) => { let h = Math.round( ( ( Math.atan2( Math.cos( a ), - Math.sin( a ) ) * 180 / Math.PI + 360 ) % 360 ) / 10 ); if ( h === 0 ) h = 36; return h; };
		// travel direction (cos a, sin a): compass heading = atan2( dx, -dz )
		const hdg = ( dx, dz ) => { let h = Math.round( ( ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360 ) / 10 ); if ( h === 0 ) h = 36; return h; };
		void heading;
		const r = {
			i: k, x: rw.x, z: rw.z, y: rw.y, angle: rw.angle, len: rw.len, w: rw.w, cx, sx, nx, nz, side, taxiOff, taxiW,
			numA: hdg( cx, sx ), numB: hdg( - cx, - sx ),
			connectors: [ - rw.len / 2 + 30, 0, rw.len / 2 - 30 ],
		};
		net.runways.push( r );
		net.zones.push( { x: rw.x, z: rw.z, cx, sx, hl: rw.len / 2 + 12, hw: rw.w / 2 + 5 } );
		net.zones.push( { x: rw.x + nx * taxiOff, z: rw.z + nz * taxiOff, cx, sx, hl: rw.len / 2 - 10, hw: taxiW / 2 + 4 } );
		for ( const s of r.connectors ) {
			const off = taxiOff / 2;
			net.zones.push( { x: rw.x + cx * s + nx * off, z: rw.z + sx * s + nz * off, cx, sx, hl: taxiW / 2 + 4, hw: Math.abs( off ) } );
		}
	}
}

export function inZone( net, x, z, pad = 0 ) {
	for ( const q of net.zones ) {
		const dx = x - q.x, dz = z - q.z;
		const a = dx * q.cx + dz * q.sx, b = - dx * q.sx + dz * q.cx;
		if ( Math.abs( a ) < q.hl + pad && Math.abs( b ) < q.hw + pad ) return true;
	}
	return false;
}

function streetKind( c ) {
	return c.kind === 'metro' ? SK.METRO : c.kind === 'village' ? SK.VILLAGE : ( c.kind === 'military' || c.kind === 'airport' || c.kind === 'observatory' ) ? SK.BASE : SK.TOWN;
}

function buildStreets( net, meta ) {
	const nodes = net.nodes;
	const getNode = ( ci, i, j ) => {
		const key = ci * 1e6 + ( i + 500 ) * 1000 + ( j + 500 );
		let n = nodes.get( key );
		if ( ! n ) {
			const c = meta.cities[ ci ], F = net.frames[ ci ];
			const [ x, z ] = F.toW( i * c.pu, j * c.pv );
			n = { key, city: ci, i, j, x, z, arms: 0, w: 0, walk: 0, kind: streetKind( c ),
				ca: F.ca, sa: F.sa, streets: [ null, null, null, null ] };
			nodes.set( key, n );
		}
		return n;
	};
	for ( let si = 0; si < meta.streets.length; si ++ ) {
		const [ ci, ax, az, , bx, bz, , w, walk ] = meta.streets[ si ];
		const c = meta.cities[ ci ], F = net.frames[ ci ];
		const uv = ( x, z ) => { const [ u, v ] = F.toG( x, z ); return [ Math.round( u / c.pu ), Math.round( v / c.pv ) ]; };
		let [ ia, ja ] = uv( ax, az ), [ ib, jb ] = uv( bx, bz );
		const axis = ja === jb ? 0 : 1;
		if ( ( axis === 0 && ib < ia ) || ( axis === 1 && jb < ja ) ) { [ ia, ib ] = [ ib, ia ]; [ ja, jb ] = [ jb, ja ]; }
		const A = getNode( ci, ia, ja ), Bn = getNode( ci, ib, jb );
		// streets under a runway or taxiway are dropped (the apron replaces them)
		let blocked = false;
		for ( let t = 0; t <= 1.0001 && ! blocked; t += 0.05 ) if ( inZone( net, A.x + ( Bn.x - A.x ) * t, A.z + ( Bn.z - A.z ) * t, w / 2 + 2 ) ) blocked = true;
		if ( blocked ) continue;
		const dx = Bn.x - A.x, dz = Bn.z - A.z, len = Math.hypot( dx, dz );
		const kind = streetKind( c );
		const st = {
			id: net.streets.length, city: ci, a: A, b: Bn, axis, line: axis === 0 ? A.j : A.i, w, walk, kind,
			ax: A.x, az: A.z, bx: Bn.x, bz: Bn.z, len, dx: dx / len, dz: dz / len,
			name: 0, cityKind: c.kind,
		};
		// one name per grid line, stepping through the list so neighbouring lines differ
		const names = kind === SK.BASE ? BASE_NAMES : STREET_NAMES;
		st.name = ( ( hashStr( c.id ) % names.length ) + axis * 37 + st.line * 7 + names.length * 64 ) % names.length;
		st.base = kind === SK.BASE;
		st.drives = null; // driveways into parking lots: [ [ side, a0, a1 ] ] (see buildLots)
		net.streets.push( st );
		net.edges.set( ci + ':' + axis + ':' + A.i + ':' + A.j, st );
		net.shash.add( st, w / 2 + walk + 4 );
		A.arms |= 1 << ( axis === 0 ? 0 : 1 ); A.streets[ axis === 0 ? 0 : 1 ] = st;
		Bn.arms |= 1 << ( axis === 0 ? 2 : 3 ); Bn.streets[ axis === 0 ? 2 : 3 ] = st;
		for ( const n of [ A, Bn ] ) { n.w = Math.max( n.w, w ); n.walk = Math.max( n.walk, walk ); }
	}
	for ( const [ k, n ] of nodes ) if ( ! n.arms ) nodes.delete( k );
	for ( const n of nodes.values() ) {
		n.deg = ( n.arms & 1 ) + ( ( n.arms >> 1 ) & 1 ) + ( ( n.arms >> 2 ) & 1 ) + ( ( n.arms >> 3 ) & 1 );
		const c = meta.cities[ n.city ];
		n.distC = Math.hypot( n.x - c.x, n.z - c.z ) / c.radius;
	}
}

// arm direction d of a node (0 +u, 1 +v, 2 -u, 3 -v) as a world xz unit vector
export function armDir( n, d ) {
	const s = d >= 2 ? - 1 : 1;
	return ( d & 1 ) ? [ - n.sa * s, n.ca * s ] : [ n.ca * s, n.sa * s ];
}

function onStreet( net, x, z, pad ) {
	let hit = false;
	net.shash.query( x, z, 24, ( s ) => { if ( segDist( s, x, z ) < s.w / 2 + s.walk + pad ) { hit = true; return false; } } );
	return hit;
}

function streetAsphaltDist( net, x, z ) {
	let best = Infinity;
	net.shash.query( x, z, 24, ( s ) => { const d = segDist( s, x, z ) - s.w / 2; if ( d < best ) best = d; } );
	return best;
}

function buildRoads( net, meta, hf ) {
	const roads = meta.roads.map( ( r, i ) => {
		const n = r.pts.length / 3;
		const x = new Float64Array( n ), z = new Float64Array( n ), y = new Float64Array( n ), cum = new Float64Array( n );
		for ( let k = 0; k < n; k ++ ) {
			x[ k ] = r.pts[ k * 3 ]; z[ k ] = r.pts[ k * 3 + 1 ]; y[ k ] = r.pts[ k * 3 + 2 ];
			if ( k ) cum[ k ] = cum[ k - 1 ] + Math.hypot( x[ k ] - x[ k - 1 ], z[ k ] - z[ k - 1 ] );
		}
		const [ from, to ] = r.name.split( '-' );
		return { i, lanes: r.lanes, w: r.w, hw: r.w / 2, name: r.name, from, to, n, x, z, y, cum, len: cum[ n - 1 ], runs: [],
			route: ROUTE_OF.get( r.name ) || '', fromName: placeName( from, meta ), toName: placeName( to, meta ) };
	} );
	net.roads = roads;
	for ( const r of roads ) for ( let k = 0; k < r.n - 1; k ++ ) net.allhash.add( { ax: r.x[ k ], az: r.z[ k ], bx: r.x[ k + 1 ], bz: r.z[ k + 1 ], road: r }, r.hw + 2 );
	const order = [ ...roads ].sort( ( a, b ) => ( b.lanes - a.lanes ) || ( b.len - a.len ) );
	const ahash = new SegHash( 48 ); // accepted (drawn) runs
	const P = [ 0, 0, 0, 0, 0 ];
	// 0 keep, 1 in a city grid / street corridor, 2 on a better highway, 3 on an airfield
	const why = ( r, x, z ) => {
		if ( inZone( net, x, z, 2 ) ) return 3;
		if ( hf.flagAt( x, z, FLAG_CITY ) > 0.5 || onStreet( net, x, z, 2 ) ) return 1;
		let shared = false;
		ahash.query( x, z, 16, ( s ) => { if ( s.road !== r && segDist( s, x, z ) < s.road.hw + 0.5 ) { shared = true; return false; } } );
		return shared ? 2 : 0;
	};
	for ( const r of order ) {
		const n = r.n;
		const sup = new Uint8Array( n );
		for ( let k = 0; k < n; k ++ ) sup[ k ] = why( r, r.x[ k ], r.z[ k ] );
		// close tiny suppressed gaps (a knot grazing a corridor)
		for ( let k = 1; k < n - 1; k ++ ) if ( sup[ k ] && ! sup[ k - 1 ] && ! sup[ k + 1 ] && sup[ k ] !== 3 ) sup[ k ] = 0;
		const runs = [];
		let k = 0;
		while ( k < n ) {
			if ( sup[ k ] ) { k ++; continue; }
			let e = k;
			while ( e + 1 < n && ! sup[ e + 1 ] ) e ++;
			let s0 = r.cum[ k ], s1 = r.cum[ e ];
			const t0 = k > 0 ? sup[ k - 1 ] : 0, t1 = e < n - 1 ? sup[ e + 1 ] : 0;
			// refine the cut between the knots, then reach back into the street / the other highway
			if ( t0 ) s0 = extend( r, bisect( r, r.cum[ k - 1 ], r.cum[ k ], why, P ), - 1, t0 );
			if ( t1 ) s1 = extend( r, bisect( r, r.cum[ e + 1 ], r.cum[ e ], why, P ), 1, t1 );
			runs.push( { road: r, s0, s1, t0, t1 } );
			k = e + 1;
		}
		// drop scraps: short pieces between two suppressed stretches
		r.runs = runs.filter( q => q.s1 - q.s0 > ( q.t0 && q.t1 ? 45 : 8 ) );
		for ( const q of r.runs ) {
			let prev = null;
			for ( let s = q.s0; ; s = Math.min( q.s1, s + 6 ) ) {
				roadPoint( r, s, P );
				if ( prev ) {
					const seg = { ax: prev[ 0 ], az: prev[ 1 ], bx: P[ 0 ], bz: P[ 1 ], road: r, run: q, s0: prev[ 2 ], s1: s };
					ahash.add( seg, r.hw + 2 );
					net.rhash.add( seg, r.hw + 2 );
				}
				prev = [ P[ 0 ], P[ 1 ], s ];
				if ( s >= q.s1 ) break;
			}
		}
	}

	function bisect( r, sOut, sIn, fn, P2 ) {
		// sOut suppressed, sIn kept
		let a = sOut, b = sIn;
		for ( let it = 0; it < 9; it ++ ) {
			const m = ( a + b ) / 2;
			roadPoint( r, m, P2 );
			if ( fn( r, P2[ 0 ], P2[ 1 ] ) ) a = m; else b = m;
		}
		return b;
	}

	// push a run end (dir -1: the start, +1: the end) back into what suppressed it until it overlaps the asphalt
	function extend( r, s, dir, type ) {
		if ( type === 3 ) return s;
		const Q = [ 0, 0, 0, 0, 0 ];
		for ( let d = 0; d <= 30; d += 0.5 ) {
			const ss = s + dir * d;
			if ( ss < 0 || ss > r.len ) return Math.max( 0, Math.min( r.len, ss ) );
			roadPoint( r, ss, Q );
			if ( type === 1 ) {
				if ( streetAsphaltDist( net, Q[ 0 ], Q[ 1 ] ) < - 0.6 ) return ss;
			} else {
				let inside = false;
				ahash.query( Q[ 0 ], Q[ 1 ], 16, ( sg ) => { if ( sg.road !== r && segDist( sg, Q[ 0 ], Q[ 1 ] ) < sg.road.hw - 0.6 ) { inside = true; return false; } } );
				if ( inside ) return ss;
			}
		}
		return s;
	}
}

// distance to the nearest drawn highway surface edge (negative inside); returns [ d, road ]
export function highwayEdgeDist( net, x, z, r = 20 ) {
	let best = Infinity, road = null;
	net.rhash.query( x, z, r, ( s ) => { const d = segDist( s, x, z ) - s.road.hw; if ( d < best ) { best = d; road = s.road; } } );
	return [ best, road ];
}

// nearest drivable centreline point: drawn highway runs and city streets; returns
// { x, z, dx, dz, dist, lanes, width, kind, name } or null
export function nearestOnNetwork( net, x, z, maxDist ) {
	let best = null, bd = maxDist, bt = 0, hw = false;
	net.rhash.query( x, z, maxDist, ( s ) => { const d = segDist( s, x, z ); if ( d < bd ) { bd = d; best = s; bt = segT; hw = true; } } );
	net.shash.query( x, z, maxDist, ( s ) => { const d = segDist( s, x, z ); if ( d < bd ) { bd = d; best = s; bt = segT; hw = false; } } );
	if ( ! best ) return null;
	const s = best;
	const L = Math.hypot( s.bx - s.ax, s.bz - s.az ) || 1;
	const o = { x: s.ax + ( s.bx - s.ax ) * bt, z: s.az + ( s.bz - s.az ) * bt, dx: ( s.bx - s.ax ) / L, dz: ( s.bz - s.az ) / L, dist: bd };
	if ( hw ) {
		const r = s.road;
		return { ...o, lanes: r.lanes, width: r.w, kind: r.lanes === 1 ? 'dirt' : r.lanes === 4 ? 'freeway' : 'highway', name: r.route ? ( r.route.startsWith( 'H' ) ? r.route : 'Route ' + r.route ) : r.fromName + ' – ' + r.toName };
	}
	const names = s.base ? BASE_NAMES : STREET_NAMES;
	return { ...o, lanes: s.kind === SK.METRO ? 4 : 2, width: s.w, kind: 'street', name: names[ s.name ] || '' };
}

// candidate parking / shoulder spots within a radius: [ [ x, z, yaw ] ] (yaw: facing the travel direction)
export function roadsideSpots( net, cx, cz, radius ) {
	const cand = [], r2 = radius * radius;
	net.shash.query( cx, cz, radius, ( st ) => {
		const hw = st.w / 2, S = st.kind === SK.METRO ? 3.6 : st.kind === SK.TOWN ? 3.2 : 0;
		const u = hw - ( st.kind === SK.VILLAGE ? 1.0 : 1.15 );
		const nx = - st.dz, nz = st.dx;
		for ( let a = hw + S + 4; a < st.len - hw - S - 4; a += 6.5 ) for ( const side of [ - 1, 1 ] ) {
			const x = st.ax + st.dx * a + nx * u * side, z = st.az + st.dz * a + nz * u * side;
			if ( ( x - cx ) ** 2 + ( z - cz ) ** 2 > r2 ) continue;
			// traffic keeps right: the +u side travels along the street direction
			cand.push( [ x, z, Math.atan2( - st.dx * side, - st.dz * side ) ] );
		}
	} );
	net.rhash.query( cx, cz, radius, ( s ) => {
		const L = Math.hypot( s.bx - s.ax, s.bz - s.az );
		if ( L < 3 ) return;
		const dx = ( s.bx - s.ax ) / L, dz = ( s.bz - s.az ) / L;
		const mx = ( s.ax + s.bx ) / 2, mz = ( s.az + s.bz ) / 2;
		if ( ( mx - cx ) ** 2 + ( mz - cz ) ** 2 > r2 ) return;
		const side = ( Math.round( mx + mz ) & 1 ) ? 1 : - 1;
		const u = s.road.hw - 1.1;
		cand.push( [ mx - dz * u * side, mz + dx * u * side, Math.atan2( - dx * side, - dz * side ) ] );
	} );
	return cand;
}

// chain-link perimeter around military bases and airports, with gates where roads pass
function buildFences( net, meta ) {
	const byCity = new Map();
	for ( const s of net.streets ) {
		const c = meta.cities[ s.city ];
		if ( c.kind !== 'military' && c.kind !== 'airport' ) continue;
		if ( ! byCity.has( s.city ) ) byCity.set( s.city, new Map() );
		byCity.get( s.city ).set( s.axis + ':' + s.a.i + ':' + s.a.j, s );
	}
	for ( const [ ci, edges ] of byCity ) {
		const c = meta.cities[ ci ], F = net.frames[ ci ];
		const has = ( axis, i, j ) => edges.has( axis + ':' + i + ':' + j );
		// a block exists when all four of its edges do
		const block = ( i, j ) => has( 0, i, j ) && has( 0, i, j + 1 ) && has( 1, i, j ) && has( 1, i + 1, j );
		const ca = F.ca, sa = F.sa;
		const toW = F.toW;
		const D = c.street / 2 + 6;
		const segs = [];
		const eu = [ ca, sa ], ev = [ - sa, ca ];
		for ( const s of edges.values() ) {
			const i = s.a.i, j = s.a.j;
			// the blocks on either side of the edge
			const b1 = s.axis === 0 ? block( i, j - 1 ) : block( i - 1, j );
			const b2 = s.axis === 0 ? block( i, j ) : block( i, j );
			if ( b1 === b2 ) continue;
			const out = b1 ? 1 : - 1; // outward normal sign along the perpendicular grid axis
			// endpoints in grid units, offset outward, adjusted at convex / concave corners
			const cornerAdj = ( ni, nj ) => {
				let cnt = 0;
				for ( const [ a, b ] of [ [ - 1, - 1 ], [ 0, - 1 ], [ - 1, 0 ], [ 0, 0 ] ] ) if ( block( ni + a, nj + b ) ) cnt ++;
				return cnt === 1 ? D : cnt === 3 ? - D : 0;
			};
			let u0, v0, u1, v1;
			if ( s.axis === 0 ) {
				const v = j * c.pv + out * D;
				u0 = i * c.pu - cornerAdj( i, j ); u1 = ( i + 1 ) * c.pu + cornerAdj( i + 1, j ); v0 = v1 = v;
			} else {
				const u = i * c.pu + out * D;
				v0 = j * c.pv - cornerAdj( i, j ); v1 = ( j + 1 ) * c.pv + cornerAdj( i, j + 1 ); u0 = u1 = u;
			}
			const [ ax, az ] = toW( u0, v0 ), [ bx, bz ] = toW( u1, v1 );
			const o = s.axis === 0 ? ev : eu;
			segs.push( [ ax, az, bx, bz, o[ 0 ] * out, o[ 1 ] * out ] );
		}
		// cut gates where highways (drawn or not) and runways cross the line
		for ( const [ ax, az, bx, bz, ox, oz ] of segs ) {
			const L = Math.hypot( bx - ax, bz - az );
			const n = Math.ceil( L / 1.5 );
			let open = null;
			const pieces = [];
			for ( let k = 0; k <= n; k ++ ) {
				const t = k / n, x = ax + ( bx - ax ) * t, z = az + ( bz - az ) * t;
				let blocked = inZone( net, x, z, 4 );
				if ( ! blocked ) {
					const [ d ] = highwayEdgeDist( net, x, z, 30 );
					if ( d < 3.5 ) blocked = true;
				}
				if ( ! blocked ) net.allhash.query( x, z, 20, ( sg ) => { if ( segDist( sg, x, z ) < sg.road.hw + 3.5 ) { blocked = true; return false; } } );
				if ( ! blocked && open === null ) open = t;
				if ( ( blocked || k === n ) && open !== null ) {
					const t1 = blocked ? ( k - 1 ) / n : 1;
					if ( ( t1 - open ) * L > 2 ) pieces.push( [ ax + ( bx - ax ) * open, az + ( bz - az ) * open, ax + ( bx - ax ) * t1, az + ( bz - az ) * t1 ] );
					open = null;
				}
			}
			for ( const p of pieces ) net.fences.push( { ax: p[ 0 ], az: p[ 1 ], bx: p[ 2 ], bz: p[ 3 ], ox, oz, city: ci, military: c.kind === 'military' } );
		}
	}
}

// ---- parking lots --------------------------------------------------------------------------------------------
// The bake and the buildings' infill leave ground free in the town blocks (open lots, the corridors the highways
// cleared through the grids, the backs of big blocks), which read as dry lawn between the buildings. Most of it
// in the denser districts becomes surface parking: a rectangle on the city grid against one street, reached by
// a driveway across the sidewalk. Layout along b (depth, from the back): periods of row | aisle | row (17.8 m,
// rows back to back between periods), then a single-loaded row + aisle or a drive lane at the front; a cross
// aisle without stalls at the a = la end, where the driveway comes in.
export const LOT = { ROW: 5.4, AISLE: 7, PERIOD: 17.8, STALL: 2.6, CROSS: 7, DRIVE: 6.5, LIFT: 0.045 };
// the share of a block's free ground that is paved, by distance from the centre (fraction of the radius)
const LOT_ZONES = {
	metro: [ [ 0.3, 0.9 ], [ 0.62, 0.8 ], [ 9, 0.3 ] ],
	town: [ [ 0.3, 0.8 ], [ 9, 0.25 ] ],
	resort: [ [ 0.75, 0.6 ], [ 9, 0.25 ] ],
	village: [ [ 0.22, 0.55 ], [ 9, 0 ] ],
};
// the ground a building keeps round its footprint (local frame, the front is -z): yards, forecourts, walks
const CLAIM = { side: 2.5, back: 3, front: 8, gas: 16 };

const CG = 64;
const cgk = ( i, j ) => ( i + 2048 ) * 4096 + ( j + 2048 );
function buildLots( net, meta, hf ) {
	const D = meta.buildings.data, NB = Math.floor( D.length / 11 );
	const G = CG, claims = new Map(), gk = cgk;
	net.claims = claims;
	for ( let i = 0; i < NB; i ++ ) {
		const k = i * 11, x = D[ k ], z = D[ k + 1 ], w = D[ k + 2 ], d = D[ k + 3 ], a = D[ k + 4 ];
		const front = TYPE_OF[ D[ k + 7 ] ] === 'gas' ? CLAIM.gas : CLAIM.front;
		const o = { x, z, c: Math.cos( a ), s: Math.sin( a ), x0: - w / 2 - CLAIM.side, x1: w / 2 + CLAIM.side, z0: - d / 2 - front, z1: d / 2 + CLAIM.back, hw: w / 2, hd: d / 2 };
		const r = Math.hypot( w / 2 + CLAIM.side, d / 2 + front );
		for ( let gi = Math.floor( ( x - r ) / G ); gi <= Math.floor( ( x + r ) / G ); gi ++ ) for ( let gj = Math.floor( ( z - r ) / G ); gj <= Math.floor( ( z + r ) / G ); gj ++ ) {
			const key = gk( gi, gj );
			let l = claims.get( key );
			if ( ! l ) claims.set( key, l = [] );
			l.push( o );
		}
	}
	// the claims that reach a disc
	const near = ( x, z, r ) => {
		const set = new Set();
		for ( let gi = Math.floor( ( x - r ) / G ); gi <= Math.floor( ( x + r ) / G ); gi ++ ) for ( let gj = Math.floor( ( z - r ) / G ); gj <= Math.floor( ( z + r ) / G ); gj ++ ) for ( const o of claims.get( gk( gi, gj ) ) || [] ) set.add( o );
		return set;
	};
	const CS = 2.5;
	for ( let ci = 0; ci < meta.cities.length; ci ++ ) {
		const c = meta.cities[ ci ], zones = LOT_ZONES[ c.kind ];
		if ( ! zones || ! c.pu ) continue;
		const F = net.frames[ ci ];
		const E = ( axis, i, j ) => net.edges.get( ci + ':' + axis + ':' + i + ':' + j );
		// the blocks: grid cells whose four edges are streets (low corner = the axis-0 street's low end)
		const blocks = [];
		for ( const st of net.streets ) if ( st.city === ci && st.axis === 0 ) {
			const i = st.a.i, j = st.a.j;
			if ( E( 0, i, j + 1 ) && E( 1, i, j ) && E( 1, i + 1, j ) ) blocks.push( [ i, j, st ] );
		}
		const hwS = c.street / 2, wk = c.walk || 0;
		for ( const [ i, j, st0 ] of blocks ) {
			const u0 = i * c.pu + hwS + wk, u1 = ( i + 1 ) * c.pu - hwS - wk, v0 = j * c.pv + hwS + wk, v1 = ( j + 1 ) * c.pv - hwS - wk;
			const [ mx, mz ] = F.toW( ( u0 + u1 ) / 2, ( v0 + v1 ) / 2 );
			const dc = Math.hypot( mx - c.x, mz - c.z ) / Math.max( 1, c.radius );
			const p = zones.find( q => dc < q[ 0 ] )[ 1 ];
			const R = mulberry32( hashStr( 'lot:' + c.id + ':' + i + ':' + j ) );
			if ( R() >= p ) continue;
			const nu = Math.floor( ( u1 - u0 ) / CS ), nv = Math.floor( ( v1 - v0 ) / CS );
			if ( nu < 6 || nv < 6 ) continue;
			const pu = ( u1 - u0 - nu * CS ) / 2, pv = ( v1 - v0 - nv * CS ) / 2;
			const rad = Math.hypot( u1 - u0, v1 - v0 ) / 2;
			const nearHw = highwayEdgeDist( net, mx, mz, rad + 24 )[ 0 ] < rad + 6;
			const nearZone = inZone( net, mx, mz, rad + 12 );
			const free = new Uint8Array( nu * nv ), hs = new Float32Array( nu * nv );
			free.fill( 1 );
			// the buildings' claims burnt into the raster (grid frame: cell (a, b) centre at ( ua + a CS, vb + b CS ))
			const ua = u0 + pu + CS / 2, vb = v0 + pv + CS / 2;
			for ( const o of near( mx, mz, rad ) ) {
				// claim corners -> grid, their bounds -> cell ranges, then the exact test per cell
				let a0 = Infinity, a1 = - Infinity, b0 = Infinity, b1 = - Infinity;
				for ( const [ lx, lz ] of [ [ o.x0, o.z0 ], [ o.x1, o.z0 ], [ o.x0, o.z1 ], [ o.x1, o.z1 ] ] ) {
					const [ gu, gv ] = F.toG( o.x + lx * o.c - lz * o.s, o.z + lx * o.s + lz * o.c );
					a0 = Math.min( a0, gu ); a1 = Math.max( a1, gu ); b0 = Math.min( b0, gv ); b1 = Math.max( b1, gv );
				}
				const ia0 = Math.max( 0, Math.floor( ( a0 - ua ) / CS ) ), ia1 = Math.min( nu - 1, Math.ceil( ( a1 - ua ) / CS ) );
				const ib0 = Math.max( 0, Math.floor( ( b0 - vb ) / CS ) ), ib1 = Math.min( nv - 1, Math.ceil( ( b1 - vb ) / CS ) );
				for ( let a = ia0; a <= ia1; a ++ ) for ( let b = ib0; b <= ib1; b ++ ) {
					if ( ! free[ a * nv + b ] ) continue;
					const [ x, z ] = F.toW( ua + a * CS, vb + b * CS );
					const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = - dx * o.s + dz * o.c;
					if ( lx > o.x0 && lx < o.x1 && lz > o.z0 && lz < o.z1 ) free[ a * nv + b ] = 0;
				}
			}
			for ( let a = 0; a < nu; a ++ ) for ( let b = 0; b < nv; b ++ ) {
				const [ x, z ] = F.toW( ua + a * CS, vb + b * CS );
				const h = hf.heightAt( x, z );
				hs[ a * nv + b ] = h;
				if ( ! free[ a * nv + b ] ) continue;
				if ( h < 0.8 || ( nearHw && highwayEdgeDist( net, x, z, 20 )[ 0 ] < 3 ) || ( nearZone && inZone( net, x, z, 8 ) ) ) free[ a * nv + b ] = 0;
			}
			// too steep for a car park
			for ( let a = 0; a < nu; a ++ ) for ( let b = 0; b < nv; b ++ ) {
				const h = hs[ a * nv + b ];
				if ( ( a + 1 < nu && Math.abs( hs[ ( a + 1 ) * nv + b ] - h ) > 0.4 ) || ( b + 1 < nv && Math.abs( hs[ a * nv + b + 1 ] - h ) > 0.4 ) ) {
					free[ a * nv + b ] = 0;
					if ( a + 1 < nu ) free[ ( a + 1 ) * nv + b ] = 0;
					if ( b + 1 < nv ) free[ a * nv + b + 1 ] = 0;
				}
			}
			// up to three lots, the largest rectangle against one of the four streets first
			for ( let n = 0; n < 3; n ++ ) {
				const best = bestLot( free, nu, nv, hs );
				if ( ! best ) break;
				const [ side, s0, s1, depth ] = best;
				// block cells -> the lot in the frontage street's terms
				let st, sgn, g0, g1, dA, dB; // street, side of it, grid rect
				if ( side === 0 || side === 1 ) { // along u, against the v0 (side 0) or v1 street
					st = side === 0 ? st0 : E( 0, i, j + 1 );
					sgn = side === 0 ? 1 : - 1;
					const b0 = side === 0 ? 0 : nv - depth, b1 = side === 0 ? depth : nv;
					g0 = [ u0 + pu + s0 * CS, v0 + pv + b0 * CS ]; g1 = [ u0 + pu + ( s1 + 1 ) * CS, v0 + pv + b1 * CS ];
					if ( side === 0 ) g0[ 1 ] = v0; else g1[ 1 ] = v1; // flush against the sidewalk
					for ( let a = s0 - 1; a <= s1 + 1; a ++ ) for ( let b = b0 - 1; b <= b1; b ++ ) if ( a >= 0 && a < nu && b >= 0 && b < nv ) free[ a * nv + b ] = 0;
				} else { // along v, against the u0 (side 2) or u1 street
					st = side === 2 ? E( 1, i, j ) : E( 1, i + 1, j );
					sgn = side === 2 ? - 1 : 1;
					const a0 = side === 2 ? 0 : nu - depth, a1 = side === 2 ? depth : nu;
					g0 = [ u0 + pu + a0 * CS, v0 + pv + s0 * CS ]; g1 = [ u0 + pu + a1 * CS, v0 + pv + ( s1 + 1 ) * CS ];
					if ( side === 2 ) g0[ 0 ] = u0; else g1[ 0 ] = u1;
					for ( let a = a0 - 1; a <= a1; a ++ ) for ( let b = s0 - 1; b <= s1 + 1; b ++ ) if ( a >= 0 && a < nu && b >= 0 && b < nv ) free[ a * nv + b ] = 0;
				}
				if ( ! st ) continue;
				dA = [ st.dx, st.dz ]; dB = [ - st.dz * sgn, st.dx * sgn ]; // b: from the street into the block (its right is +1)
				const [ cx, cz ] = F.toW( ( g0[ 0 ] + g1[ 0 ] ) / 2, ( g0[ 1 ] + g1[ 1 ] ) / 2 );
				const L = side <= 1 ? g1[ 0 ] - g0[ 0 ] : g1[ 1 ] - g0[ 1 ], Dp = side <= 1 ? g1[ 1 ] - g0[ 1 ] : g1[ 0 ] - g0[ 0 ];
				// the cross aisle (and the driveway) at the end away from the nearer corner... either end: flip a
				const flip = R() < 0.5 ? 1 : - 1;
				const ax = dA[ 0 ] * flip, az = dA[ 1 ] * flip;
				// along the street: where the lot's frontage starts and ends
				const sMid = ( cx - st.ax ) * st.dx + ( cz - st.az ) * st.dz;
				const lot = {
					id: net.lots.length, city: ci, street: st, side: sgn, x: cx, z: cz, ax, az, bx: dB[ 0 ], bz: dB[ 1 ], la: L, lb: Dp,
					kind: c.kind === 'metro' && dc < 0.62 ? 0 : dc < 0.3 || c.kind === 'resort' ? 1 : 2, seed: Math.floor( R() * 65536 ),
				};
				// the driveway: in the cross aisle, kept off the sidewalk's corners
				const sA = st.w / 2 + st.walk + 1.2 + LOT.DRIVE / 2, sB = st.len - st.w / 2 - st.walk - 1.2 - LOT.DRIVE / 2;
				let sd = sMid + flip * ( L / 2 - LOT.CROSS / 2 );
				sd = Math.max( sA, Math.min( sB, sd ) );
				if ( Math.abs( sd - sMid ) > L / 2 - LOT.DRIVE / 2 ) continue;
				lot.drive = [ sd - LOT.DRIVE / 2, sd + LOT.DRIVE / 2 ];
				// the drive's position along the lot's a axis (the shader keeps it free of stalls)
				lot.driveA = L / 2 + flip * ( sd - sMid );
				( st.drives || ( st.drives = [] ) ).push( [ sgn, lot.drive[ 0 ], lot.drive[ 1 ] ] );
				// layout: stall periods from the back, what's left at the front
				const nP = Math.floor( Dp / LOT.PERIOD ), rem = Dp - nP * LOT.PERIOD;
				lot.periods = nP;
				lot.single = rem >= LOT.ROW + LOT.AISLE ? 1 : 0;
				lot.stalls = Math.max( 0, Math.floor( ( L - LOT.CROSS - 0.4 ) / LOT.STALL ) );
				if ( ! lot.stalls || ( ! nP && ! lot.single ) ) { st.drives.pop(); continue; }
				let h0 = Infinity, h1 = - Infinity;
				for ( const [ qa, qb ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ], [ 0, 0 ] ] ) {
					const h = hf.heightAt( cx + ax * qa * L / 2 + lot.bx * qb * Dp / 2, cz + az * qa * L / 2 + lot.bz * qb * Dp / 2 );
					h0 = Math.min( h0, h ); h1 = Math.max( h1, h );
				}
				lot.y = ( h0 + h1 ) / 2;
				net.lots.push( lot );
				const r = Math.hypot( L, Dp ) / 2;
				net.lhash.add( { ax: cx - 0.01, az: cz, bx: cx + 0.01, bz: cz, lot }, r );
			}
		}
	}
}

// the largest free rectangle of the block raster that stands against one of its four sides:
// [ side (0 v-low, 1 v-high, 2 u-low, 3 u-high), first, last (cells along the side), depth (cells) ] or null
function bestLot( free, nu, nv, hs ) {
	const MIN_L = 7, MIN_D = 6, MAX_D = 20; // 17.5 m x 15 m .. 50 m deep (2.5 m cells)
	let best = null, bestA = 0;
	for ( let side = 0; side < 4; side ++ ) {
		const along = side < 2 ? nu : nv, across = side < 2 ? nv : nu;
		const cell = ( s, t ) => side === 0 ? s * nv + t : side === 1 ? s * nv + ( nv - 1 - t ) : side === 2 ? t * nv + s : ( nu - 1 - t ) * nv + s;
		const depth = new Int32Array( along );
		for ( let s = 0; s < along; s ++ ) { let t = 0; while ( t < across && t < MAX_D && free[ cell( s, t ) ] ) t ++; depth[ s ] = t; }
		for ( let s0 = 0; s0 < along; s0 ++ ) {
			let md = MAX_D;
			for ( let s1 = s0; s1 < along; s1 ++ ) {
				md = Math.min( md, depth[ s1 ] );
				if ( md < MIN_D ) break;
				if ( s1 - s0 + 1 < MIN_L ) continue;
				const area = ( s1 - s0 + 1 ) * md;
				if ( area <= bestA ) continue;
				// gentle enough overall (a car park may slope a little)
				let lo = Infinity, hi = - Infinity;
				for ( const s of [ s0, ( s0 + s1 ) >> 1, s1 ] ) for ( const t of [ 0, md >> 1, md - 1 ] ) { const h = hs[ cell( s, t ) ]; lo = Math.min( lo, h ); hi = Math.max( hi, h ); }
				if ( hi - lo > 1.0 + 0.04 * Math.max( s1 - s0 + 1, md ) * 2.5 ) continue;
				bestA = area; best = [ side, s0, s1, md ];
			}
		}
	}
	return best;
}

// inside a building's footprint (the record's rectangle, grown by pad)?
export function inBuilding( net, x, z, pad = 0 ) {
	const l = net.claims?.get( cgk( Math.floor( x / CG ), Math.floor( z / CG ) ) );
	if ( l ) for ( const o of l ) {
		const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = - dx * o.s + dz * o.c;
		if ( Math.abs( lx ) < o.hw + pad && Math.abs( lz ) < o.hd + pad ) return true;
	}
	return false;
}

// the parking lot at a point, or null
export function lotAt( net, x, z, pad = 0 ) {
	let hit = null;
	net.lhash.query( x, z, 4, ( sg ) => {
		const L = sg.lot, dx = x - L.x, dz = z - L.z;
		if ( Math.abs( dx * L.ax + dz * L.az ) < L.la / 2 + pad && Math.abs( dx * L.bx + dz * L.bz ) < L.lb / 2 + pad ) { hit = L; return false; }
	} );
	return hit;
}

// roadblocks, checkpoints, jams, crash sites, highway signs and mile markers along the drawn runs
function buildEvents( net, meta ) {
	const P = [ 0, 0, 0, 0, 0 ];
	const cityNear = ( x, z ) => {
		let best = null, bd = Infinity;
		for ( const c of meta.cities ) { const d = Math.hypot( c.x - x, c.z - z ) / ( c.radius + 250 ); if ( d < bd ) { bd = d; best = c; } }
		return bd < 1.6 ? best : null;
	};
	for ( const r of net.roads ) {
		const rh = hashStr( r.name );
		r.runs.forEach( ( q, qi ) => {
			const L = q.s1 - q.s0;
			if ( r.lanes >= 2 ) {
				// speed limits for traffic leaving each end of the run (Hawaiʻi: 55 on the freeways, 45 on the highways)
				if ( L > 320 ) for ( const dir of [ 1, - 1 ] ) net.regs.push( { road: r, s: ( dir > 0 ? q.s0 : q.s1 ) + dir * 110, side: dir, misc: r.lanes === 4 ? 4 : 3 } );
				// mile markers on the right shoulder of the increasing direction
				for ( let m = Math.ceil( q.s0 / MILE ); m * MILE < q.s1 - 5; m ++ ) {
					if ( m * MILE < q.s0 + 20 ) continue;
					net.markers.push( { road: r, s: m * MILE, n: m % 100 } );
				}
			}
			for ( const end of [ 0, 1 ] ) {
				const type = end ? q.t1 : q.t0;
				if ( ! type || L < 160 ) continue;
				const sEnd = end ? q.s1 : q.s0, dir = end ? - 1 : 1; // dir: travel direction leaving that end into the run
				roadPoint( r, sEnd, P );
				const city = type === 1 ? cityNear( P[ 0 ], P[ 1 ] ) : null;
				const destId = dir > 0 ? r.to : r.from, destName = dir > 0 ? r.toName : r.fromName;
				// a guide sign for traffic leaving this end, and a welcome sign for traffic arriving
				if ( L > 220 ) {
					net.signs.push( { road: r, s: sEnd + dir * 55, side: dir, kind: 'guide', text: destName, route: r.route, dest: destId } );
					if ( city && city.kind !== 'military' && city.kind !== 'airport' ) net.signs.push( { road: r, s: sEnd + dir * 38, side: - dir, kind: 'welcome', text: city.name, route: '' } );
				}
				if ( ! city || L < 420 || r.lanes < 2 ) continue;
				const hq = hh( rh, end, qi );
				let block = null;
				const kinds = city.kind;
				if ( kinds === 'military' ) block = 'checkpoint';
				else if ( kinds === 'metro' ) block = hq < 0.55 ? 'roadblock' : hq < 0.85 ? 'checkpoint' : null;
				else if ( kinds === 'town' || kinds === 'resort' ) block = hq < 0.4 ? 'roadblock' : hq < 0.55 ? 'checkpoint' : null;
				else if ( kinds === 'village' ) block = hq < 0.25 ? 'roadblock' : null;
				else if ( kinds === 'airport' ) block = hq < 0.5 ? 'checkpoint' : null;
				const dBlock = 150 + hh( rh, end, 7 ) * 120;
				if ( block ) net.events.push( { type: block, road: r, s: sEnd + dir * dBlock, dir, city: city.id, seed: hashStr( r.name + block + end ) } );
				// outbound traffic that never made it out
				if ( kinds === 'metro' || kinds === 'town' || kinds === 'resort' ) {
					const jamLen = block ? dBlock - 22 : 90 + hh( rh, end, 9 ) * 220;
					if ( hh( rh, end, 11 ) < ( block ? 0.9 : 0.55 ) ) {
						net.events.push( { type: 'jam', road: r, s: sEnd + dir * 14, s1: sEnd + dir * Math.min( L - 30, 14 + jamLen ), dir, city: city.id, seed: hashStr( r.name + 'jam' + end ), front: ! block } );
					}
				}
			}
			// crash sites along the open road, a couple per ten kilometres
			for ( let s = q.s0 + 300; s < q.s1 - 300; s += 1100 ) {
				const h = hh( rh, Math.floor( s ), qi );
				if ( h < ( r.lanes === 1 ? 0.12 : 0.34 ) ) net.events.push( { type: 'crash', road: r, s: s + h * 700, dir: h < 0.17 ? 1 : - 1, seed: hashStr( r.name + 'crash' + Math.floor( s ) ) } );
			}
		} );
	}
	// military base gates get a checkpoint on the base side of the fence
	for ( const e of net.events ) { roadPoint( e.road, e.s, P ); e.x = P[ 0 ]; e.z = P[ 1 ]; }
	for ( const s of net.signs ) { roadPoint( s.road, s.s, P ); s.x = P[ 0 ]; s.z = P[ 1 ]; }
	for ( const m of net.markers ) { roadPoint( m.road, m.s, P ); m.x = P[ 0 ]; m.z = P[ 1 ]; }
	for ( const g of net.regs ) { roadPoint( g.road, g.s, P ); g.x = P[ 0 ]; g.z = P[ 1 ]; }
	net.signs.forEach( ( s, i ) => { s.id = i; } );
}

// cell index helpers
export const cellOf = ( x ) => Math.floor( x / CELL );
export const inCell = ( x, z, ci, cj ) => Math.floor( x / CELL ) === ci && Math.floor( z / CELL ) === cj;
