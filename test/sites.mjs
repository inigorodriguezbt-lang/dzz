// Outdoor loot sites (src/game/items/Sites.js, src/game/items/sites/*), Node checks: node test/sites.mjs
//   the site_<kind> tables and the stash items; every kind's layout (props that exist, slots, keys, interactions) and
//   its props built into a kit; deterministic placement per cell on a stub world and on the real one (the baked
//   terrain, the road network, its outbreak events), no two sites overlapping; the looted / respawn state; how often
//   each kind turns up; and game.sites itself on a stub game (real Physics, Interact, Actions, Markers, Inventory):
//   streaming and disposal, loot keys, taken items and their respawn, the bodies' loot kept, the F prompts through
//   the real crosshair ray (not hidden by the site's own boxes), salvage, the cash box, digging a stash, a stash
//   note, a supply drop from the sky to expiry, and a save -> load round trip.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { installFakeDom } from './lib/fake-dom.mjs';
// the runtime section builds real site meshes (canvas-drawn atlases)
installFakeDom();

await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, tableIds, compileTable } = await import( '../src/game/items/Loot.js' );
const { KINDS, KIND_LIST, CELL, HELI_CELL, STASH_CELL, rng, hash32 } = await import( '../src/game/items/sites/kinds.js' );
const { planCell, planHeli, planStash, cellsAround, probe, fits } = await import( '../src/game/items/sites/plan.js' );
const { layout, slotKey, tableOf, SLOT_TABLES } = await import( '../src/game/items/sites/layout.js' );
const { SiteState } = await import( '../src/game/items/sites/state.js' );

