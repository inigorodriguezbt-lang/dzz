// Creatures logic tests (Node, no browser): the population model on the real world data (density by place,
// kind mix, kills and their recovery, save format), path planning around walls and into a house, the vehicle
// footprint helper, hit capsules, the infected looks, loot / yield ids, and the animal models' geometry.
//   node test/creatures.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { HeightField } from '../src/world/HeightField.js';
import { Physics } from '../src/game/Physics.js';
import '../src/game/items/defs/index.js';
import { getItem } from '../src/game/items/ItemDB.js';
import { LOOT_TABLES, rollLoot } from '../src/game/items/Loot.js';
import { Population } from '../src/ai/Population.js';
import { Mover, steer, findPath, nav } from '../src/ai/Steer.js';
import { rayCapsule } from '../src/ai/Body.js';
import { ZTYPES, WORN, ALOHA_ITEM, rollLook, vehicleNearest } from '../src/ai/Zombie.js';
import { SPECIES } from '../src/ai/Animals.js';

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// ---- the population on the real islands ------------------------------------------------------------
console.log( 'population' );
const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
const game = { world: { meta, isBeach: () => false }, hf };
const pop = new Population( game );
const city = ( id ) => meta.cities.find( c => c.id === id );
const hnl = city( 'honolulu' );
const dCity = pop.density( hnl.x, hnl.z );
ok( dCity > 0.5, `downtown Honolulu is crowded (${dCity.toFixed( 2 )})` );
// the empty interior of the Big Island (Mauna Kea's flank) is nearly empty
const mk = meta.labels.find( l => l.name === 'Mauna Kea' );
const dWild = pop.density( mk.x + 600, mk.z + 600 );
ok( dWild < 0.1, `the wilderness is sparse (${dWild.toFixed( 3 )})` );
ok( pop.density( 0, 0 ) < 0.05, 'nobody in the open ocean' );
// every settlement kind resolves to a zone with a mix of kinds that exist
const kinds = new Set();
for ( const c of meta.cities ) {
	const z = pop.zone( c.x, c.z );
	ok( typeof z === 'string', `zone for ${c.name}` );
	for ( let i = 0; i < 20; i ++ ) kinds.add( pop.pickKind( c.x, c.z, 0.5 ) );
}
for ( const k of kinds ) ok( !! ZTYPES[ k ], `kind ${k} is defined` );
ok( kinds.has( 'civilian' ) && kinds.has( 'tourist' ), 'civilians and tourists appear' );
const mil = meta.cities.find( c => c.kind === 'military' );
if ( mil ) ok( pop.zone( mil.x, mil.z ) === 'military', `${mil.name} is a military zone` );
// kills thin a cell and it recovers over days
const k0 = pop.killFactor( hnl.x, hnl.z, 100 );
for ( let i = 0; i < 40; i ++ ) pop.addKill( hnl.x, hnl.z, 100 );
const k1 = pop.killFactor( hnl.x, hnl.z, 100 );
const k2 = pop.killFactor( hnl.x, hnl.z, 100 + 24 * 7 );
ok( k0 === 1 && k1 < 0.7, `kills lower the population (${k1.toFixed( 2 )})` );
ok( k2 > k1 + 0.2, `and it fills back up in a week (${k2.toFixed( 2 )})` );
// save format: save.world.killed[ cell ] = [ count, gameHour ], round trip
const saved = JSON.parse( JSON.stringify( pop.serialize() ) );
const key = Object.keys( saved )[ 0 ];
ok( key && /^-?\d+,-?\d+$/.test( key ) && Array.isArray( saved[ key ] ) && saved[ key ].length === 2, 'kill cells saved as [count, hour]' );
const pop2 = new Population( game );
pop2.load( saved );
ok( Math.abs( pop2.killFactor( hnl.x, hnl.z, 100 ) - k1 ) < 0.02, 'kills survive a save and load' );
// highway horde spots near a big road
const road = meta.roads.find( r => r.lanes >= 2 );
const rp = new THREE.Vector3( road.pts[ 0 ] + 150, 0, road.pts[ 1 ] );
const hs = pop.roadNear( rp, 20, 400 );
ok( hs && Number.isFinite( hs.x ) && Math.abs( Math.hypot( hs.dx, hs.dz ) - 1 ) < 1e-3, 'a road point for a passing horde' );

