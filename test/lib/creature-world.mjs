// A small stand-in game for running the real creatures module in Node (no browser, no GPU): flat ground with
// real Physics, EntityManager, Events and Ballistics, the real avatars (GLB parsed from disk, blank textures),
// the real clip bank, bodies and ragdolls; survival, UI, audio and FX are stubs that log what they are asked.
//   const w = await makeWorld( { walls, door, night, difficulty, quality, meta } ); w.step( sec ); w.log
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installFakeDom } from './fake-dom.mjs';

installFakeDom();
globalThis.performance ||= { now: () => Date.now() };

const { Events } = await import( '../../src/core/Events.js' );
const { Physics } = await import( '../../src/game/Physics.js' );
const { EntityManager } = await import( '../../src/game/Entities.js' );
const { Ballistics, hitEntity } = await import( '../../src/weapons/Ballistics.js' );
await import( '../../src/game/items/defs/index.js' );
const { ClipBank } = await import( '../../src/ai/Anim.js' );
const { CharacterLib } = await import( '../../src/ai/Characters.js' );
const { install } = await import( '../../src/ai/Creatures.js' );

const DIR = new URL( '../../public/', import.meta.url );
const read = ( rel ) => { const b = fs.readFileSync( new URL( rel, DIR ) ); return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ); };
// assets from disk instead of fetch / image loads
ClipBank.load = async ( url ) => new ClipBank( read( url ) );
GLTFLoader.prototype.loadAsync = function ( url ) { return this.parseAsync( read( url ), '' ); };
CharacterLib.prototype._tex = async function () { const t = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ); t.image.height = 1536; return t; };

export const GROUND = 0.5;
export const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

// a town for the population model: blocks of buildings around the origin, a police station among them
export const TOWN = { cities: [ { name: 'Test', id: 'test', kind: 'town', x: 0, z: 0, radius: 400 } ], roads: [], streets: [], runways: [],
	buildings: { fields: [ 'x', 'z', 'w', 'd', 'angle', 'base', 'lo', 'type', 'floors', 'city', 'style' ], data: [] } };
for ( let i = - 8; i <= 8; i ++ ) for ( let j = - 8; j <= 8; j ++ ) if ( Math.abs( i ) + Math.abs( j ) > 1 ) TOWN.buildings.data.push( i * 40, j * 40, 12, 10, 0, 0.5, 0.5, ( i * 7 + j * 3 ) % 5 === 0 ? 17 : 2, 2, 0, 0 );

// flat land at GROUND; beyond x > sea it is deep sea (for sharks and shorelines)
function heightField( sea ) {
	const h = ( x ) => x > sea ? - 12 : GROUND;
	return {
		heightAt: ( x ) => h( x ), baseHeight: ( x ) => h( x ), normalAt: ( x, z, out = new THREE.Vector3() ) => out.set( 0, 1, 0 ),
		surfaceAt: ( x, z, out = [ 0, 0, 0, 0 ] ) => { out[ 0 ] = 0.6; out[ 1 ] = 0; out[ 2 ] = 0; out[ 3 ] = 0; return out; },
		flagsNear: () => 4, islandAt: () => 3,
		raycast( ox, oy, oz, dx, dy, dz, maxT ) { if ( dy >= - 1e-9 ) return - 1; const t = ( oy - h( ox ) ) / - dy; return t >= 0 && t <= maxT ? t : - 1; },
	};
}

