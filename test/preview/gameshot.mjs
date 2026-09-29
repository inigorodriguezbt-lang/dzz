// Full-game capture for the vegetation checks (not shipped):
//   node test/preview/gameshot.mjs <port> <out.png> "<query incl. &frames=2>" ["<js expr to print>"]
// Waits for the game, then for the vegetation around the player to stream in, then renders one frame
// and grabs the canvas (a page screenshot takes minutes under SwiftShader).
import fs from 'node:fs';
import { chromium } from 'playwright';

const [ port, out, query, expr ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 800, height: 450 } } );
// lighter settings keep the SwiftShader renderer inside the shared memory limit
await page.addInitScript( () => {
	try { localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { antialias: 'fxaa', shadows: 'medium', renderDistance: 900, clouds: 'off', water: 'medium', tutorial: false } ) ); } catch ( e ) { /* ignore */ }
} );
const logs = [];
page.on( 'crash', () => { logs.push( 'PAGE CRASHED' ); console.log( logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { if ( ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/?${query}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 480000, polling: 1000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
const tReady = Date.now();
// the page loop stops after a couple of frames (&frames=2 in the query); step the game here without
// drawing until the streaming around the player is done (SwiftShader frames take seconds each)
const settled = await page.evaluate( async () => {
	const a = window.__app, g = a.game;
	let calm = 0, i = 0;
	const t0 = performance.now();
	for ( ; i < 1500 && calm < 12 && performance.now() - t0 < 300000; i ++ ) {
		g.update( 0.016 );
		a.world.update( 0.016 );
		const busy = a.world.pool.busy, veg = g.vegetation?.pending ?? 0;
		calm = busy === 0 && veg === 0 ? calm + 1 : 0;
		if ( i % 50 === 0 ) console.log( `step ${i} ${( ( performance.now() - t0 ) / 1000 ).toFixed( 0 )} s: pool ${busy} veg ${veg} ${document.visibilityState}` );
		// yield to the event loop (worker results) without timer throttling
		await new Promise( r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage( 0 ); } );
		if ( busy ) await new Promise( r => setTimeout( r, 10 ) );
	}
	return i;
} );
logs.push( `settled after ${settled} steps` );
// HIDE=veg,<object name>,... hides parts of the scene for the capture (to find what breaks a render)
const url = await page.evaluate( ( hide ) => {
	const a = window.__app, g = a.game;
	if ( ! g ) return null;
	// veg: the whole vegetation, veg:<text>: the vegetation meshes whose name contains it, else an object name
	if ( hide ) for ( const k of hide.split( ',' ) ) {
		if ( k.startsWith( 'veg:' ) ) { for ( const m of g.vegetation.group.children ) if ( m.name.includes( k.slice( 4 ) ) ) m.layers.disableAll(); continue; }
		const o = k === 'veg' ? g.vegetation?.group : g.scene.getObjectByName( k );
		if ( o ) o.visible = false;
	}
	a.world.update( 0.016 );
	a.renderer.render( { scene: a.world.scene, camera: a.world.camera, viewScene: g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
	return a.canvas.toDataURL( 'image/png' );
}, process.env.HIDE || '' );
if ( url ) fs.writeFileSync( out, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
if ( expr ) { try { console.log( JSON.stringify( await page.evaluate( expr ) ) ); } catch ( e ) { console.log( 'eval error', e.message ); } }
console.log( `ready ${( ( tReady - t0 ) / 1000 ).toFixed( 0 )} s, total ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
console.log( logs.filter( l => ! l.includes( 'GPU stall' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