let fails = 0, passes = 0;
const ok = ( c, msg ) => { if ( c ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// ---- tables and items ----------------------------------------------------------------------------------------------
console.log( 'tables' );
for ( const kind of KIND_LIST ) {
	const name = KINDS[ kind ].table;
	ok( name === 'site_' + kind, `${kind}: table named site_${kind}` );
	const t = LOOT_TABLES[ name ];
	ok( !! t, `${name} defined` );
	if ( ! t ) continue;
	for ( const id of tableIds( t ) ) ok( ITEMS.has( id ), `${name}: ${id} exists` );
	ok( compileTable( t ).entries.length >= 10, `${name}: a varied table (${compileTable( t ).entries.length} entries)` );
	const R = rng( 77 );
	let n = 0, bad = 0;
	for ( let i = 0; i < 300; i ++ ) for ( const s of rollLoot( name, R, 1 ) ) { n ++; const d = getItem( s.id ); if ( ! d || s.qty < 1 || s.qty > d.stack ) bad ++; }
	ok( n > 250 && bad === 0, `${name}: rolls valid stacks (${n}, ${bad} bad)` );
}
ok( !! LOOT_TABLES.site_stash_rich, 'the treasure-map cache table' );
for ( const t of Object.values( SLOT_TABLES ) ) ok( rollLoot( t, rng( 3 ), 1 ).length === 1, 'slot table rolls one item' );
for ( const id of [ 'stash_note', 'treasure_map' ] ) {
	const d = getItem( id );
	ok( d && d.stash === true && d.cat === 'misc' && d.desc.length < 50, `${id}: a stash item` );
}
ok( tableIds( LOOT_TABLES.site_body ).has( 'stash_note' ) && tableIds( LOOT_TABLES.site_hiker ).has( 'treasure_map' ), 'notes and maps turn up on the dead' );
try {
	const { hasModelBuilder } = await import( '../src/render/ItemModels.js' );
	ok( hasModelBuilder( 'sites_note' ) && hasModelBuilder( 'sites_tmap' ), 'stash item models registered' );
} catch ( e ) { console.log( '  (model registry not importable: ' + e.message + ')' ); }
{
	// the Read verb marks the stash through game.sites
	const { USE_PROVIDERS } = await import( '../src/game/items/hooks.js' );
	let read = null;
	const verbs = [];
	const ctx = { add: ( v, run ) => verbs.push( [ v, run ] ), first: ( v, run ) => verbs.push( [ v, run ] ), game: { sites: { readStash: ( s ) => { read = s; } }, toast() {} } };
	const st = { id: 'stash_note', qty: 1, data: {} };
	for ( const f of USE_PROVIDERS ) f( st, getItem( 'stash_note' ), ctx );
	const v = verbs.find( x => x[ 0 ] === 'Read' );
	ok( !! v, 'stash note has a Read verb' );
	v?.[ 1 ]();
	ok( read === st, 'Read asks game.sites to mark it' );
}

// ---- layouts ---------------------------------------------------------------------------------------------------------
console.log( 'layouts' );
let PROPS = null, Kit = null;
try { ( { PROPS } = await import( '../src/game/items/sites/props.js' ) ); ( { Kit } = await import( '../src/game/items/sites/kit.js' ) ); } catch ( e ) { console.log( '  (props not importable: ' + e.message + ')' ); }
const ACTS = [ 'light_fire', 'salvage', 'cut_chute', 'cash_box', 'dig' ];
const DECALS = [ 'blood_pool', 'blood_drag', 'ash', 'scorch', 'soil', 'oil', 'papers', 'glass', 'skid', 'hole' ];
for ( const kind of KIND_LIST ) {
	let slots = 0, props = 0, badProp = 0, badSlot = 0, badDecal = 0, badAct = 0, tris = 0, boxes = 0, badBox = 0;
	for ( let seed = 1; seed <= 40; seed ++ ) {
		for ( const extra of [ {}, { ro: 6, rw: 7.5 }, { ev: { checkpoint: 'roadblock', military_checkpoint: 'checkpoint', crash_car: 'crash', roadside: 'jam' }[ kind ], hw: 4, sd: seed % 2 ? 1 : - 1 }, { dug: true, rich: seed % 3 === 0 } ] ) {
			const site = { kind, key: 'site:1:2:0', seed: hash32( seed, 9 ), x: 0, z: 0, yaw: 0, ...extra };
			const L = layout( site );
			const again = layout( site );
			if ( JSON.stringify( L ) !== JSON.stringify( again ) ) badSlot ++;
			slots += L.slots.length; props += L.props.length;
			for ( const p of L.props ) if ( PROPS && ! PROPS[ p.t ] ) badProp ++;
			for ( const s of L.slots ) {
				if ( ! Number.isFinite( s.x + s.z + s.h ) || ! ( s.p > 0 && s.p <= 1 ) || Math.hypot( s.x, s.z ) > 20 ) badSlot ++;
				const t = tableOf( site, s );
				if ( ! ( typeof t === 'string' ? LOOT_TABLES[ t ] : t?.items ) ) badSlot ++;
			}
			for ( const d of L.decals ) if ( ! DECALS.includes( d.d ) || ! ( d.s > 0 ) ) badDecal ++;
			for ( const a of L.acts ) if ( ! ACTS.includes( a.act ) ) badAct ++;
			if ( PROPS && Kit && seed <= 6 ) {
				const k = new Kit();
				const R = rng( seed );
				for ( const p of L.props ) { k.push( [ p.x, p.dy || 0, p.z ], [ 0, p.yaw || 0, 0 ] ); try { PROPS[ p.t ]( k, p, R ); } catch ( e ) { badProp ++; console.error( '   ', kind, p.t, e.message ); } k.pop(); }
				for ( const parts of k.groups.values() ) for ( const q of parts ) tris += ( q.g.index ? q.g.index.count : q.g.attributes.position.count ) / 3;
				for ( const b of k.boxes ) { boxes ++; if ( ! [ b.x, b.y, b.z, b.hx, b.hy, b.hz, b.yaw ].every( Number.isFinite ) || b.hx <= 0 || b.hy <= 0 || b.hz <= 0 ) badBox ++; }
			}
		}
	}
	ok( badProp === 0 && badSlot === 0 && badDecal === 0 && badAct === 0 && badBox === 0, `${kind}: layouts valid (props ${badProp}, slots ${badSlot}, decals ${badDecal}, acts ${badAct}, boxes ${badBox} bad)` );
	ok( slots / 160 >= 1 || kind === 'stash', `${kind}: has loot slots (${( slots / 160 ).toFixed( 1 )} per site)` );
	ok( props > 0 || kind === 'body' || kind === 'hiker', `${kind}: has props` );
	if ( PROPS ) console.log( `   ${kind.padEnd( 20 )} ${( props / 160 ).toFixed( 1 )} props, ${( slots / 160 ).toFixed( 1 )} slots, ~${Math.round( tris / 24 )} tris, ${( boxes / 24 ).toFixed( 1 )} colliders` );
}
ok( layout( { kind: 'stash', key: 'stash:1:1', seed: 5 } ).acts.some( a => a.act === 'dig' ), 'a buried stash can be dug' );
ok( layout( { kind: 'stash', key: 'stash:1:1', seed: 5, dug: true } ).slots.length >= 5, 'a dug stash lies open with its cache' );
ok( layout( { kind: 'stash', key: 'stash:1:1', seed: 5, dug: true, rich: true } ).slots.every( s => s.table === 'site_stash_rich' ), 'a treasure-map cache rolls the rich table' );
ok( slotKey( { key: 'site:3:-4:0' }, 2 ) === 'site:3:-4:0:2', 'slot keys: site key and index' );

// ---- state: taken, respawn, persistence -------------------------------------------------------------------------------
console.log( 'state' );
{
	const S = new SiteState();
	ok( S.gen( 'site:1:1:0:0', 100, 72 ) === 0, 'untouched: generation 0' );
	S.take( 'site:1:1:0:0', 100 );
	ok( S.gen( 'site:1:1:0:0', 150, 72 ) === - 1, 'taken: gone until it respawns' );
	const g1 = S.gen( 'site:1:1:0:0', 172.5, 72 );
	ok( g1 >= 1, 'respawned after the kind\'s time with a new generation (' + g1 + ')' );
	S.take( 'site:1:1:0:0', 180 );
	ok( S.gen( 'site:1:1:0:0', 260, 72 ) > g1, 'taken again: a later generation' );
	ok( S.gen( 'stash:1:1:0', 1e6, Infinity ) === 0 && ( S.take( 'stash:1:1:0', 5 ), S.gen( 'stash:1:1:0', 1e6, Infinity ) ) === - 1, 'a stash never refills' );
	S.use( 'site:1:1:0:salvage', 10 );
	ok( ! S.usable( 'site:1:1:0:salvage', 50, 240 ) && S.usable( 'site:1:1:0:salvage', 260, 240 ), 'interactions come back after their time' );
	S.dig( 'stash:2:2', 12 );
	const S2 = new SiteState();
	S2.load( JSON.parse( JSON.stringify( S.serialize( 300 ) ) ) );
	ok( S2.isDug( 'stash:2:2' ) && S2.taken.has( 'stash:1:1:0' ) && S2.used.has( 'site:1:1:0:salvage' ), 'state survives a save' );
	ok( ! S2.taken.has( 'site:1:1:0:0' ) || S2.taken.get( 'site:1:1:0:0' ) === 180, 'old respawned takes are pruned or kept' );
	S2.load( { taken: { a: 'x', b: 3 } } );
	ok( S2.taken.size === 1, 'a corrupt entry is dropped' );
	const S4 = new SiteState();
	S4.use( 'site:1:1:0:b0', 10 ); S4.use( 'site:1:1:0:light_fire', 10 ); S4.use( 'site:1:1:0:b1', 290 );
	const w4 = S4.serialize( 300 );
	ok( ! w4.used[ 'site:1:1:0:b0' ] && w4.used[ 'site:1:1:0:light_fire' ] === 10 && w4.used[ 'site:1:1:0:b1' ] === 290, 'old body searches are pruned, one-off uses kept' );
}

// ---- placement on a stub world ------------------------------------------------------------------------------------------
console.log( 'placement (stub)' );
{
	// gentle hills, a sea to the south, a road along z = 40, a town at the origin
	const stub = ( seed ) => ( {
		seed,
		height: ( x, z ) => 3 + Math.sin( x * 0.01 ) * 2 - Math.max( 0, z - 300 ) * 0.05,
		base: ( x, z ) => 3 + Math.sin( x * 0.01 ) * 2 - Math.max( 0, z - 300 ) * 0.05,
		flags: () => 0, surface: ( x ) => [ x > 0 ? 0.6 : 0.2, 0, 0, 0 ],
		road: ( x, z, d ) => Math.abs( z - 40 ) < d ? { x, z: 40, dx: 1, dz: 0, dist: Math.abs( z - 40 ), lanes: 2, width: 8, kind: 'highway' } : null,
		building: ( x, z, m ) => Math.abs( x ) < 20 + m && Math.abs( z + 200 ) < 20 + m,
		lot: () => false, cities: [ { x: 0, z: - 200, radius: 150, kind: 'town' } ], events: () => [],
	} );
	const A = stub( 1234 ), B = stub( 1234 ), C = stub( 999 );
	let same = true, diff = 0, total = 0;
	const kinds = {};
	for ( let i = - 20; i < 20; i ++ ) for ( let j = - 6; j < 6; j ++ ) {
		const a = planCell( A, i, j ), b = planCell( B, i, j ), c = planCell( C, i, j );
		if ( JSON.stringify( a ) !== JSON.stringify( b ) ) same = false;
		if ( JSON.stringify( a ) !== JSON.stringify( c ) ) diff ++;
		total += a.length;
		for ( const s of a ) {
			kinds[ s.kind ] = ( kinds[ s.kind ] || 0 ) + 1;
			ok( s.key === `site:${i}:${j}:${a.indexOf( s )}` && KINDS[ s.kind ] && Number.isFinite( s.x + s.z + s.yaw ) && s.seed >>> 0 === s.seed, 'site record ' + s.key );
			ok( ! A.building( s.x, s.z, 0 ), 'not inside a building ' + s.key );
		}
	}
	ok( same, 'the same seed plans the same sites' );
	ok( diff > 30, 'another seed plans other sites (' + diff + ' cells differ)' );
	ok( total > 40, 'a stub world gets sites (' + total + ': ' + JSON.stringify( kinds ) + ')' );
	ok( cellsAround( 0, 0, 150 ).every( ( c, i, a ) => i === 0 || c[ 2 ] >= a[ i - 1 ][ 2 ] ), 'cells come nearest first' );
}

// ---- the real world ---------------------------------------------------------------------------------------------------------
console.log( 'placement (world)' );
{
	const { HeightField } = await import( '../src/world/HeightField.js' );
	const { buildNetwork, nearestOnNetwork, inBuilding, lotAt, roadPoint, hh } = await import( '../src/city/roads/network.js' );
	const meta = JSON.parse( readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
	const buf = gunzipSync( readFileSync( new URL( '../public/data/terrain.bin.gz', import.meta.url ) ) );
	const hf = new HeightField( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ), meta );
	const world = { cities: meta.cities, roads: meta.roads, streets: meta.streets, runways: meta.runways, buildings: meta.buildings };
	const net = buildNetwork( world, hf );
	const evs = new Map();
	const P = [ 0, 0, 0, 0, 0 ];
	for ( const e of net.events ) {
		roadPoint( e.road, e.s, P );
		const dir = e.dir || 1;
		const r = { type: e.type, x: P[ 0 ], z: P[ 1 ], tx: P[ 2 ] * dir, tz: P[ 3 ] * dir, hw: e.road.hw, sd: ( hh( e.seed, 1 ) < 0.5 ? 1 : - 1 ) * dir };
		const k = Math.floor( r.x / CELL ) + ':' + Math.floor( r.z / CELL );
		( evs.get( k ) || evs.set( k, [] ).get( k ) ).push( r );
	}
	const s4 = [ 0, 0, 0, 0 ];
	const env = {
		seed: 1234567,
		height: ( x, z ) => hf.heightAt( x, z ), base: ( x, z ) => hf.baseHeight( x, z ), flags: ( x, z ) => hf.flagsNear( x, z ),
		surface: ( x, z ) => hf.surfaceAt( x, z, s4 ),
		road: ( x, z, d ) => nearestOnNetwork( net, x, z, d ),
		building: ( x, z, m ) => inBuilding( net, x, z, m ), lot: ( x, z ) => !! lotAt( net, x, z, 1 ),
		cities: meta.cities, events: ( i, j ) => evs.get( i + ':' + j ) || [],
	};
	// Oʻahu's south shore: Honolulu, Waikīkī, the H-1, the beaches
	const t0 = performance.now();
	const kinds = {}, classes = {};
	let cells = 0, sites = 0, inWater = 0, onBld = 0, ev = 0;
	const placed = [];
	for ( let i = Math.floor( - 6400 / CELL ); i < Math.floor( - 2400 / CELL ); i ++ ) for ( let j = Math.floor( - 10800 / CELL ); j < Math.floor( - 9300 / CELL ); j ++ ) {
		const a = planCell( env, i, j );
		cells ++;
		for ( const s of a ) {
			sites ++;
			placed.push( s );
			kinds[ s.kind ] = ( kinds[ s.kind ] || 0 ) + 1;
			classes[ s.cls ] = ( classes[ s.cls ] || 0 ) + 1;
			if ( s.ev ) ev ++;
			if ( ! s.ev && hf.heightAt( s.x, s.z ) < 0.4 ) inWater ++;
			if ( ! s.ev && inBuilding( net, s.x, s.z, 0 ) ) onBld ++;
		}
	}
	const ms = ( performance.now() - t0 ) / cells;
	console.log( `   ${cells} cells in ${( ms * cells ).toFixed( 0 )} ms (${ms.toFixed( 2 )} ms each): ${sites} sites, ${ev} on road events` );
	console.log( '   kinds', JSON.stringify( kinds ) );
	console.log( '   classes', JSON.stringify( classes ) );
	ok( ms < 3, 'planning a cell is cheap (' + ms.toFixed( 2 ) + ' ms)' );
	ok( inWater === 0, 'no site in the sea (' + inWater + ')' );
	ok( onBld === 0, 'no site inside a building (' + onBld + ')' );
	ok( ev > 0, 'the roads\' events carry loot' );
	// no two sites in each other's way, across cell borders too (a road scene counts as 14 m)
	{
		const { FOOT } = await import( '../src/game/items/sites/plan.js' );
		let clash = 0;
		for ( let a = 0; a < placed.length; a ++ ) for ( let b = a + 1; b < placed.length; b ++ ) {
			const A = placed[ a ], B = placed[ b ];
			if ( Math.hypot( A.x - B.x, A.z - B.z ) < ( A.ev ? 14 : FOOT[ A.kind ] ) + ( B.ev ? 14 : FOOT[ B.kind ] ) ) { clash ++; console.error( '   ', A.key, A.kind, B.key, B.kind ); }
		}
		ok( clash === 0, 'no two sites overlap (' + clash + ')' );
	}
	ok( sites / cells > 0.08 && sites / cells < 0.6, 'sites per cell in range (' + ( sites / cells ).toFixed( 2 ) + ')' );
	ok( ( kinds.roadside || 0 ) > ( kinds.fema_camp || 0 ), 'common kinds outnumber the big camps' );
	// along a road: a find every few hundred metres
	for ( const [ name, x0, z0, x1, z1 ] of [ [ 'H-1 / Nimitz', - 6600, - 10600, - 4400, - 10400 ], [ 'Kalanianaʻole', - 2800, - 10050, - 1300, - 10000 ] ] ) {
		let n = 0, len = 0, last = null;
		const seen = new Set();
		for ( let t = 0; t <= 1; t += 0.002 ) {
			const x = x0 + ( x1 - x0 ) * t, z = z0 + ( z1 - z0 ) * t;
			const r = nearestOnNetwork( net, x, z, 200 );
			if ( ! r ) continue;
			if ( last ) len += Math.hypot( r.x - last[ 0 ], r.z - last[ 1 ] );
			last = [ r.x, r.z ];
			for ( const [ i, j ] of cellsAround( r.x, r.z, 40 ) ) for ( const s of planCell( env, i, j ) ) if ( Math.hypot( s.x - r.x, s.z - r.z ) < 40 && ! seen.has( s.key ) ) { seen.add( s.key ); n ++; }
		}
		console.log( `   along ${name}: ${n} sites in ${( len / 1000 ).toFixed( 1 )} km (one per ${Math.round( len / Math.max( 1, n ) )} m)` );
		ok( n > 0 && len / n < 900, `${name}: something every few hundred metres` );
	}
	// rare grids
	let helis = 0, heliCells = 0, stashes = 0, rich = 0, stashCells = 0;
	for ( let I = - 19; I < 19; I ++ ) for ( let J = - 13; J < 13; J ++ ) { heliCells ++; const h = planHeli( env, I, J ); if ( h ) { helis ++; ok( h.key === `heli:${I}:${J}` && hf.heightAt( h.x, h.z ) > 3, 'heli crash on land ' + h.key ); } }
	for ( let I = - 17; I < - 6; I ++ ) for ( let J = - 29; J < - 24; J ++ ) { stashCells ++; const s = planStash( env, I, J ); if ( s ) { stashes ++; if ( s.rich ) rich ++; ok( hf.heightAt( s.x, s.z ) > 0.6, 'stash on land ' + s.key ); } }
	console.log( `   ${helis} helicopter crashes across the islands, ${stashes} stashes in ${stashCells} coarse cells on Oʻahu (${rich} rich)` );
	ok( helis >= 10 && helis < 200, 'helicopter crashes are rare but out there (' + helis + ')' );
	ok( stashes > 0, 'stashes to find' );
	ok( JSON.stringify( planHeli( env, - 4, - 6 ) ) === JSON.stringify( planHeli( { ...env }, - 4, - 6 ) ), 'heli placement is deterministic' );
	// props and loot stand on a sidewalk's top (20 cm up), not in it
	{
		const { Sites } = await import( '../src/game/items/Sites.js' );
		const lift = ( x, z ) => Sites.prototype.lift.call( { game: { hf, roads: { net, lotAt: ( a, b ) => lotAt( net, a, b ) } } }, x, z );
		let walks = 0, good = 0;
		for ( const st of net.streets ) {
			if ( ! st.walk || st.len < 40 || walks >= 200 ) continue;
			walks ++;
			const at = ( u, v ) => [ st.ax + st.dx * u - st.dz * v, st.az + st.dz * u + st.dx * v ];
			const mid = st.len / 2, hw = st.w / 2;
			const onWalk = lift( ...at( mid, hw + st.walk / 2 ) ), onWalk2 = lift( ...at( mid, - hw - st.walk / 2 ) ), onRoad = lift( ...at( mid, hw * 0.5 ) );
			if ( onWalk === 0.2 && onWalk2 === 0.2 && onRoad > 0 && onRoad < 0.1 ) good ++;
		}
		ok( walks > 50 && good === walks, `sidewalk tops on both sides of ${walks} streets, the roadway lower (${good} right)` );
	}
	void fits; void probe; void HELI_CELL; void STASH_CELL;
}

// ---- game.sites on a stub game ------------------------------------------------------------------------------------------
console.log( 'runtime' );
{
	const THREE = await import( 'three' );
	const { Sites } = await import( '../src/game/items/Sites.js' );
	const { makeStack } = await import( '../src/game/items/ItemDB.js' );
	const { Physics } = await import( '../src/game/Physics.js' );
	const { Interact } = await import( '../src/game/Interact.js' );
	const { Actions } = await import( '../src/game/Actions.js' );
	const { Markers } = await import( '../src/game/Markers.js' );
	const { Events } = await import( '../src/core/Events.js' );
	const { PlayerInventory } = await import( '../src/game/Inventory.js' );
	// flat moist ground at 5 m, no sea, no roads or towns: the fine cells plan campsites, hikers and bodies
	const H = 5;
	const hf = {
		heightAt: () => H, baseHeight: () => H, flagsNear: () => 0, surfaceAt: () => [ 0.5, 0, 0, 0 ], normalAt: ( x, z, o ) => o.set( 0, 1, 0 ),
		raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { const t = dy < 0 ? ( oy - H ) / - dy : - 1; return t >= 0 && t <= maxT ? t : - 1; },
	};
	// the world items as WorldItems keeps them: spawn, remove( { taken } ) firing the taken listeners
	const items3d = {
		items: new Set(), listeners: new Set(),
		spawn( stack, pos, o = {} ) { const it = { stack, pos: pos.clone(), key: o.key ?? null, persistent: !! o.persistent }; this.items.add( it ); return it; },
		remove( it, { taken = false } = {} ) { if ( ! this.items.delete( it ) ) return false; if ( taken ) for ( const f of this.listeners ) f( it, it.stack ); return true; },
		addTakenListener( f ) { this.listeners.add( f ); return () => this.listeners.delete( f ); },
	};
	const toasts = [], noises = [], bodies = [], fires = [];
	const game = {
		seed: 4242, mode: 'survival', time: { hours: 100 }, dead: false, inputActive: true,
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), hf, physics: new Physics( hf, null ), events: new Events(),
		audio: { play() { return null; } }, input: { pressed: () => false, is: () => false },
		world: { meta: { cities: [] }, sky: { night: 0 } },
		player: { pos: new THREE.Vector3( 0, H, 0 ), inventory: new PlayerInventory(), vehicle: null },
		entities: { remove( e ) { e.removed = true; } },
		toast: ( t ) => toasts.push( t ), register() {},
		// as Game.give: whole stacks until n are given
		give( id, n = 1 ) { for ( let left = n; left > 0; ) { const st = makeStack( id, left ); if ( ! st ) return false; left -= st.qty; this.player.inventory.add( st ); } return true; },
		items3d,
		zombies: { spawn: ( kind, pos, o ) => { const z = { kind, pos: pos.clone(), o, T: { loot: 'zombie_civilian' }, corpseT: 0 }; bodies.push( z ); return z; } },
		crafting: { placeFire: ( k, pos, o ) => { const f = { k, pos, o }; fires.push( f ); return f; }, fireSource: () => game.player.inventory.find( ( s, d ) => d?.tool?.kind === 'lighter' ), lightFire: ( f ) => { f.lit = true; } },
	};
	game.events.on( 'noise', ( e ) => noises.push( e ) );
	game.interact = new Interact( game );
	game.actions = new Actions( game );
	game.markers = new Markers( game );
	const inv = game.player.inventory;
	inv.equip.back = makeStack( 'backpack_military', 1 );
	const S = new Sites( game );
	const finish = () => game.actions.update( 999 );
	const frames = ( n, dt = 0.05 ) => { for ( let i = 0; i < n; i ++ ) S.update( dt ); };
	// stand somewhere and look at a point (the crosshair ray), then let the interaction system pick
	const look = ( from, to ) => {
		game.player.pos.set( from.x, H, from.z );
		game.camera.position.set( from.x, H + 1.66, from.z );
		game.camera.lookAt( to );
		game.camera.updateMatrixWorld();
		S.lastScan.set( 1e9, 0, 0 );
		frames( 2 );
		game.interact.update( 0.016 );
		return game.interact.target;
	};
	const away = new THREE.Vector3( 0, H, 0 );

	// streaming: what is planned near the camera is built, and dropped (boxes and geometry) far away
	game.camera.position.set( 0, H + 1.7, 0 );
	frames( 80 );
	const near0 = S.near( game.camera.position, 230 ).filter( s => s.kind !== 'heli_crash' );
	ok( near0.length > 0 && near0.every( s => S.active.has( s.key ) ), `planned sites near the camera are built (${near0.length})` );
	const boxes0 = game.physics.boxes.size, built0 = S.active.size;
	ok( S.stats().draws > 0 && S.stats().tris > 0, 'built sites draw merged meshes: ' + JSON.stringify( S.stats() ) );
	let disposed = 0;
	const geos = [];
	for ( const A of S.active.values() ) for ( const m of A.group.children ) { geos.push( m.geometry ); m.geometry.addEventListener( 'dispose', () => disposed ++ ); }
	game.camera.position.set( 20000, H + 1.7, 20000 );
	frames( 4 );
	ok( ! [ ...S.active.keys() ].some( k => near0.some( s => s.key === k ) ), 'sites far behind are dropped' );
	ok( disposed === geos.length && game.physics.boxes.size <= boxes0 - 0 && S.group.children.length === S.active.size, `their geometry is disposed (${disposed}/${geos.length}) and boxes removed` );
	void built0;
	game.camera.position.set( 0, H + 1.7, 0 );
	frames( 80 );
	// big sites build a few props a frame: a half-built one is finished later, or dropped when out of range
	{
		const fp0 = new THREE.Vector3( 900, H, 900 );
		game.camera.position.set( fp0.x, H + 1.7, fp0.z );
		const s0 = { kind: 'fema_camp', key: 'test:fema', x: fp0.x, z: fp0.z, yaw: 0, seed: 99 };
		S.extra.set( s0.key, s0 );
		S.job = S._job( s0 );
		ok( S._step( S.job, 0 ) === false && S.job.i === 1, 'a job stops when its time is up' );
		S._scan( game.camera.position );
		for ( let i = 0; i < 200 && ! S.active.has( s0.key ); i ++ ) S._build();
		ok( S.active.has( s0.key ) && ! S.job && S.active.get( s0.key ).group.children.length > 0, 'and is finished over later frames' );
		S._unbuild( S.active.get( s0.key ) );
		S.job = S._job( s0 );
		S._step( S.job, 0 );
		game.camera.position.set( - 9000, H + 1.7, - 9000 );
		S.extra.delete( s0.key );
		S._scan( game.camera.position );
		ok( S.job === null && ! S.active.has( s0.key ), 'a half-built site out of range is dropped' );
		ok( S.group.children.length === S.active.size, 'no stray meshes' );
		// the merge a few parts a call gives the same meshes as one go
		const merged = ( stepwise ) => {
			const J = S._job( { ...s0, key: 'test:m' } );
			S._step( J, Infinity );
			S._merge( J );
			let calls = 1;
			if ( stepwise ) while ( ! J.k.step( 0 ) ) calls ++; else J.k.step( Infinity );
			const { group } = J.k.end();
			return { calls, meshes: group.children.map( m => [ m.name, Array.from( m.geometry.attributes.position.array ), Array.from( m.geometry.index.array ) ] ) };
		};
		const one = merged( false ), many = merged( true );
		ok( many.calls > 5 && JSON.stringify( one.meshes ) === JSON.stringify( many.meshes ), `a camp merges over ${many.calls} calls into the same meshes` );
		game.camera.position.set( 0, H + 1.7, 0 );
		frames( 80 );
	}

	// a body: loot slots around it as world items with stable keys, the dead laid down by the creatures module
	const bodyAt = new THREE.Vector3( 3000, H, 3000 );
	game.player.pos.copy( bodyAt ); game.camera.position.set( bodyAt.x, H + 1.7, bodyAt.z );
	const bs = S.debugPlace( 'body', bodyAt.clone().setX( bodyAt.x + 3 ), { seed: 7 } );
	const BA = S.active.get( bs.key );
	ok( BA && BA.items.length > 0 && BA.items.every( it => it.key.startsWith( bs.key + ':' ) && ! it.persistent ), `a body's loot lies on the ground, keyed by slot (${BA?.items.map( i => i.key )})` );
	const zb = BA.bodies[ 0 ];
	ok( zb && zb.o.victim && typeof zb.lootItems === 'function', 'the dead is a creatures body' );
	const loot1 = zb.lootItems();
	ok( Array.isArray( loot1 ) && zb.lootItems() === loot1, 'searching it twice finds the same things' );
	S._clearItems( BA ); S._spawnItems( BA );
	const zb2 = BA.bodies[ 0 ];
	ok( zb.removed && zb2 && zb2 !== zb && zb2.lootItems() === loot1, 'shown again later, it still carries what was left (no fresh roll)' );
	// taking an item: recorded, gone when the site is shown again, back after the kind's respawn rolled anew
	const taken = BA.items[ 0 ];
	items3d.remove( taken, { taken: true } );
	ok( S.state.taken.get( taken.key ) === game.time.hours, 'a taken item is recorded with the hour' );
	S._clearItems( BA ); S._spawnItems( BA );
	ok( ! BA.items.some( it => it.key === taken.key ), 'it stays gone' );
	game.time.hours += KINDS.body.respawn + 1;
	S._clearItems( BA ); S._spawnItems( BA );
	const bodyGen = S.state.gen( taken.key, game.time.hours, KINDS.body.respawn );
	ok( bodyGen >= 1, 'after the respawn time its slot rolls again (generation ' + bodyGen + ')' );
	ok( BA.bodies[ 0 ].lootItems() !== loot1, 'and the body has been restocked too' );

	// the helicopter: Salvage through the real crosshair ray from the nose (the hull's boxes must not hide it)
	const hp = new THREE.Vector3( 4000, H, 4000 );
	const hs = S.debugPlace( 'heli_crash', hp, { yaw: 0, seed: 11 } );
	const HA = S.active.get( hs.key );
	const sc = HA.acts[ 0 ].c;
	let t = look( new THREE.Vector3( hp.x + 6.6, H, hp.z ), sc );
	ok( t?.label === 'Salvage' && t.sub === 'Need a crowbar or toolbox', 'Salvage prompt at the nose (the hull\'s own boxes don\'t hide it): ' + ( t?.label || 'none' ) );
	t = look( new THREE.Vector3( hp.x - 7.4, H, hp.z ), new THREE.Vector3( hp.x - 4.5, H + 1.2, hp.z ) );
	ok( t?.label === 'Salvage', 'at the tail stump: ' + ( t?.label || 'none' ) );
	t = look( new THREE.Vector3( hp.x - 1, H, hp.z + 3.2 ), sc );
	ok( t?.label === 'Salvage', 'and from the side' );
	t = look( new THREE.Vector3( hp.x - 1, H, hp.z + 3.2 ), new THREE.Vector3( hp.x - 1, H + 1.66, hp.z + 20 ) );
	ok( t?.label !== 'Salvage', 'not when looking away' );
	t = look( new THREE.Vector3( hp.x - 1, H, hp.z + 3.2 ), sc );
	t.action();
	ok( toasts.at( - 1 ) === 'Need a crowbar or toolbox' && ! game.actions.busy, 'no tool: refused' );
	inv.add( makeStack( 'crowbar', 1 ), { autoEquip: false } );
	t = look( new THREE.Vector3( hp.x - 1, H, hp.z + 3.2 ), sc );
	t.action(); finish();
	ok( inv.count( 'scrap_metal' ) >= 2 && inv.count( 'wire' ) >= 1 && noises.some( n => n.radius === 30 ), `salvaged parts, and it was loud (${inv.count( 'scrap_metal' )} scrap)` );
	t = look( new THREE.Vector3( hp.x - 1, H, hp.z + 3.2 ), sc );
	ok( t?.label !== 'Salvage', 'salvaged once: the prompt is gone' );
	ok( Math.abs( sc.y - ( H + HA.acts[ 0 ].a.h ) ) < 1e-6, 'the shared F spot was not moved by its use' );
	ok( S.beacons.some( b => b.s === hs ), 'the wreck smokes (a beacon)' );
	const found = S.find( 'heli_crash', hp, 50 );
	ok( ! found || Math.hypot( found.x - hp.x, found.z - hp.z ) <= 50, 'find() keeps to maxR for helicopters too' );

	// the farm stand's honesty box, behind its counter
	const fp = new THREE.Vector3( 5000, H, 5000 );
	const fs = S.debugPlace( 'farm_stand', fp, { yaw: 0, seed: 3 } );
	const FA = S.active.get( fs.key );
	const fc = FA.acts[ 0 ].c;
	t = look( new THREE.Vector3( fc.x + 0.3, H, fc.z + 2.2 ), fc );
	ok( t?.label === 'Break open' && t.sub === 'Cash box', 'Break open the cash box (a crowbar in the bag): ' + ( t?.label || 'none' ) );
	t.action(); finish();
	ok( inv.count( 'cash' ) > 0 && /^\$\d+$/.test( toasts.at( - 1 ) ), 'cash from the box: ' + toasts.at( - 1 ) );

	// a campsite's fire pit becomes a campfire
	const cp = new THREE.Vector3( 6000, H, 6000 );
	const cs = S.debugPlace( 'campsite', cp, { yaw: 0, seed: 5 } );
	const CA = S.active.get( cs.key );
	const cc = CA.acts[ 0 ].c;
	t = look( new THREE.Vector3( cc.x, H, cc.z + 2.4 ), cc );
	ok( t?.label === 'Light fire' && t.sub === 'Need a lighter or matches', 'Light fire prompt at the pit' );
	inv.add( makeStack( 'lighter', 1 ), { autoEquip: false } );
	t = look( new THREE.Vector3( cc.x, H, cc.z + 2.4 ), cc );
	t.action();
	ok( fires.length === 1 && fires[ 0 ].lit && Math.abs( fires[ 0 ].pos.y - H ) < 1e-6 && Math.abs( cc.y - ( H + 0.2 ) ) < 1e-6, 'a campfire on the pit, lit' );
	t = look( new THREE.Vector3( cc.x, H, cc.z + 2.4 ), cc );
	ok( t?.label !== 'Light fire', 'once' );

	// a buried stash from the coarse grid: dig it up with a shovel; it is saved as dug
	const st = S.find( 'stash', away, 3000 );
	ok( !! st && st.key.startsWith( 'stash:' ), 'a stash planned nearby: ' + st?.key );
	game.player.pos.set( st.x, H, st.z + 2 ); game.camera.position.set( st.x, H + 1.7, st.z + 2 );
	S.lastScan.set( 1e9, 0, 0 ); frames( 30 );
	const SA = S.active.get( st.key );
	ok( SA && SA.items.length === 0 && SA.acts.some( w => w.a.act === 'dig' ), 'buried: nothing to see but the cairn, and a Dig spot' );
	t = look( new THREE.Vector3( st.x, H, st.z + 2 ), SA.acts[ 0 ].c );
	ok( t?.label === 'Dig' && t.sub === 'Need a shovel', 'Dig needs a shovel' );
	inv.add( makeStack( 'shovel', 1 ), { autoEquip: false } );
	t = look( new THREE.Vector3( st.x, H, st.z + 2 ), SA.acts[ 0 ].c );
	t.action(); finish();
	const SB = S.active.get( st.key );
	ok( S.state.isDug( st.key ) && SB !== SA && SB.items.length >= 1 && toasts.at( - 1 ).startsWith( 'Found a' ), `dug up: ${SB.items.length} items around the hole (${toasts.at( - 1 )})` );
	ok( S.find( 'stash', away, 3000 )?.key !== st.key, 'a dug stash is not found again' );

	// a stash note marks a stash (fixed in the note), the second read the same one
	const note = makeStack( 'stash_note', 1 );
	game.player.pos.copy( away );
	const tgt = S.readStash( note );
	ok( tgt && note.data.site?.key === tgt.key && ! S.state.isDug( tgt.key ), 'a stash note picks a stash: ' + tgt?.key );
	ok( game.markers.list().some( m => m.kind === 'site' && m.label === 'Stash' && m.site === tgt.key ), 'and marks it on the map' );
	ok( /^Marked: [\d.]+ k?m [NESW]{1,2}$/.test( toasts.at( - 1 ) ), 'toast: ' + toasts.at( - 1 ) );
	ok( S.readStash( note )?.key === tgt.key, 'read again: the same stash' );

	// reveal: a marker on the nearest site of a kind
	const rv = S.reveal( 'campsite', away, 3000 );
	ok( rv && game.markers.list().some( m => m.site === rv.key && m.label === 'Campsite' ), 'reveal( campsite ) marks one' );

	// a supply drop: falls, lands with a thud, carries loot, loses its marker when picked clean, expires
	game.player.pos.set( 8000, H, 8000 ); game.camera.position.set( 8000, H + 1.7, 8000 );
	const drop = S.supplyDrop( new THREE.Vector3( 8010, H, 8000 ), { alt: 3 } );
	ok( drop && ! drop.landed && toasts.at( - 1 ) === 'Supply drop' && game.markers.list().some( m => m.site === drop.key ), 'a supply drop is announced and marked' );
	frames( 40 );
	ok( drop.landed && noises.some( n => n.source === 'supply_drop' ), 'it lands with a noise the infected hear' );
	S.lastScan.set( 1e9, 0, 0 ); frames( 20 );
	const DA = S.active.get( drop.key );
	ok( DA && DA.items.length >= 3 && DA.items.every( it => it.key.startsWith( drop.key + ':' ) ), `its crate's loot lies there (${DA?.items.length})` );
	const chute = DA.acts.find( w => w.a.act === 'cut_chute' );
	inv.add( makeStack( 'kitchen_knife', 1 ), { autoEquip: false } );
	t = look( new THREE.Vector3( chute.c.x + 2.5, H, chute.c.z ), chute.c );
	ok( t?.label === 'Cut parachute' && t.sub === 'Tarp and rope', 'Cut parachute with a blade' );
	t.action(); finish();
	ok( inv.count( 'tarp' ) >= 2 && inv.count( 'rope' ) >= 3, 'tarps and rope from the canopy' );
	for ( const it of [ ...DA.items ] ) items3d.remove( it, { taken: true } );
	ok( ! game.markers.list().some( m => m.site === drop.key ), 'picked clean: its marker is gone' );

	// save -> load: taken, used, dug, the drop and the timers; debug sites are not saved
	const save = { world: {} };
	game.markers.serialize( save );
	S.serialize( save );
	const w = JSON.parse( JSON.stringify( save.world.sites ) );
	ok( w.dug[ st.key ] !== undefined && Object.keys( w.taken ).some( k => k.startsWith( drop.key + ':' ) ) && w.drops.some( d => d.id === drop.id ), 'the save holds the dug stash, the drop and what was taken from it' );
	ok( ! Object.keys( w.taken ).concat( Object.keys( w.used ), Object.keys( w.dug ) ).some( k => k.startsWith( 'dbg:' ) ), 'debug-placed sites leave nothing in the save' );
	ok( Number.isFinite( w.nextDrop ) && w.nextId > drop.id, 'the next drop and the next id are kept' );
	const game2 = { ...game, scene: new THREE.Scene(), physics: new Physics( hf, null ), interact: { addProvider: () => () => {} }, markers: new Markers( game ) };
	game2.markers.load( JSON.parse( JSON.stringify( save ) ) );
	const S2 = new Sites( game2 );
	S2.load( JSON.parse( JSON.stringify( save ) ) );
	const d2 = S2.drops.find( d => d.key === drop.key );
	ok( S2.state.isDug( st.key ) && d2?.landed && Math.abs( d2.x - drop.x ) < 0.01 && S2.drops.length === S.drops.length && S2.nextId === S.nextId, 'loaded: the stash dug, the drop landed where it was' );
	ok( [ ...S2.state.taken.keys() ].every( k => S.state.taken.has( k ) ) && S2.state.taken.size > 0, 'loaded: what was taken' );
	ok( S2.marks.size > 0 && [ ...S2.marks.keys() ].includes( tgt.key ), 'loaded: the markers are linked to their sites again' );
	ok( S2.state.used.size === [ ...S.state.used.keys() ].filter( k => ! k.startsWith( 'dbg:' ) ).length, 'loaded: what was used' );
	// a body searched in the earlier session is empty until it respawns
	S.state.use( 'site:1:1:0:b0', game.time.hours );
	const save2 = { world: {} };
	S.serialize( save2 );
	const S3 = new Sites( { ...game2, physics: new Physics( hf, null ) } );
	S3.load( JSON.parse( JSON.stringify( save2 ) ) );
	ok( S3._bodyLoot( 'site:1:1:0:b0', { T: { loot: 'zombie_civilian' } }, 120 ).length === 0, 'a body searched before the save is empty after loading' );
	// the drop expires after its life, with its takes
	game.time.hours += 73;
	frames( 2 );
	ok( ! S.drops.includes( drop ) && ! S.active.has( drop.key ) && ! [ ...S.state.taken.keys() ].some( k => k.startsWith( drop.key + ':' ) ), 'after 72 h the drop is gone, with its takes' );
	S.dispose(); S2.dispose(); S3.dispose();
	ok( game.scene.children.length === 0, 'dispose leaves nothing in the scene' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
