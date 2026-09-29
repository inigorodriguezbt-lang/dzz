// Standalone preview of the buildings module: the world (terrain, sky, ocean) + game.city only.
// /test/preview/buildings.html?at=X,Z&yaw=DEG&pitch=DEG&h=M&hour=H
// window.__view( x, z, h, yaw, pitch, hour, feetY? ) moves the camera (and the "player" under it),
// window.__idle() -> true once no building job is pending.
import * as THREE from 'three';
import { Settings } from '../../src/core/Settings.js';
import { Renderer } from '../../src/render/Renderer.js';
import { World } from '../../src/game/World.js';
import { Physics } from '../../src/game/Physics.js';
import { Events } from '../../src/core/Events.js';
import { install } from '../../src/city/Buildings.js';
import '../../src/game/items/defs/index.js';

const q = new URLSearchParams( location.search );
const info = document.getElementById( 'info' );
const settings = new Settings();
const canvas = document.getElementById( 'view' );
const renderer = new Renderer( canvas, settings );
const world = new World( renderer, settings );
await world.load( ( s, p ) => { info.textContent = s + ' ' + Math.round( p * 100 ) + '%'; } );
const resize = () => { renderer.resize( innerWidth, innerHeight ); world.camera.aspect = innerWidth / innerHeight; world.camera.updateProjectionMatrix(); world.sky.resize( renderer.width, renderer.height ); };
resize(); addEventListener( 'resize', resize );

const cam = world.camera;
const systems = [];
const game = {
	world, scene: world.scene, camera: cam, hf: world.hf, settings, seed: 1234, events: new Events(),
	physics: new Physics( world.hf, world.ocean ),
	interact: { providers: [], addProvider( fn ) { this.providers.push( fn ); return () => {}; } },
	player: { pos: new THREE.Vector3(), inventory: { count: () => 0, hasTool: () => false, find: () => null }, shake: 0 },
	actions: { start( a ) { window.__lastAction = a.label; a.onDone && a.onDone(); } },
	audio: { play( n ) { ( window.__sounds = window.__sounds || [] ).push( n ); } },
	time: { hours: 34 },
	toast( t ) { ( window.__toasts = window.__toasts || [] ).push( t ); },
	register( s ) { systems.push( s ); return s; },
	sleep( h, q ) { window.__slept = [ h, q ]; return true; },
	survival: { stamina: 100, useStamina() {}, drink( d, l, k ) { window.__drank = [ l, k ]; } },
	app: { ui: { openContainer( c ) { window.__lastContainer = c; } } },
	// a stand-in for the items module: records what the buildings put down
	items3d: {
		list: [], fns: [],
		spawn( stack, pos, o ) { const it = { stack, pos: pos.clone(), key: o.key, yaw: o.yaw, removed: false }; this.list.push( it ); return it; },
		remove( it ) { it.removed = true; },
		addTakenListener( fn ) { this.fns.push( fn ); return () => {}; },
	},
};
game.events.on( 'noise', e => { ( window.__noises = window.__noises || [] ).push( e.kind + ':' + Math.round( e.radius ) ); } );
window.__game = game;
window.THREE = THREE;
install( game );

