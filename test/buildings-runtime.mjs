// Node check of the buildings runtime (src/city/Buildings.js) without a browser: the real module on a small fake
// game (real height field, physics, events, actions, loot tables; the worker jobs run in-process; canvases are
// no-ops). Streams shells and interiors around a few buildings and checks the whole gameplay surface:
//   shells + coarse colliders, interior swap, doors (open / close, locks: lockpick, pry, kicks, the infected's
//   bash with { source, kind }), doorAt, containers (search -> openContainer with rolled loot, deterministic,
//   persists through serialize / load), loose loot via items3d, beds (sleep), taps, isIndoors, buildingAt,
//   locate, types, gasPumps, the integration budget, save / load round trip and dispose (no leaked boxes).
//   node test/buildings-runtime.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
const { HeightField } = await import( '../src/world/HeightField.js' );
const { Physics } = await import( '../src/game/Physics.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Actions } = await import( '../src/game/Actions.js' );
await import( '../src/game/items/defs/index.js' );
const { install } = await import( '../src/city/Buildings.js' );

const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
const wmeta = { cities: meta.cities, roads: meta.roads, streets: meta.streets, runways: meta.runways, buildings: meta.buildings };

let fails = 0, passes = 0;
const ok = ( c, msg ) => { if ( c ) { passes ++; if ( process.env.VERBOSE || / ms/.test( msg ) ) console.log( '  ✓ ' + msg ); } else { fails ++; console.log( '  ✗ ' + msg ); } };
const section = ( s ) => console.log( s );

// ---- the fake game -------------------------------------------------------------------------------------------------

function makeGame( save = { world: {} } ) {
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera( 60, 16 / 9, 0.1, 5000 );
	// worker jobs run in worker threads like the browser's pool (the main thread doesn't pay for their work)
	const pool = { busy: 0, jobs: 0, submit( msg ) {
		this.jobs ++; this.busy ++;
		const job = { cancelled: false };
		const w = workers[ this.jobs % workers.length ], id = ++ jobId;
		job.promise = new Promise( ( res, rej ) => pending.set( id, { res: ( r ) => { this.busy --; res( job.cancelled ? null : r ); }, rej } ) );
		w.postMessage( { id, msg } );
		return job;
	} };
	const settings = { v: { quality: 'high', renderDistance: 900, shadows: 'high' }, get( k ) { return this.v[ k ]; }, on() { return () => {}; } };
	const log = { toasts: [], sounds: [], opened: [], slept: [], drank: [], noise: [], spawned: [] };
	const inv = {
		tools: new Set(), counts: {},
		hasTool( k ) { return this.tools.has( k ); }, count( id ) { return this.counts[ id ] || 0; },
		consume( id, n ) { this.counts[ id ] = Math.max( 0, ( this.counts[ id ] || 0 ) - n ); }, changed() {}, find() { return null; },
	};
	const game = {
		scene, camera, hf, seed: 1234, mode: 'survival', save, systems: [],
		world: { meta, pool, scene, hf, sky: { night: 0 }, indoorTest: null },
		settings, events: new Events(), time: { hours: 10 },
		player: { pos: new THREE.Vector3(), vehicle: null, inventory: inv, shake: 0 },
		survival: { stamina: 100, useStamina( n ) { this.stamina -= n; }, drink( d, l, liq ) { log.drank.push( [ l, liq ] ); } },
		audio: { play( n ) { log.sounds.push( n ); return { stop() {} }; } },
		toast( t ) { log.toasts.push( t ); },
		sleep( h, q ) { log.slept.push( [ h, q ] ); return true; },
		app: { ui: { openContainer( c ) { log.opened.push( c ); } } },
		items3d: {
			list: new Set(), taken: [],
			spawn( stack, pos, o ) { const it = { stack, pos: pos.clone(), key: o.key }; this.list.add( it ); log.spawned.push( it ); return it; },
			remove( it ) { this.list.delete( it ); },
			addTakenListener( fn ) { this.taken.push( fn ); return () => {}; },
			take( it ) { this.list.delete( it ); for ( const fn of this.taken ) fn( it ); },
		},
		interact: { providers: [], addProvider( fn ) { this.providers.push( fn ); return () => this.providers.splice( this.providers.indexOf( fn ), 1 ); } },
		register( s ) { this.systems.push( s ); },
		log,
	};
	game.physics = new Physics( hf, null );
	game.actions = new Actions( game );
	game.events.on( 'noise', ( e ) => log.noise.push( e ) );
	return game;
}

const tick = () => new Promise( r => setImmediate( r ) );
// the world workers
const { Worker } = await import( 'node:worker_threads' );
const pending = new Map();
let jobId = 0;
const workers = await Promise.all( [ 0, 1 ].map( () => new Promise( ( res ) => {
	const w = new Worker( new URL( './lib/building-worker.mjs', import.meta.url ), { workerData: { world: 'public/data/world.json', terrain: 'public/data/terrain.bin.gz' } } );
	w.on( 'message', ( m ) => {
		if ( m.ready ) { res( w ); return; }
		const p = pending.get( m.id ); pending.delete( m.id );
		if ( m.error ) { console.log( 'worker job failed', m.error ); p.res( null ); } else p.res( m.result );
	} );
	w.on( 'error', ( e ) => console.log( 'worker error', e ) );
} ) ) );
// PROF=1: the slowest calls of the city's internals (and generator steps)
const prof = {}, lastProf = {};
function instrument( C ) {
	if ( ! process.env.PROF ) return;
	for ( const k of [ '_stream', '_interiors', '_integrate', '_cellReady', '_lights', '_coarse', '_shellBoxes', '_dropInterior', '_dropStorey', '_state' ] ) {
		const f = C[ k ].bind( C );
		C[ k ] = ( ...a ) => { const t = process.threadCpuUsage(); const r = f( ...a ); const u = process.threadCpuUsage( t ), d = ( u.user + u.system ) / 1000; const p = prof[ k ] ||= { n: 0, max: 0, sum: 0 }; p.n ++; p.sum += d; p.max = Math.max( p.max, d ); lastProf[ k ] = ( lastProf[ k ] || 0 ) + d; return r; };
	}
	for ( const k of [ '_storeyGen', '_cellGen', '_clearGen' ] ) {
		const f = C[ k ].bind( C );
		C[ k ] = function * ( ...a ) {
			const it = f( ...a );
			for ( let step = 0; ; step ++ ) {
				const t = process.threadCpuUsage(); const r = it.next(); const u = process.threadCpuUsage( t ), d = ( u.user + u.system ) / 1000;
				const p = prof[ k + ':' + step ] ||= { n: 0, max: 0, sum: 0 }; p.n ++; p.sum += d; p.max = Math.max( p.max, d ); lastProf[ k + ':' + step ] = ( lastProf[ k + ':' + step ] || 0 ) + d;
				if ( r.done ) return r.value;
				yield r.value;
			}
		};
	}
}
const showProf = () => { if ( process.env.PROF ) { console.log( Object.entries( prof ).filter( ( [ k, v ] ) => v.max > 1 ).map( ( [ k, v ] ) => `${k} ${v.n}x max ${v.max.toFixed( 1 )} sum ${v.sum.toFixed( 0 )}` ).join( '\n' ) ); for ( const k in prof ) delete prof[ k ]; } };
// run the game n frames at 30 fps; returns the slowest city.update (ms of this thread's CPU time, so a shared
// machine descheduling us doesn't count). Every frame time goes to `frameT`.
const frameT = [];
const p99 = () => { const a = [ ...frameT ].sort( ( x, y ) => x - y ); frameT.length = 0; return a.length ? a[ Math.floor( a.length * 0.99 ) ] : 0; };
async function run( g, n, dt = 1 / 30 ) {
	let worst = 0;
	for ( let i = 0; i < n; i ++ ) {
		g.camera.position.set( g.player.pos.x, g.player.pos.y + 1.6, g.player.pos.z );
		// CPU time, not wall time: the machine may be shared (a descheduled frame isn't the module's cost)
		const c0 = process.threadCpuUsage();
		g.city.update( dt );
		const c1 = process.threadCpuUsage( c0 ), ft = ( c1.user + c1.system ) / 1000;
		frameT.push( ft );
		worst = Math.max( worst, ft );
		g.actions.update( dt );
		await tick();
	}
	return worst;
}
// until the interiors around the player are all in (or a frame limit)
async function settle( g, max = 600 ) {
	let worst = 0;
	const t0 = Date.now();
	for ( let i = 0; i < max || ( g.world.pool.busy && Date.now() - t0 < 120000 ); i ++ ) {
		worst = Math.max( worst, await run( g, 1 ) );
		const C = g.city;
		if ( i > 20 && ! C.queue.length && ! C.cur && ! C.dropQ.length && ! g.world.pool.busy && [ ...C.interiors.values() ].every( I => [ ...I.storeys.values() ].every( s => s.ready ) ) ) break;
		if ( g.world.pool.busy ) await new Promise( r => setTimeout( r, 2 ) );
	}
	return worst;
}
const ray = ( o, target ) => { const d = new THREE.Vector3().subVectors( target, o ).normalize(); return { origin: o.clone(), dir: d }; };
const provide = ( g, o, t, reach = 4 ) => g.city.provide( ray( o, t ), reach ).sort( ( a, b ) => a.t - b.t );

// ---- building picks ------------------------------------------------------------------------------------------------

const { readBuilding, shapeOf, rectOf, NF } = await import( '../src/city/buildings/data.js' );
function find( pred, near = [ -4700, -10300 ] ) {
	let best = -1, bd = Infinity;
	for ( let i = 0; i < meta.buildings.data.length / NF; i ++ ) {
		const r = readBuilding( meta.buildings.data, i ), S = shapeOf( r, meta.cities );
		if ( ! pred( r, S ) ) continue;
		const d = Math.hypot( r.x - near[ 0 ], r.z - near[ 1 ] );
		if ( d < bd ) { bd = d; best = i; }
	}
	return best;
}

// ---- 1: a plantation house -------------------------------------------------------------------------------------------

section( 'house: streaming, interior, doors, containers, beds, taps' );
let g = makeGame();
install( g );
const C = g.city;
instrument( C );
if ( process.env.PROF ) { const up = C.update.bind( C ); C.update = ( dt ) => { const t = process.threadCpuUsage(); up( dt ); const u = process.threadCpuUsage( t ), d = ( u.user + u.system ) / 1000; if ( d > 10 ) console.log( 'slow frame', d.toFixed( 1 ), JSON.stringify( Object.fromEntries( Object.entries( lastProf ).filter( ( [ k, v ] ) => v > 1 ) ) ) ); for ( const k in lastProf ) delete lastProf[ k ]; }; }
const hi = find( ( r, S ) => S.arch === 'house' && S.variant === 'plantation' && S.n === 2 );
const rec = C.rec( hi ), { S: hS, rect: hR } = C.shape( hi );
// stand 6 m in front of it
const [ fx, fz ] = C.toWorld( rec, ( hR.x0 + hR.x1 ) / 2, hR.z0 - 6 );
g.player.pos.set( fx, hf.heightAt( fx, fz ), fz );
let worst = await settle( g );
showProf();
ok( C.near.size > 0 && C.far.size > 0, `shell cells streamed (near ${C.near.size}, far ${C.far.size})` );
ok( C.nearReady[ hi ] === 1, 'near shell of the house ready' );
const I = C.interiors.get( hi );
ok( I && I.groundReady, 'ground storey interior in' );
{ const q = p99(); ok( worst < 8, `city.update main-thread CPU per frame: p99 ${q.toFixed( 1 )} ms, worst ${worst.toFixed( 1 )} ms (target < 8)` ); }
const st0 = I.storeys.get( 0 );
ok( st0.boxes.length > 20, `interior colliders (${st0.boxes.length})` );
ok( st0.meshes.length >= 1 && st0.meshes.every( m => m.visible || m.material !== C.mats.interior ), 'interior meshes visible' );
ok( ! C.shellBoxes.has( hi ), 'coarse shell box removed once the interior is in' );
// doors
const doors = [ ...C.doors.list ].filter( d => d.B.bi === hi );
ok( doors.length >= 2, `doors (${doors.length})` );
const front = doors.find( d => d.ext && d.kind === 'front' ) || doors.find( d => d.ext );
ok( !! front, 'an exterior door' );
ok( front.leaves.every( l => l.box.kind === 'door' ), 'closed door leaves are physics boxes of kind door' );
// look at it from outside: the prompt
const leaf = front.leaves[ 0 ];
const n = [ - Math.sin( leaf.yaw0 ), - Math.cos( leaf.yaw0 ) ]; // leaf plane normal (either side)
const eyeAt = ( side, dist ) => new THREE.Vector3( front.pos.x + n[ 0 ] * side * dist, front.rec.y + 1.6, front.pos.z + n[ 1 ] * side * dist );
let cands = provide( g, eyeAt( 1, 1.5 ), front.pos );
if ( ! cands.length || ! cands[ 0 ].id.startsWith( 'door:' ) ) cands = provide( g, eyeAt( - 1, 1.5 ), front.pos );
const dc = cands.find( c => c.id === 'door:' + front.key );
ok( !! dc, 'door interaction offered' );
front.locked = false;
const lbl0 = provide( g, eyeAt( 1, 1.5 ), front.pos ).concat( provide( g, eyeAt( - 1, 1.5 ), front.pos ) ).find( c => c.id === 'door:' + front.key )?.label;
ok( lbl0 === 'Open', `unlocked closed door says Open (${lbl0})` );
C.doors.toggle( front );
await run( g, 30 );
ok( front.open > 0.99, `door swings open (${front.open.toFixed( 2 )})` );
ok( g.log.noise.some( e => e.kind === 'door' ), 'door noise emitted' );
ok( C.doorAt( front.pos, 1.5 ) !== front, 'doorAt skips open doors' );
C.doors.toggle( front );
await run( g, 30 );
ok( front.open < 0.01, 'door closes' );
ok( C.doorAt( front.pos, 1.5 ) === front, 'doorAt finds the closed door' );
// the infected bash it with { source, kind }
const zombie = { type: 'zombie' };
const hp0 = front.hp;
front.bash( 25, { source: zombie, kind: 'zombie' } );
ok( front.hp < hp0, 'bash(amount, { source, kind }) damages the door' );
for ( let k = 0; k < 20 && ! front.broken; k ++ ) front.bash( 25, { source: zombie, kind: 'zombie' } );
ok( front.broken && front.target === 1, 'the door gives way' );
ok( C.doorAt( front.pos, 1.5 ) !== front, 'a broken door is no longer returned by doorAt' );
// a locked door: kick, pick, pry
const locked = doors.find( d => d !== front && d.ext ) || doors.find( d => d !== front );
locked.locked = true; locked.broken = false; locked.hp = 120; locked.target = locked.open = 0; C.doors._pose( locked );
const lookL = ( side ) => { const l = locked.leaves[ 0 ], nn = [ - Math.sin( l.yaw0 ), - Math.cos( l.yaw0 ) ]; return new THREE.Vector3( locked.pos.x + nn[ 0 ] * side * 1.4, locked.rec.y + 1.6, locked.pos.z + nn[ 1 ] * side * 1.4 ); };
const lockedCand = () => provide( g, lookL( 1 ), locked.pos ).concat( provide( g, lookL( - 1 ), locked.pos ) ).find( c => c.id === 'door:' + locked.key );
ok( lockedCand()?.label === 'Kick', `locked door without tools: Kick (${lockedCand()?.label})` );
g.player.inventory.counts.lockpick = 1;
ok( lockedCand()?.label === 'Pick lock', `with a lockpick: Pick lock (${lockedCand()?.label})` );
g.player.inventory.counts.lockpick = 0;
g.player.inventory.tools.add( 'pry' );
ok( lockedCand()?.label === 'Pry open', `with a pry tool: Pry open (${lockedCand()?.label})` );
lockedCand().action();
ok( g.actions.busy, 'prying is a timed action' );
await run( g, 200 );
ok( ! locked.locked, 'pried open' );
g.player.inventory.tools.clear();
// containers: search -> rolled loot -> the UI
g.log.opened.length = 0;
const conts = st0.containers;
ok( conts.length > 0, `containers (${conts.length}: ${conts.map( c => c.label ).join( ', ' )})` );
const cont = conts.find( c => ! c.locked ) || conts[ 0 ];
cont.locked = 0;
C.search( cont );
ok( g.actions.busy && g.actions.current.label === 'Searching', 'searching is a timed action' );
await run( g, 60 );
const opened = g.log.opened[ 0 ];
ok( !! opened && opened.key === cont.key && Array.isArray( opened.items ) && opened.capacity > 0, 'the container UI opens with its items' );
ok( opened.label === cont.label && opened.pos, 'container label and position' );
const items0 = JSON.stringify( opened.items.map( s => s.id ) );
// loose loot
ok( g.log.spawned.length > 0, `loose loot spawned via items3d (${g.log.spawned.length})` );
const it = g.log.spawned.find( x => g.items3d.list.has( x ) );
if ( it ) g.items3d.take( it );
// beds, taps
const beds = [ ...I.storeys.values() ].flatMap( s => s.beds );
const taps = [ ...I.storeys.values() ].flatMap( s => s.taps );
ok( taps.length > 0, `taps (${taps.length})` );
if ( taps.length ) { const tp = taps[ 0 ]; C.useTap( tp, false ); await run( g, 60 ); ok( tp.water ? g.log.drank.length > 0 : g.log.toasts.includes( 'No water' ), 'tap: drink or no water' ); }
// upstairs: the bedrooms and their beds
const [ ux, uz ] = C.toWorld( rec, ( hR.x0 + hR.x1 ) / 2, ( hR.z0 + hR.z1 ) / 2 );
g.player.pos.set( ux, hS.ys[ 1 ] + 0.01, uz );
await settle( g );
ok( I.storeys.get( 1 )?.ready, 'the upper storey loads when you are upstairs' );
const beds1 = [ ...I.storeys.values() ].flatMap( s => s.beds );
ok( beds1.length > 0, `beds (${beds1.length})` );
if ( beds1.length ) {
	const b = beds1[ 0 ];
	const o = new THREE.Vector3( b.x + 1.2 * Math.cos( b.yaw ), b.y + 1.2, b.z - 1.2 * Math.sin( b.yaw ) );
	const cb = provide( g, o, new THREE.Vector3( b.x, b.y, b.z ) ).find( c => c.id === 'bed:' + b.key );
	ok( cb?.label === 'Sleep' || cb?.label === 'Rest', `bed prompt (${cb?.label})` );
	cb?.action();
	ok( g.log.slept.length === 1, 'sleep called' );
}
ok( C.isIndoors( g.player.pos ), 'isIndoors inside' );
ok( ! C.isIndoors( new THREE.Vector3( fx, hf.heightAt( fx, fz ), fz ) ), 'not indoors in the street' );
ok( g.world.indoorTest && g.world.indoorTest( g.player.pos ) === true, 'world.indoorTest set' );
const bAt = C.buildingAt( g.player.pos );
ok( bAt && bAt.i === hi && bAt.storey === 1 && bAt.type === 'house', `buildingAt (${JSON.stringify( bAt )})` );
ok( g.log.toasts.every( t => t.length <= 40 ), 'toasts short: ' + g.log.toasts.join( ' | ' ) );

// ---- 2: save / load round trip ----------------------------------------------------------------------------------------
section( 'save / load / dispose' );
const save = { world: {} };
C.serialize( save );
ok( save.world.containers[ cont.key ], 'searched container saved' );
ok( save.world.doors[ front.key ]?.b === 1, 'broken door saved' );
ok( it ? save.world.looted[ it.key ] !== undefined : true, 'taken loose loot remembered' );
const boxes0 = g.physics.boxes.size;
C.dispose();
ok( g.physics.boxes.size === 0, `dispose removes every collider (left ${g.physics.boxes.size} of ${boxes0})` );
ok( ! g.scene.children.includes( C.group ), 'dispose removes the meshes' );
const js = JSON.parse( JSON.stringify( save ) );
g = makeGame( js );
install( g );
g.city.load( js );
const C2 = g.city;
g.player.pos.set( fx, hf.heightAt( fx, fz ), fz );
await settle( g );
const I2 = C2.interiors.get( hi );
ok( I2?.groundReady, 'reloaded interior in' );
const front2 = [ ...C2.doors.list ].find( d => d.key === front.key );
ok( front2 && front2.broken && front2.open > 0.99, 'the broken door stays broken and open' );
const cont2 = I2.storeys.get( 0 ).containers.find( c => c.key === cont.key );
C2.search( cont2 );
await run( g, 10 );
const op2 = g.log.opened.at( -1 );
ok( op2 && JSON.stringify( op2.items.map( s => s.id ) ) === items0, 'container contents persist' );
ok( ! it || ! g.log.spawned.some( x => x.key === it.key ), 'taken loose loot does not respawn' );

// ---- 3: queries -------------------------------------------------------------------------------------------------------
section( 'queries' );
const types = C2.types();
ok( types.length > 20 && types.includes( 'gas station' ) && types.includes( 'police station' ), `types (${types.length})` );
for ( const t of [ 'gas station', 'police', 'hospital', 'gun store', 'grocery', 'terminal', 'control tower', 'hotel', 'barracks', 'observatory' ] ) {
	const l = C2.locate( t, new THREE.Vector3( -4400, 0, -10250 ) );
	ok( l && Number.isFinite( l.x ) && l.name, `locate ${t}: ${l ? l.name + ' ' + l.x.toFixed( 0 ) + ',' + l.z.toFixed( 0 ) : 'none'}` );
}
ok( C2.locate( 'nonsense place' ) === null, 'locate unknown -> null' );
const pumps = C2.gasPumps();
ok( pumps.length > 20 && pumps.every( p => Number.isFinite( p.x + p.y + p.z ) ), `gas pumps (${pumps.length})` );

// ---- 4: a tower: lobby, stairs, upper floors, the integration budget -----------------------------------------------------
section( 'tower: lobby, upper floors, budget' );
const ti = find( ( r, S ) => S.arch === 'tower' && S.n >= 12, [ -4400, -10250 ] );
const trec = C2.rec( ti ), { S: tS, rect: tR } = C2.shape( ti );
const [ tx, tz ] = C2.toWorld( trec, ( tR.x0 + tR.x1 ) / 2, ( tR.z0 + tR.z1 ) / 2 );
g.player.pos.set( tx, tS.ys[ 0 ] + 0.01, tz );
worst = await settle( g );
const TI = C2.interiors.get( ti );
ok( TI?.groundReady, 'tower lobby in' );
{ const q = p99(); ok( worst < 8, `tower streams in: p99 ${q.toFixed( 1 )} ms, worst ${worst.toFixed( 1 )} ms` ); }
const k = Math.floor( tS.n / 2 );
g.player.pos.set( tx, tS.ys[ k ] + 0.01, tz );
worst = await settle( g );
ok( [ k - 1, k, k + 1 ].every( s => TI.storeys.get( s )?.ready ), `storeys around floor ${k} in: ${[ ...TI.storeys.keys() ].join( ',' )}` );
{ const q = p99(); ok( worst < 8, `upper floors: p99 ${q.toFixed( 1 )} ms, worst ${worst.toFixed( 1 )} ms` ); }
// the coarse boxes fill the storeys that aren't in, never the one you stand in
const coarseHit = TI.coarse.some( b => b.minY < g.player.pos.y + 1.7 && b.maxY > g.player.pos.y );
ok( ! coarseHit, 'no coarse box where the player stands' );
ok( C2.buildingAt( g.player.pos )?.storey === k, 'buildingAt reports the storey' );
// a save loaded (or a teleport) straight onto a high floor: the player stays on it while its storey streams in
g.player.pos.set( tx + 700, hf.heightAt( tx + 700, tz ), tz );
await run( g, 30 ); await settle( g, 300 );
const kk = Math.min( tS.n - 2, 9 );
g.player.pos.set( tx, tS.ys[ kk ] + 0.01, tz );
for ( let f = 0; f < 400; f ++ ) {
	await run( g, 1 );
	// gravity and the collision resolve, as the player does (from when the building's shell is in: the game
	// holds the curtain while the surroundings stream after a load)
	if ( ! C2.nearReady[ ti ] ) continue;
	const gr = g.physics.ground( g.player.pos.x, g.player.pos.z, g.player.pos.y + 0.45, 0.45, 0.3 );
	g.player.pos.y = Math.max( gr.y, g.player.pos.y - 9.8 / 30 / 3 );
	g.physics.resolveCylinder( g.player.pos, 0.3, 1.75, 0.45 );
	if ( C2.interiors.get( ti )?.storeys.get( kk )?.ready && f > 60 ) break;
	if ( g.world.pool.busy ) await new Promise( r => setTimeout( r, 2 ) );
}
ok( Math.abs( g.player.pos.y - tS.ys[ kk ] ) < 0.5 && Math.hypot( g.player.pos.x - tx, g.player.pos.z - tz ) < 1, `teleported onto floor ${kk}: still there (y ${( g.player.pos.y - tS.ys[ kk ] ).toFixed( 2 )}, moved ${Math.hypot( g.player.pos.x - tx, g.player.pos.z - tz ).toFixed( 2 )} m)` );
// walk away: everything unloads
g.player.pos.set( tx + 600, hf.heightAt( tx + 600, tz ), tz );
await run( g, 30 );
await settle( g, 300 );
ok( ! C2.interiors.has( ti ), 'interior dropped when far' );
C2.dispose();
ok( g.physics.boxes.size === 0, `no leaked colliders after dispose (${g.physics.boxes.size})` );

console.log( `\n${passes} passed, ${fails} failed` );
for ( const w of workers ) w.terminate();
process.exit( fails ? 1 : 0 );