// ---- path planning ------------------------------------------------------------------------------------
console.log( 'navigation' );
const flat = {
	heightAt: () => 0.5, baseHeight: () => 0.5, normalAt: ( x, z, o = new THREE.Vector3() ) => o.set( 0, 1, 0 ),
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { if ( dy >= 0 ) return - 1; const t = ( oy - 0.5 ) / - dy; return t <= maxT ? t : - 1; },
};
const P = new Physics( flat, null );
const wall = ( x, z, hx, hz, kind ) => P.add( { x, y: 2, z, hx, hy: 1.5, hz, yaw: 0, kind } );
// a 20 m wall between an agent and its goal
wall( 0, - 8, 10, 0.2 );
const g = { physics: P, hf: flat };
const ent = { pos: new THREE.Vector3( 0, 0.5, - 16 ), vel: new THREE.Vector3(), yaw: 0, alive: true };
const m = new Mover( 0.3, 1.7 );
ok( findPath( g, ent.pos, 0, 0, m ) && m.path.n >= 2, `a path round the wall (${m.path.n} waypoints)` );
// the path never passes through the wall
let crosses = false;
for ( let i = 0, px = ent.pos.x, pz = ent.pos.z; i < m.path.n; i ++ ) {
	const x = m.path.pts[ i * 2 ], z = m.path.pts[ i * 2 + 1 ];
	if ( ( pz - - 8 ) * ( z - - 8 ) < 0 ) { const t = ( - 8 - pz ) / ( z - pz ); if ( Math.abs( px + ( x - px ) * t ) < 10.4 ) crosses = true; }
	px = x; pz = z;
}
ok( ! crosses, 'the path goes round the end of the wall' );
// walk it with steer + a simple integrator
nav.budget = 99;
let reached = false;
const mm = new Mover( 0.3, 1.7 );
for ( let i = 0; i < 1500 && ! reached; i ++ ) {
	if ( i % 5 === 0 ) { nav.budget = 2; steer( g, ent, mm, 0, 0, 5 / 30, null ); }
	ent.pos.addScaledVector( mm.dir, 2 / 30 );
	P.resolveCylinder( ent.pos, 0.3, 1.7, 0.45 );
	if ( Math.hypot( ent.pos.x, ent.pos.z ) < 1 ) reached = true;
}
ok( reached, 'steering follows the plan to the goal' );
// a closed house with one doorway: a path in exists, a sealed one has none
const P2 = new Physics( flat, null );
const g2 = { physics: P2, hf: flat };
const w2 = ( x, z, hx, hz, kind ) => P2.add( { x, y: 2, z, hx, hy: 1.5, hz, yaw: 0, kind } );
w2( 0, - 4, 5, 0.15 ); w2( - 5, 0, 0.15, 4 ); w2( 5, 0, 0.15, 4 ); w2( - 3, 4, 2, 0.15 ); w2( 3.5, 4, 1.5, 0.15 );
const m2 = new Mover( 0.3, 1.7 );
ok( findPath( g2, new THREE.Vector3( 2, 0.5, - 20 ), 0, 0, m2 ), 'a path into the house through its doorway' );
const last = [ m2.path.pts[ m2.path.n * 2 - 2 ], m2.path.pts[ m2.path.n * 2 - 1 ] ];
ok( Math.hypot( last[ 0 ], last[ 1 ] ) < 0.5, 'the path ends at the goal' );
const door = w2( 0.5, 4, 1, 0.1, 'door' );
const m3 = new Mover( 0.3, 1.7 );
ok( findPath( g2, new THREE.Vector3( 2, 0.5, - 20 ), 0, 0, m3 ), 'a closed door is passable for planning (they bash it)' );
P2.remove( door );
w2( 0.5, 4, 1, 0.1 );
const m4 = new Mover( 0.3, 1.7 );
ok( ! findPath( g2, new THREE.Vector3( 2, 0.5, - 20 ), 0, 0, m4 ), 'a sealed house has no way in' );
// a plan takes little time
const t0 = performance.now();
for ( let i = 0; i < 20; i ++ ) findPath( g, new THREE.Vector3( ( i - 10 ) * 3, 0.5, - 40 ), 0, 20, new Mover() );
const ms = ( performance.now() - t0 ) / 20;
ok( ms < 6, `a 60 m plan costs ${ms.toFixed( 2 )} ms` );