export async function makeWorld( o = {} ) {
	const log = [];
	const hf = heightField( o.sea ?? 1e9 );
	const scene = new THREE.Scene();
	const cam = new THREE.PerspectiveCamera( 70, 16 / 9, 0.05, 500 );
	const g = {
		mode: 'survival', difficulty: o.difficulty || 'normal', time: { hours: o.hour ?? 10, dayMinutes: 48 },
		systems: [], scene, camera: cam, hf, save: { world: {} }, dead: false,
		settings: { get: ( k ) => ( { quality: o.quality || 'high' } )[ k ] },
		events: new Events(),
		audio: { play: ( n ) => { log.push( [ 'snd', n ] ); return null; }, buffers: new Map(), ctx: null },
		fx: new Proxy( {}, { get: ( t, k ) => ( ...a ) => { if ( k === 'bloodPool' || k === 'blood' ) log.push( [ 'fx', k ] ); return null; } } ),
		toast: ( t ) => log.push( [ 'toast', t ] ),
		world: { meta: o.meta || TOWN, sky: { night: o.night || 0 }, isIndoors: () => false, isBeach: () => false },
		register( s ) { this.systems.push( s ); return s; },
		interact: { providers: [], addProvider( fn ) { this.providers.push( fn ); return () => this.providers.splice( this.providers.indexOf( fn ), 1 ); } },
		actions: { start: ( a ) => { log.push( [ 'action', a.label ] ); a.onDone?.(); return a; }, busy: false },
		app: { ui: { openContainer: ( c ) => { log.push( [ 'container', c.label, c.items.length ] ); g.lastContainer = c; } } },
		items3d: { spawn: ( st ) => { log.push( [ 'item', st.id, st.qty ] ); } },
		dropStack: ( st ) => log.push( [ 'drop', st.id ] ),
		survival: { hurt: ( a, kind, info ) => log.push( [ 'hurt', kind, + a.toFixed( 1 ), info.cause ] ) },
	};
	g.physics = new Physics( hf, null );
	g.entities = new EntityManager( g );
	g.player = {
		pos: new THREE.Vector3( 0, GROUND, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stance: 'stand', speedNow: 0, sprinting: false, alive: true,
		vehicle: null, swimming: false, height: 1.8, inventory: { hasTool: () => true, find: () => null },
		get eye() { return this.pos.y + 1.66; },
		lookDir( out = new THREE.Vector3() ) { return out.set( - Math.sin( this.yaw ) * Math.cos( this.pitch ), Math.sin( this.pitch ), - Math.cos( this.yaw ) * Math.cos( this.pitch ) ); },
	};
	g.ballistics = new Ballistics( g );
	g.register( g.ballistics );
	g.events.on( 'kill', ( e ) => log.push( [ 'kill', e.target?.type, e.target?.kind || e.target?.species, e.source === g.player ? 'player' : e.source?.type || String( e.source ) ] ) );
	for ( const w of o.walls || [] ) g.physics.add( { x: w[ 0 ], y: GROUND + 1.5, z: w[ 1 ], hx: w[ 2 ], hy: 1.5, hz: w[ 3 ], yaw: w[ 4 ] || 0, mat: 'concrete' } );
	// a door like the city's: a box of kind 'door' and doorAt( pos, r ) -> { bash( amount, info ), broken, isOpen }
	if ( o.door ) {
		const [ x, z, hx, hz ] = o.door;
		const d = { hp: o.doorHp ?? 60, broken: false, target: 0, get isOpen() { return this.target > 0.5; } };
		d.box = g.physics.add( { x, y: GROUND + 1.05, z, hx, hy: 1.05, hz, yaw: 0, mat: 'wood', kind: 'door', owner: d } );
		d.bash = ( a, info ) => {
			if ( d.broken || d.isOpen ) return false;
			d.hp -= a; log.push( [ 'bash', + a.toFixed( 1 ), info?.kind ] );
			// broken: it swings open (the box stays, turned aside) as in src/city/buildings/doors.js
			if ( d.hp <= 0 ) { d.broken = true; d.target = 1; d.box.x += hx; d.box.z += hx; d.box.yaw = Math.PI / 2; g.physics.update( d.box ); log.push( [ 'door broken' ] ); }
			return true;
		};
		d.open = () => { d.target = 1; d.box.x += hx; d.box.z += hx; d.box.yaw = Math.PI / 2; g.physics.update( d.box ); };
		g.door = d;
		g.city = { doorAt: ( p, r = 1.5 ) => ! d.broken && ! d.isOpen && Math.hypot( p.x - x, p.z - z ) < r + hx ? d : null };
	}
	install( g );
	if ( o.noPopulate !== false ) { g.creatures._populate = () => {}; g.creatures.animals.update = () => {}; g.creatures.bandits.update = () => {}; }
	await g.creatures.lib.ready;
	await Promise.all( ( o.avatars || [ 'm_casual2', 'f_casual2' ] ).map( id => g.creatures.lib.load( id ) ) );
	const w = {
		g, log, scene, THREE,
		// advance the game: camera at the player's eyes, systems, entities, matrices
		step( sec, dt = 1 / 30, each = null ) {
			const n = Math.ceil( sec / dt );
			for ( let i = 0; i < n; i ++ ) {
				const p = g.player;
				cam.position.set( p.pos.x, p.eye, p.pos.z );
				cam.rotation.set( p.pitch, p.yaw, 0, 'YXZ' );
				cam.updateMatrixWorld();
				g.time.hours += dt / ( 48 * 60 ) * 24;
				for ( const s of g.systems ) s.update?.( dt );
				g.entities.update( dt );
				scene.updateMatrixWorld();
				if ( each && each( i * dt ) === true ) return i * dt;
			}
			return sec;
		},
		// a zombie of a kind from an avatar that is loaded
		zombie( kind, pos, o2 = {} ) {
			const lib = g.creatures.lib, id = o2.avatar || lib.loadedIds()[ 0 ];
			return g.creatures._make( lib.get( id ), kind, pos, o2 );
		},
		lookAt( v ) { const p = g.player, dx = v.x - p.pos.x, dy = v.y - p.eye, dz = v.z - p.pos.z; p.yaw = Math.atan2( - dx, - dz ); p.pitch = Math.atan2( dy, Math.hypot( dx, dz ) ); },
		// the player fires a real round at a world point
		fireAt( target, weapon = 'm4a1', o3 = {} ) {
			const p = g.player, from = V( p.pos.x, p.eye, p.pos.z );
			g.ballistics.fire( from, target.clone().sub( from ).normalize(), { weapon, source: p, ...o3 } );
		},
		hit: ( e, amount, info ) => hitEntity( g, e, amount, { source: g.player, dir: V( 0, 0, - 1 ), ...info } ),
		noise( pos, radius, kind = 'gunshot', source = g.player ) { g.events.emit( 'noise', { pos: pos.clone(), radius, kind, source } ); },
		interact() {
			const p = g.player, ray = { origin: V( p.pos.x, p.eye, p.pos.z ), dir: p.lookDir( V() ) };
			const out = [];
			for ( const fn of g.interact.providers ) for ( const c of fn( ray, 4 ) || [] ) out.push( c );
			return out.sort( ( a, b ) => a.t - b.t );
		},
		count: ( k ) => log.filter( e => e[ 0 ] === k ).length,
		dispose() { for ( const s of g.systems ) s.dispose?.(); for ( const e of g.entities.list ) e.dispose(); },
	};
	return w;
}