window.__view = ( x, z, h = 1.7, yaw = 0, pitch = 0, hr = 10, feetY = null ) => {
	const gy = feetY ?? Math.max( world.hf.heightAt( x, z ), 0 );
	cam.position.set( x, gy + h, z );
	cam.rotation.set( pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ' );
	cam.updateMatrixWorld();
	world.sky.setTime( hr, 120 );
	game.player.pos.set( x, gy, z );
};
window.__look = ( x, y, z ) => { cam.lookAt( x, y, z ); cam.updateMatrixWorld(); };
// stand inside building bi at building-local (fx, fz) as fractions of its built rect, on storey si, looking
// along the building's local direction yawDeg (0 = towards the back)
window.__inside = ( bi, fx = 0.5, fz = 0.5, si = 0, yawDeg = 0, pitch = 0, hr = 10 ) => {
	const C = game.city, r = C.rec( bi ), { S, rect } = C.shape( bi );
	const lx = rect.x0 + ( rect.x1 - rect.x0 ) * fx, lz = rect.z0 + ( rect.z1 - rect.z0 ) * fz;
	const [ x, z ] = C.toWorld( r, lx, lz );
	// building local +z is world ( -sin a, cos a ); a camera with yaw t looks along ( -sin t, -cos t )
	const t = Math.PI - r.angle + yawDeg * Math.PI / 180;
	window.__view( x, z, 1.6, t * 180 / Math.PI, pitch, hr, S.ys[ si ] );
	return { x, z, y: S.ys[ si ] };
};
// look at building bi from a point d metres in front of it (the street side), h up
window.__front = ( bi, d = 25, h = 1.7, side = 0, hr = 10, lookUp = 0.3 ) => {
	const C = game.city, r = C.rec( bi ), { S, rect } = C.shape( bi );
	const dirs = [ [ 0, - 1 ], [ 1, 0 ], [ 0, 1 ], [ - 1, 0 ] ][ side ];
	const cx = ( rect.x0 + rect.x1 ) / 2, cz = ( rect.z0 + rect.z1 ) / 2;
	const ex = side === 1 ? rect.x1 : side === 3 ? rect.x0 : cx, ez = side === 0 ? rect.z0 : side === 2 ? rect.z1 : cz;
	const [ x, z ] = C.toWorld( r, ex + dirs[ 0 ] * d, ez + dirs[ 1 ] * d );
	window.__view( x, z, h, 0, 0, hr );
	const [ tx, tz ] = C.toWorld( r, cx, cz );
	window.__look( tx, S.fy + ( S.top - S.fy ) * lookUp, tz );
	return { x, z };
};
window.__idle = () => world.pool.busy === 0 && game.city.queue.length === 0;
const [ x, z ] = ( q.get( 'at' ) || '-5000,-9950' ).split( ',' ).map( Number );
window.__view( x, z, + ( q.get( 'h' ) || 1.7 ), + ( q.get( 'yaw' ) || 0 ), + ( q.get( 'pitch' ) || 0 ), + ( q.get( 'hour' ) || 10 ) );
if ( q.get( 'look' ) ) window.__look( ...q.get( 'look' ).split( ',' ).map( Number ) );

let last = performance.now();
window.__frames = 0;
function loop() {
	const now = performance.now();
	const dt = Math.min( 0.1, ( now - last ) / 1000 ); last = now;
	for ( const s of systems ) s.update( dt );
	world.update( dt );
	renderer.render( { scene: world.scene, camera: cam, grade: { exposure: 1.0 + world.sky.night * 1.4, night: world.sky.night, time: world.clock } } );
	const r = renderer.gl.info.render;
	info.textContent = `calls ${r.calls} tris ${( r.triangles / 1e3 ).toFixed( 0 )}k  far ${game.city.far.size} near ${game.city.near.size} int ${game.city.interiors.size} q ${game.city.queue.length} busy ${world.pool.busy}`;
	window.__frames ++;
	requestAnimationFrame( loop );
}
await world.warmup( () => {} );
window.__ready = true;
loop();

// gameplay checks on the loaded interiors around the camera: doors, locks, containers, loot, beds, taps,
// queries and save / load. Returns a report (used by test/preview/buildings-shots.mjs views with js).
window.__check = async ( bi ) => {
	const C = game.city, rep = {};
	const tick = async ( s ) => { for ( let t = 0; t < s; t += 0.05 ) { for ( const sy of systems ) sy.update( 0.05 ); } };
	const I = C.interiors.get( bi );
	if ( ! I ) return { error: 'no interior for ' + bi, have: [ ...C.interiors.keys() ] };
	rep.storeys = [ ...I.storeys.values() ].map( st => ( { si: st.si, ready: st.ready, boxes: st.boxes.length, doors: st.doors.length, containers: st.containers.length, beds: st.beds.length, taps: st.taps.length, items: st.items.length } ) );
	rep.groundReady = I.groundReady;
	rep.coarse = I.coarse.length;
	const st = I.storeys.get( 0 );
	// doors
	const doors = st.doors;
	const d = doors.find( x => ! x.locked ) || doors[ 0 ];
	if ( d ) {
		const b = d.leaves[ 0 ].box, yaw0 = b.yaw;
		const wasLocked = d.locked;
		d.locked = false;
		C.doors.toggle( d );
		await tick( 1.2 );
		rep.door = { kind: d.kind, open: +d.open.toFixed( 2 ), yawMoved: +( b.yaw - yaw0 ).toFixed( 2 ), inPhysics: game.physics.boxes.has( b.id ) };
		C.doors.toggle( d ); await tick( 1.2 );
		rep.door.closedAgain = +d.open.toFixed( 2 );
		d.locked = wasLocked;
		// the infected break it down
		const near = C.doorAt( d.pos, 1.5 );
		rep.doorAt = near === d;
		let hits = 0;
		while ( ! d.broken && hits < 200 ) { d.bash( 20, { source: null, kind: 'zombie' } ); hits ++; }
		await tick( 1 );
		rep.bash = { hits, broken: d.broken, open: +d.open.toFixed( 2 ) };
	}
	// a locked door: kick
	const ld = doors.find( x => x.locked && ! x.broken );
	if ( ld ) { let k = 0; while ( ! ld.broken && k < 60 ) { C.doors.kick( ld ); k ++; } rep.kick = { kicks: k, broken: ld.broken, kind: ld.kind }; }
	// interaction prompt at a door: aim the camera at its centre
	const pd = doors.find( x => ! x.broken );
	if ( pd ) {
		const p = pd.pos;
		const o = new THREE.Vector3( p.x, p.y + 0.2, p.z ), n = pd.rec.axis === 'x' ? [ 0, 1 ] : [ 1, 0 ];
		const r = C.rec( bi );
		const wn = [ n[ 0 ] * r.c - n[ 1 ] * r.s, n[ 0 ] * r.s + n[ 1 ] * r.c ];
		o.x += wn[ 0 ] * 1.5; o.z += wn[ 1 ] * 1.5;
		const dir = new THREE.Vector3( - wn[ 0 ], 0, - wn[ 1 ] );
		const cands = game.interact.providers.flatMap( f => f( { origin: o, dir }, 4 ) || [] );
		rep.prompt = cands.map( c => c.label + ( c.sub ? '/' + c.sub : '' ) );
	}
	// containers
	const c = st.containers.find( x => ! x.locked ) || st.containers[ 0 ];
	if ( c ) {
		window.__lastContainer = null;
		C.search( c );
		const lc = window.__lastContainer;
		rep.container = { label: c.label, table: c.table, action: window.__lastAction, opened: !! lc, items: lc ? lc.items.map( s => s.id + 'x' + s.qty ) : null, cap: lc?.capacity };
		// the same contents next time
		const again = C._container( c );
		rep.container.same = again === lc;
	}
	const lk = st.containers.find( x => x.locked );
	if ( lk ) { window.__toasts = []; C.search( lk ); rep.locked = { label: lk.label, toasts: window.__toasts.slice() }; }
	// loose loot
	rep.loot = game.items3d.list.filter( it => ! it.removed ).length;
	const first = game.items3d.list.find( it => ! it.removed );
	if ( first ) { for ( const fn of game.items3d.fns ) fn( first, first.stack ); rep.looted = Object.keys( C.saved.looted ).length; }
	// beds and taps
	if ( st.beds[ 0 ] || I.storeys.get( 1 )?.beds[ 0 ] ) rep.bed = ( st.beds[ 0 ] || I.storeys.get( 1 ).beds[ 0 ] ).label;
	if ( st.taps[ 0 ] ) { window.__toasts = []; C.useTap( st.taps[ 0 ], false ); rep.tap = { water: st.taps[ 0 ].water, drank: window.__drank || null, toasts: window.__toasts.slice() }; }
	// queries
	const r = C.rec( bi ), { S, rect } = C.shape( bi );
	const [ ix, iz ] = C.toWorld( r, ( rect.x0 + rect.x1 ) / 2, ( rect.z0 + rect.z1 ) / 2 );
	const inside = new THREE.Vector3( ix, S.fy + 0.1, iz );
	rep.buildingAt = C.buildingAt( inside );
	rep.indoors = C.isIndoors( inside );
	rep.outdoors = C.isIndoors( new THREE.Vector3( ix, S.top + 5, iz ) );
	rep.locate = C.locate( 'gun store', inside );
	rep.types = C.types().length;
	rep.pumps = C.gasPumps().length;
	// save and load
	const save = { world: {} };
	C.serialize( save );
	rep.save = { doors: Object.keys( save.world.doors ).length, containers: Object.keys( save.world.containers ).length, looted: Object.keys( save.world.looted ).length };
	C.load( JSON.parse( JSON.stringify( save ) ) );
	rep.reload = { doors: Object.keys( C.doors.saved ).length, containers: Object.keys( C.saved.containers ).length };
	rep.noises = ( window.__noises || [] ).slice( 0, 8 );
	rep.sounds = [ ...new Set( window.__sounds || [] ) ];
	return rep;
};

// stand on the street nearest to building bi's front and look at it
window.__street = ( bi, hr = 10, up = 0.35, back = 0 ) => {
	const C = game.city, r = C.rec( bi ), { S, rect } = C.shape( bi );
	const [ fx, fz ] = C.toWorld( r, ( rect.x0 + rect.x1 ) / 2, rect.z0 );
	let best = null;
	for ( const s of world.meta.streets ) {
		const ax = s[ 1 ], az = s[ 2 ], bx = s[ 4 ], bz = s[ 5 ];
		const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
		const t = Math.max( 0, Math.min( 1, ( ( fx - ax ) * dx + ( fz - az ) * dz ) / l2 ) );
		const px = ax + dx * t, pz = az + dz * t, d = Math.hypot( px - fx, pz - fz );
		if ( ! best || d < best.d ) best = { d, px, pz };
	}
	let { px, pz } = best;
	if ( back ) { const d = Math.hypot( px - fx, pz - fz ) || 1; px += ( px - fx ) / d * back; pz += ( pz - fz ) / d * back; }
	window.__view( px, pz, 1.7, 0, 0, hr );
	const [ cx, cz ] = C.toWorld( r, ( rect.x0 + rect.x1 ) / 2, ( rect.z0 + rect.z1 ) / 2 );
	window.__look( cx, S.fy + ( S.top - S.fy ) * up, cz );
	return { d: best.d.toFixed( 1 ) };
};