// ---- vehicle footprint, capsules ------------------------------------------------------------------
console.log( 'geometry' );
const car = { pos: new THREE.Vector3( 10, 0, 10 ), yaw: Math.PI / 2, size: new THREE.Vector3( 1.8, 1.5, 4.4 ), bounds: new THREE.Box3( new THREE.Vector3( - 0.9, 0, - 2.2 ), new THREE.Vector3( 0.9, 1.5, 2.2 ) ) };
// turned 90°: the car's length runs along world x; a point beside its flank is 0.9 m from the side
const q = vehicleNearest( car, new THREE.Vector3( 11, 0, 13 ), new THREE.Vector3() );
ok( Math.abs( q.z - 10.9 ) < 1e-6 && Math.abs( q.x - 11 ) < 1e-6, `nearest point on the flank (${q.x.toFixed( 2 )}, ${q.z.toFixed( 2 )})` );
const q2 = vehicleNearest( car, new THREE.Vector3( 20, 0, 10 ), new THREE.Vector3() );
ok( Math.abs( q2.x - 12.2 ) < 1e-6, 'nearest point at the bumper' );
const A = new THREE.Vector3( 0, 0, 0 ), B = new THREE.Vector3( 0, 1, 0 );
const hit = rayCapsule( new THREE.Vector3( - 5, 0.5, 0 ), new THREE.Vector3( 1, 0, 0 ), A, B, 0.2, 10 );
ok( hit !== null && Math.abs( hit - 4.8 ) < 1e-6, 'ray meets a capsule side' );
ok( rayCapsule( new THREE.Vector3( - 5, 1.35, 0 ), new THREE.Vector3( 1, 0, 0 ), A, B, 0.2, 10 ) === null, 'ray passes over the end cap' );
ok( rayCapsule( new THREE.Vector3( - 5, 1.1, 0 ), new THREE.Vector3( 1, 0, 0 ), A, B, 0.2, 10 ) !== null, 'ray clips the end cap' );

// ---- looks, loot and yields ------------------------------------------------------------------------
console.log( 'data' );
let rs = 7;
const r = () => ( rs = ( rs * 16807 ) % 2147483647 ) / 2147483647;
for ( const k in ZTYPES ) {
	const L = rollLook( ZTYPES[ k ], k, r );
	ok( L.skin.length === 3 && L.tint.length === 3 && L.seed >= 0 && L.infect === 1, `look for ${k}` );
	if ( ZTYPES[ k ].uniform ) ok( Math.abs( L.hue ) <= 0.015, `${k} keeps the uniform's colours` );
	ok( LOOT_TABLES[ ZTYPES[ k ].loot ], `${k} loot table ${ZTYPES[ k ].loot}` );
	ok( rollLook( ZTYPES[ k ], k, r ) !== L, 'looks are fresh objects' );
}
for ( const t of [ 'zombie_civilian', 'zombie_tourist', 'zombie_police', 'zombie_military', 'zombie_medic' ] ) {
	for ( let i = 0; i < 20; i ++ ) for ( const s of rollLoot( t, r ) ) ok( getItem( s.id ), `${t} rolls known item ${s.id}` );
}
for ( const k in WORN ) for ( const id of WORN[ k ] ) ok( getItem( id ), `worn item ${id} (${k})` );
for ( const id of ALOHA_ITEM ) ok( getItem( id ), `aloha shirt ${id}` );
for ( const s in SPECIES ) for ( const [ ids ] of SPECIES[ s ].yields || [] ) ok( ids.some( id => getItem( id ) ), `${s} yields ${ids.join( '/' )}` );

console.log( `${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
