// Core logic tests (Node, no browser): terrain data, physics, inventory, saves, commands.
//   node test/logic.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { HeightField } from '../src/world/HeightField.js';
import { Physics } from '../src/game/Physics.js';
import { defineItems, makeStack, getItem, ammoOf, stackWeight } from '../src/game/items/ItemDB.js';
import { PlayerInventory, addToItems, containerVolume } from '../src/game/Inventory.js';
import { SaveSystem } from '../src/core/SaveSystem.js';
import { Commands } from '../src/game/Commands.js';

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- terrain ------------------------------------------------------------------------------------
console.log( 'terrain' );
const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const buf = raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength );
const hf = new HeightField( buf, meta );
ok( hf.cnx > 2000 && hf.NT > 300, 'grid sizes' );
// Mauna Kea summit is the highest point, deep water between the islands
const mk = meta.labels.find( l => l.name === 'Mauna Kea' );
const top = hf.heightAt( mk.x, mk.z );
ok( top > 600 && top < 760, `Mauna Kea height ${top.toFixed( 1 )}` );
ok( hf.heightAt( 0, 0 ) < - 30, 'open ocean at the origin' );
ok( hf.islandAt( mk.x, mk.z ) === 8, 'Mauna Kea is on Hawaiʻi' );
const hnl = meta.cities.find( c => c.id === 'honolulu' );
ok( hf.heightAt( hnl.x, hnl.z ) > 0.5, 'Honolulu is above the sea' );
ok( hf.islandAt( hnl.x, hnl.z ) === 3, 'Honolulu is on Oʻahu' );
// Catmull-Rom surface is continuous
let maxJump = 0;
for ( let i = 0; i < 400; i ++ ) { const x = hnl.x + i * 0.5; maxJump = Math.max( maxJump, Math.abs( hf.heightAt( x + 0.5, hnl.z ) - hf.heightAt( x, hnl.z ) ) ); }
ok( maxJump < 0.6, `height is continuous (max step ${maxJump.toFixed( 3 )} m over 0.5 m)` );
// ray down hits the ground where heightAt says
const t = hf.raycast( hnl.x, 200, hnl.z, 0, - 1, 0, 400 );
near( 200 - t, hf.heightAt( hnl.x, hnl.z ), 0.05, 'vertical ray hits the ground' );
ok( meta.buildings.data.length % 11 === 0 && meta.buildings.data.length / 11 > 3000, 'buildings present' );
ok( meta.roads.length > 100, 'roads present' );

// ---- physics ------------------------------------------------------------------------------------
console.log( 'physics' );
const P = new Physics( hf, null );
const gy = hf.heightAt( hnl.x, hnl.z );
const box = P.add( { x: hnl.x, y: gy + 1, z: hnl.z, hx: 2, hy: 1, hz: 0.5, yaw: Math.PI / 4, mat: 'wood' } );
// standing on it
const g = P.ground( hnl.x, hnl.z, gy + 2.1 );
near( g.y, gy + 2, 1e-6, 'ground on box top' );
ok( g.box === box, 'ground returns the box' );
// pushed out of it
const p = new THREE.Vector3( hnl.x + 0.1, gy, hnl.z );
P.resolveCylinder( p, 0.3, 1.8, 0.45 );
const dx = p.x - box.x, dz = p.z - box.z;
const u = dx * box.c - dz * box.s, v = dx * box.s + dz * box.c;
ok( Math.abs( u ) > 2 + 0.29 || Math.abs( v ) > 0.5 + 0.29, 'cylinder pushed outside the box' );
// ray hits the box from the side
const o = new THREE.Vector3( hnl.x - 10, gy + 1, hnl.z );
const hit = P.raycast( o, new THREE.Vector3( 1, 0, 0 ), 30 );
ok( hit && hit.kind === 'box' && hit.t > 5 && hit.t < 10, 'ray hits the rotated box' );
P.remove( box );
ok( ! P.raycast( o, new THREE.Vector3( 1, 0, 0 ), 30, {} )?.box, 'removed box is gone' );

