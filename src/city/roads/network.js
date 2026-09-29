// The road network, shared by the world workers (meshes, props) and the main thread (queries, spawning).
// Pure JS (no three.js) so a worker can import it. Built deterministically from world.json on both sides:
//   - highways (meta.roads) as Catmull-Rom curves through the baked 6 m knots, split into the "runs" that are
//     actually drawn: a highway disappears where it runs through a city grid (the streets carry it there) or
//     where a higher-class highway already covers the same path (routes share corridors in the bake);
//   - city streets (meta.streets) with their intersection nodes on each city's grid;
//   - runways + a parallel taxiway, military / airport perimeter fences with gates;
//   - the static outbreak "events" along the highways: roadblocks, checkpoints, traffic jams, crashes.

export const CELL = 320; // streaming cell (m)
export const MILE = 1609.34 / 8; // one real mile at the world's 1:8 horizontal scale
export const FLAG_CITY = 32;

// road surface classes (shader: rd.z)
export const RC = { FREEWAY: 0, HIGHWAY: 1, DIRT: 2, STREET: 3, INTER: 4, RUNWAY: 5, TAXIWAY: 6, WALK: 7, APRON: 8 };
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
	const net = {
		meta, hf, cities: meta.cities,
		streets: [], nodes: new Map(), roads: [], runways: [], fences: [], events: [], signs: [], markers: [],
		shash: new SegHash( 48 ), // streets
		rhash: new SegHash( 48 ), // drawn highway runs
		allhash: new SegHash( 64 ), // every highway knot segment, drawn or not
		zones: [], // rectangles no street may cross (runways, taxiways): { x, z, cx, sx, hl, hw }
	};
	buildRunways( net, meta );
	buildStreets( net, meta );
	buildRoads( net, meta, hf );
	buildFences( net, meta );
	buildEvents( net, meta );
	return net;
}

// runway + a parallel taxiway on the side with fewer buildings
function buildRunways( net, meta ) {
	const B = meta.buildings.data;
	for ( let k = 0; k < meta.runways.length; k ++ ) {
		const rw = meta.runways[ k ];
		const cx = Math.cos( rw.angle ), sx = Math.sin( rw.angle );
		// right of the runway direction
		const nx = - sx, nz = cx;
		let side = 1, cnt = [ 0, 0 ];
		for ( let i = 0; i < B.length; i += 11 ) {
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
			const c = meta.cities[ ci ];
			const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
			const u = i * c.pu, v = j * c.pv;
			n = { key, city: ci, i, j, x: c.x + u * ca - v * sa, z: c.z + u * sa + v * ca, arms: 0, w: 0, walk: 0, kind: streetKind( c ),
				ca, sa, streets: [ null, null, null, null ] };
			nodes.set( key, n );
		}
		return n;
	};
	for ( let si = 0; si < meta.streets.length; si ++ ) {
		const [ ci, ax, az, , bx, bz, , w, walk ] = meta.streets[ si ];
		const c = meta.cities[ ci ];
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		const uv = ( x, z ) => [ Math.round( ( ( x - c.x ) * ca + ( z - c.z ) * sa ) / c.pu ), Math.round( ( - ( x - c.x ) * sa + ( z - c.z ) * ca ) / c.pv ) ];
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
		net.streets.push( st );
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
		const c = meta.cities[ ci ];
		const has = ( axis, i, j ) => edges.has( axis + ':' + i + ':' + j );
		// a block exists when all four of its edges do
		const block = ( i, j ) => has( 0, i, j ) && has( 0, i, j + 1 ) && has( 1, i, j ) && has( 1, i + 1, j );
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		const toW = ( u, v ) => [ c.x + u * ca - v * sa, c.z + u * sa + v * ca ];
		const D = c.street / 2 + 6;
		const segs = [];
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
			segs.push( [ ax, az, bx, bz ] );
		}
		// cut gates where highways (drawn or not) and runways cross the line
		for ( const [ ax, az, bx, bz ] of segs ) {
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
			for ( const p of pieces ) net.fences.push( { ax: p[ 0 ], az: p[ 1 ], bx: p[ 2 ], bz: p[ 3 ], city: ci, military: c.kind === 'military' } );
		}
	}
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
	net.signs.forEach( ( s, i ) => { s.id = i; } );
}

// cell index helpers
export const cellOf = ( x ) => Math.floor( x / CELL );
export const inCell = ( x, z, ci, cj ) => Math.floor( x / CELL ) === ci && Math.floor( z / CELL ) === cj;
