// Vehicle checks in the full game (dev only, not shipped): boots once, then runs steps from a JSON file.
//   node test/preview/vehicles-game.mjs <port> <outdir> <steps.json> "<query incl. &frames=2>"
// steps: [ { js: "expression (window.__app / g = game / V = game.vehicles)", run: frames to simulate, until: "stop early when true", keys: [ 'KeyW', ... ],
//            shot: "name" } ]. The page's own loop stops after a couple of frames; the game is stepped here at
// 30 fps with gameplay input on (the keys are held for that step), and the canvas is captured for a shot.
import fs from 'node:fs';
import { launch, lean } from '../lib/browser.mjs';

const [ port, outdir, stepsFile, query = 'quick=1&mode=creative&frames=2' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
await lean( page );
await page.addInitScript( ( rd ) => {
	try { localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { antialias: 'fxaa', shadows: 'medium', renderDistance: rd, clouds: 'off', water: 'medium', tutorial: false } ) ); } catch ( e ) { /* ignore */ }
}, Number( process.env.RD || 900 ) ); // RD=500 when memory is tight
const logs = [];
page.on( 'crash', () => { console.log( 'PAGE CRASHED\n' + logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'GPU stall' ) ) logs.push( `[${m.type()}] ${t.slice( 0, 300 )}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/?${query}` );
try { await page.waitForFunction( () => window.__ready === true && window.__app?.game, null, { timeout: 480000, polling: 1000 } ); } catch ( e ) {
	console.log( 'TIMEOUT waiting for ready\n' + logs.slice( - 40 ).join( '\n' ) );
	console.log( await page.evaluate( () => document.querySelector( '.loader-status' )?.textContent ) );
	await browser.close(); process.exit( 1 );
}
console.log( `ready ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
for ( const s of steps ) {
	const t1 = Date.now();
	const r = await page.evaluate( async ( s ) => {
		const a = window.__app, g = a.game, V = g.vehicles;
		const yieldNow = () => new Promise( r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage( 0 ); } );
		let out;
		if ( s.js ) { try { out = await ( 0, eval )( `( async ( a, g, V ) => ( ${s.js} ) )` )( a, g, V ); } catch ( e ) { out = 'error: ' + e.message; } }
		const until = s.until ? ( 0, eval )( `( a, g, V ) => ( ${s.until} )` ) : null;
		for ( let i = 0; i < ( s.run || 0 ); i ++ ) {
			if ( until && until( a, g, V ) ) break;
			for ( const k of s.keys || [] ) { a.input.down.add( k ); if ( i === 0 ) a.input.pressedQ.add( k ); }
			g.inputActive = true; a.input.enabled = true;
			g.update( 1 / 30 );
			a.world.update( 1 / 30 );
			a.input.endFrame();
			await yieldNow();
			if ( a.world.pool.busy ) await new Promise( r => setTimeout( r, 5 ) );
		}
		for ( const k of s.keys || [] ) a.input.down.delete( k );
		let url = null;
		if ( s.shot ) {
			a.world.update( 0.001 );
			a.renderer.render( { scene: a.world.scene, camera: a.world.camera, viewScene: g.player.vehicle ? null : g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
			url = a.canvas.toDataURL( 'image/png' );
		}
		return { out, url };
	}, s );
	if ( r.out !== undefined ) console.log( ( s.shot || s.js?.slice( 0, 40 ) || '' ) + ': ' + JSON.stringify( r.out ) );
	if ( r.url ) fs.writeFileSync( `${outdir}/${s.shot}.png`, Buffer.from( r.url.split( ',' )[ 1 ], 'base64' ) );
	if ( s.shot ) console.log( `shot ${s.shot} ${( ( Date.now() - t1 ) / 1000 ).toFixed( 1 )} s` );
}
console.log( logs.slice( 0, 60 ).join( '\n' ) );
await browser.close();