// ---- inventory ----------------------------------------------------------------------------------
console.log( 'inventory' );
defineItems( [
	{ id: 't_shirt', name: 'Test shirt', cat: 'clothing', weight: 0.2, size: 3, clothing: { slot: 'torso', capacity: 6 } },
	{ id: 't_pack', name: 'Test pack', cat: 'backpack', weight: 1, size: 8, backpack: { slot: 'back', capacity: 30 } },
	{ id: 't_beans', name: 'Beans', cat: 'food', weight: 0.4, size: 1, stack: 1, food: { kcal: 300 } },
	{ id: 't_ammo', name: 'Ammo', cat: 'ammo', weight: 0.012, size: 1, stack: 60, stackPerSlot: 30, ammo: { caliber: 't' } },
	{ id: 't_mag', name: 'Mag', cat: 'magazine', weight: 0.2, size: 1, magazine: { caliber: 't', capacity: 30 } },
	{ id: 't_gun', name: 'Gun', cat: 'firearm', weight: 3, size: 10, firearm: { cls: 'rifle', caliber: 't', feed: 'mag', mags: [ 't_mag' ], modes: [ 'semi', 'auto' ], slot: 'primary' } },
] );
const inv = new PlayerInventory();
ok( inv.add( makeStack( 't_shirt' ) ) === 0 && inv.equip.torso, 'shirt auto-equips' );
ok( inv.add( makeStack( 't_pack' ) ) === 0 && inv.equip.back, 'backpack auto-equips' );
ok( inv.add( makeStack( 't_gun', 1, { full: true } ) ) === 0 && inv.weapons.primary, 'gun goes to the shoulder' );
ok( ammoOf( inv.weapons.primary ) === 31, 'full gun = mag + chamber' );
for ( let i = 0; i < 10; i ++ ) inv.add( makeStack( 't_beans' ) );
ok( inv.count( 't_beans' ) === 10, 'ten cans stored' );
inv.add( makeStack( 't_ammo', 60 ) );
inv.add( makeStack( 't_ammo', 45 ) );
ok( inv.count( 't_ammo' ) === 105, 'ammo merged' );
ok( inv.consume( 't_ammo', 50 ) && inv.count( 't_ammo' ) === 55, 'consume ammo' );
ok( ! inv.consume( 't_beans', 99 ), "can't consume more than you have" );
const items = [];
ok( addToItems( items, 2, makeStack( 't_beans' ) ) === 0 && addToItems( items, 2, makeStack( 't_beans' ) ) === 0, 'two cans fit in 2' );
ok( addToItems( items, 2, makeStack( 't_beans' ) ) === 1, 'third can does not fit' );
ok( containerVolume( items ) === 2, 'volume 2' );
ok( inv.totalWeight() > 4 && inv.totalWeight() < 12, `weight ${inv.totalWeight().toFixed( 2 )}` );
const ser = JSON.parse( JSON.stringify( inv.serialize() ) );
const inv2 = new PlayerInventory(); inv2.load( ser );
ok( inv2.count( 't_beans' ) === 10 && inv2.weapons.primary.id === 't_gun', 'inventory round-trips' );
ok( stackWeight( inv.weapons.primary ) > 3, 'gun weight includes its magazine' );

// ---- saves --------------------------------------------------------------------------------------
console.log( 'saves' );
const w = SaveSystem.newWorld( { name: 'x', seed: 'aloha' } );
ok( typeof w.seed === 'number' && w.seed > 0, 'text seeds hash to numbers' );
ok( SaveSystem.newWorld( { seed: '42' } ).seed === 42, 'numeric seed kept' );
ok( w.world && w.time.hours > 0 && w.mode === 'survival', 'new world defaults' );

// ---- commands -----------------------------------------------------------------------------------
console.log( 'commands' );
const fakeGame = {
	world: { meta, terrain: { update() {} } }, hf, save: { hardcore: false }, mode: 'creative', stats: {},
	player: { pos: new THREE.Vector3( hnl.x, 5, hnl.z ), yaw: 0, vel: new THREE.Vector3(), inventory: inv },
	physics: P, events: { emit( n, d ) { if ( n === 'chat' ) fakeGame.last = d; } }, spawnables: { zombie: { spawn() {} } },
	time: { hours: 10, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 1; },
	give( id, n ) { this.gave = [ id, n ]; },
};
const C = new Commands( fakeGame );
C.run( '/give t_beans 3' );
ok( fakeGame.gave?.[ 0 ] === 't_beans' && fakeGame.gave[ 1 ] === 3, '/give by id' );
C.run( '/give Beans' );
ok( fakeGame.gave?.[ 0 ] === 't_beans', '/give by name' );
C.run( '/time set 18:30' );
near( fakeGame.hour, 18.5, 1e-6, '/time set HH:MM' );
C.run( '/tp waikiki' );
const wk = meta.cities.find( c => c.id === 'waikiki' );
ok( Math.hypot( fakeGame.player.pos.x - wk.x, fakeGame.player.pos.z - wk.z ) < 1, '/tp to a place by alias' );
C.run( '/tp ~10 ~-5' );
near( fakeGame.player.pos.x, wk.x + 10, 1e-6, '/tp relative x' );
ok( C.complete( '/gi' )[ 0 ]?.text === '/give', 'completes command names' );
ok( C.complete( '/give t_be' ).some( s => s.text === 't_beans' ), 'completes item ids' );
ok( C.complete( '/tp hon' ).some( s => /Honolulu/.test( s.text ) ), 'completes places' );
C.run( '/nonsense' );
ok( fakeGame.last?.kind === 'err', 'unknown command reports an error' );

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
