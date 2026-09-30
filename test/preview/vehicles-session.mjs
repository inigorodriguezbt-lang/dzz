// Vehicle checks in the full game (dev only, not shipped): one boot, then a list of steps, JPEG shots.
//   node test/preview/vehicles-session.mjs <port> <outdir> <steps.json> "<query incl. &frames=2>"
// The page's own loop stops after a couple of frames (frames=2); the game is stepped here at 30 fps with gameplay
// input on. steps: [ { js: "expression before the run (a = app, g = game, V = game.vehicles, T = helpers)",
//   run: frames, until: "stop early when true", keys: [ 'KeyW', ... ] (held for the run), post: "expression after
//   the run", shot: "name" } ]
// Helpers (T): T.V3(x, y, z); T.near(dx, dz) a point beside the player; T.summon(type, dx, dz, yawDeg);
// T.cam(v, [ lx, ly, lz ], [ tx, ty, tz ], fov) puts the camera in a vehicle's frame; T.at(x, y, z, yawDeg, pitchDeg)
// parks the (flying) player; T.hour(h) sets the time of day.
import fs from 'node:fs';
import { launch, lean } from '../lib/browser.mjs';

const [ port, outdir, stepsFile, query = 'quick=1&mode=creative&frames=2' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const W = + ( process.env.W || 960 ), H = + ( process.env.H || 540 );
const browser = await launch( process.env.PRECISE ? [ '--enable-precise-memory-info' ] : [] );
const page = await browser.newPage( { viewport: { width: W, height: H } } );
await lean( page );
await page.addInitScript( ( rd ) => {
	try { localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { antialias: 'fxaa', shadows: 'medium', renderDistance: rd, clouds: 'off', water: 'medium', tutorial: false } ) ); } catch ( e ) { /* ignore */ }
}, Number( process.env.RD || 600 ) );
const logs = [];
let closing = false;
page.on( 'crash', async () => { console.log( 'PAGE CRASHED\n' + logs.slice( - 30 ).join( '\n' ) ); if ( ! closing ) { closing = true; await browser.close(); } process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'GPU stall' ) ) logs.push( `[${m.type()}] ${t.slice( 0, 400 )}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message} ${e.stack?.split( '\n' ).slice( 0, 3 ).join( ' | ' )}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/?${query}` );
try { await page.waitForFunction( () => window.__ready === true && window.__app?.game, null, { timeout: 300000, polling: 1000 } ); } catch ( e ) {
	console.log( 'TIMEOUT waiting for ready\n' + logs.slice( - 40 ).join( '\n' ) );
	await browser.close(); process.exit( 1 );
}
console.log( `ready ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
await page.evaluate( () => {
	const a = window.__app, g = a.game;
	const V3 = g.player.pos.constructor, Q = g.camera.quaternion.constructor;
	const I = a.input;
	Object.defineProperty( I, 'locked', { get: () => true, set: () => {}, configurable: true } );
	window.T = {
		V3: ( x, y, z ) => new V3( x, y, z ),
		near( dx, dz ) { const p = g.player.pos, y = g.player.yaw; const s = Math.sin( y ), c = Math.cos( y ); return new V3( p.x + dx * c - dz * s, p.y, p.z - dx * s - dz * c ); },
		summon( type, dx = 0, dz = - 8, yawDeg = null ) { const p = this.near( dx, dz ); return g.vehicles.summon( type, p, yawDeg == null ? {} : { yaw: yawDeg * Math.PI / 180 } ); },
		cam( v, l, t, fov ) {
			const cam = a.world.camera;
			const o = v.object;
			o.updateMatrixWorld( true );
			cam.position.set( ...l ).applyMatrix4( o.matrixWorld );
			const tt = new V3( ...t ).applyMatrix4( o.matrixWorld );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( tt );
			if ( fov ) { cam.fov = fov; cam.updateProjectionMatrix(); }
			cam.updateMatrixWorld();
			return true;
		},
		at( x, y, z, yawDeg = 0, pitchDeg = 0 ) { const p = g.player; p.flying = true; p.pos.set( x, y, z ); p.vel.set( 0, 0, 0 ); p.yaw = yawDeg * Math.PI / 180; p.pitch = pitchDeg * Math.PI / 180; return true; },
		hour( h ) { g.time.hours = Math.floor( g.time.hours / 24 ) * 24 + h; return true; },
		Q,
	};
} );
for ( const s of steps ) {
	const t1 = Date.now();
	let r;
	try {
		r = await page.evaluate( async ( s ) => {
			const a = window.__app, g = a.game, V = g.vehicles, T = window.T;
			const yieldNow = () => new Promise( r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage( 0 ); } );
			const ev = async ( src ) => { try { return await ( 0, eval )( `( async ( a, g, V, T ) => ( ${src} ) )` )( a, g, V, T ); } catch ( e ) { return 'error: ' + e.message + ' ' + ( e.stack || '' ).split( '\n' ).slice( 1, 3 ).join( ' | ' ); } };
			let out, post;
			if ( s.js ) out = await ev( s.js );
			const until = s.until ? ( 0, eval )( `( a, g, V, T ) => ( ${s.until} )` ) : null;
			let n = 0;
			for ( let i = 0; i < ( s.run || 0 ); i ++ ) {
				if ( until && until( a, g, V, T ) ) break;
				for ( const k of s.keys || [] ) { a.input.down.add( k ); if ( i === 0 ) a.input.pressedQ.add( k ); }
				g.inputActive = true; a.input.enabled = true;
				g.update( 1 / 30 );
				a.world.update( 1 / 30 );
				a.input.endFrame();
				n ++;
				await yieldNow();
				if ( a.world.pool?.busy ) await new Promise( r => setTimeout( r, 5 ) );
			}
			for ( const k of s.keys || [] ) a.input.down.delete( k );
			if ( s.post ) post = await ev( s.post );
			let url = null;
			if ( s.shot ) {
				a.world.update( 0.001 );
				a.renderer.render( { scene: a.world.scene, camera: a.world.camera, viewScene: g.player.vehicle ? null : g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
				url = a.canvas.toDataURL( 'image/jpeg', 0.85 );
			}
			return { out, post, url, n };
		}, s );
	} catch ( e ) { console.log( 'step error', e.message.split( '\n' )[ 0 ] ); break; }
	const label = s.name || s.shot || s.js?.slice( 0, 50 ) || '';
	if ( r.out !== undefined || r.post !== undefined ) console.log( label + ': ' + JSON.stringify( r.out ) + ( r.post !== undefined ? ' | ' + JSON.stringify( r.post ) : '' ) + ( s.run ? ` (${r.n} frames)` : '' ) );
	if ( r.url ) fs.writeFileSync( `${outdir}/${s.shot}.jpg`, Buffer.from( r.url.split( ',' )[ 1 ], 'base64' ) );
	if ( s.shot ) console.log( `shot ${s.shot} ${( ( Date.now() - t1 ) / 1000 ).toFixed( 1 )} s` );
}
console.log( logs.filter( l => ! l.startsWith( '[debug]' ) ).slice( 0, 80 ).join( '\n' ) );
closing = true;
await browser.close();
