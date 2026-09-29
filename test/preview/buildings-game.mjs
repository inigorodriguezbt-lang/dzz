// Buildings checks in the full game (dev only, not shipped): boots once, then runs steps from a JSON file.
//   node test/preview/buildings-game.mjs <port> <outdir> <steps.json> "<query incl. &frames=2>"
// steps: [ { js: "expression (a = app, g = game, C = game.city)", run: frames to simulate, until: "stop early when true",
//            keys: [ 'KeyW', ... ], shot: "name" } ]. The page's own loop stops after a couple of frames; the game is
// stepped here at 30 fps with gameplay input on, and the canvas is captured for a shot (JPEG).
// Each step with `run` also reports the main-thread cost of game.city.update (mean / max ms).
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
}, Number( process.env.RD || 900 ) );
const logs = [];
page.on( 'crash', () => { console.log( 'PAGE CRASHED\n' + logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'GPU stall' ) && ! t.includes( 'GL_INVALID_OPERATION' ) ) logs.push( `[${m.type()}] ${t.slice( 0, 400 )}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/?${query}` );
try { await page.waitForFunction( () => window.__ready === true && window.__app?.game, null, { timeout: 480000, polling: 1000 } ); } catch ( e ) {
	console.log( 'TIMEOUT waiting for ready\n' + logs.slice( - 40 ).join( '\n' ) );
	await browser.close(); process.exit( 1 );
}
console.log( `ready ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
await page.evaluate( () => {
	// time game.city.update
	const C = window.__app.game.city;
	if ( ! C ) return;
	const up = C.update.bind( C );
	window.__cityT = [];
	C.update = ( dt ) => { const t = performance.now(); up( dt ); window.__cityT.push( performance.now() - t ); };
	// the slowest steps of the city's integration generators (label: generator + step index)
	for ( const k of [ '_storeyGen', '_cellGen', '_clearGen' ] ) {
		const f = C[ k ].bind( C );
		C[ k ] = function * ( ...args ) {
			const it = f( ...args );
			for ( let step = 0; ; step ++ ) {
				const t = performance.now();
				const r = it.next();
				const d = performance.now() - t;
				const key = k + ':' + step, p = window.__prof[ key ] = window.__prof[ key ] || { n: 0, max: 0, sum: 0 };
				p.n ++; p.sum += d; p.max = Math.max( p.max, d );
				if ( r.done ) return r.value;
				yield r.value;
			}
		};
	}
	// the slowest calls of the city's internals
	window.__prof = {};
	for ( const k of [ '_stream', '_interiors', '_integrate', '_cellReady', '_lights', '_coarse', '_shellBoxes', '_dropInterior', '_dropStorey' ] ) {
		const f = C[ k ].bind( C );
		C[ k ] = ( ...args ) => { const t = performance.now(); const r = f( ...args ); const d = performance.now() - t; const p = window.__prof[ k ] = window.__prof[ k ] || { n: 0, max: 0, sum: 0 }; p.n ++; p.sum += d; p.max = Math.max( p.max, d ); return r; };
	}
} );
for ( const s of steps ) {
	const t1 = Date.now();
	const r = await page.evaluate( async ( s ) => {
		const a = window.__app, g = a.game, C = g.city;
		const yieldNow = () => new Promise( r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage( 0 ); } );
		let out;
		if ( s.js ) { try { out = await ( 0, eval )( `( async ( a, g, C ) => ( ${s.js} ) )` )( a, g, C ); } catch ( e ) { out = 'error: ' + e.message + ' ' + e.stack?.split( '\n' )[ 1 ]; } }
		const until = s.until ? ( 0, eval )( `( a, g, C ) => ( ${s.until} )` ) : null;
		window.__cityT = []; window.__prof = {};
		let n = 0;
		for ( let i = 0; i < ( s.run || 0 ); i ++ ) {
			if ( until && until( a, g, C ) ) break;
			for ( const k of s.keys || [] ) { a.input.down.add( k ); if ( i === 0 ) a.input.pressedQ.add( k ); }
			g.inputActive = true; a.input.enabled = true;
			g.update( 1 / 30 );
			a.world.update( 1 / 30 );
			a.input.endFrame();
			n ++;
			await yieldNow();
			if ( a.world.pool.busy ) await new Promise( r => setTimeout( r, 5 ) );
		}
		for ( const k of s.keys || [] ) a.input.down.delete( k );
		const T = window.__cityT;
		const perf = T.length ? { frames: n, cityMean: +( T.reduce( ( p, q ) => p + q, 0 ) / T.length ).toFixed( 2 ), cityMax: +Math.max( ...T ).toFixed( 2 ) } : null;
		let url = null, info = null;
		if ( s.shot ) {
			a.world.update( 0.001 );
			a.renderer.render( { scene: a.world.scene, camera: a.world.camera, viewScene: g.player.vehicle ? null : g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
			url = a.canvas.toDataURL( 'image/jpeg', 0.85 );
			const ri = a.renderer.gl.info.render;
			info = { heap: Math.round( ( performance.memory?.usedJSHeapSize || 0 ) / 1e6 ) + 'MB', calls: ri.calls, tris: Math.round( ri.triangles / 1000 ) + 'k', far: C?.far.size, near: C?.near.size, int: C?.interiors.size, q: C?.queue.length, busy: a.world.pool.busy };
		}
		if ( perf ) perf.prof = Object.fromEntries( Object.entries( window.__prof ).filter( ( [ k, v ] ) => v.max > 1 ).map( ( [ k, v ] ) => [ k, v.n + 'x max ' + v.max.toFixed( 1 ) + ' sum ' + v.sum.toFixed( 0 ) ] ) );
		if ( perf ) perf.heap = Math.round( ( performance.memory?.usedJSHeapSize || 0 ) / 1e6 );
		return { out, url, perf, info };
	}, s );
	if ( r.out !== undefined ) console.log( ( s.shot || s.name || s.js?.slice( 0, 40 ) || '' ) + ': ' + JSON.stringify( r.out ) );
	if ( r.perf ) console.log( '  perf', JSON.stringify( r.perf ) );
	if ( r.url ) fs.writeFileSync( `${outdir}/${s.shot}.jpg`, Buffer.from( r.url.split( ',' )[ 1 ], 'base64' ) );
	if ( s.shot ) console.log( `shot ${s.shot} ${( ( Date.now() - t1 ) / 1000 ).toFixed( 1 )} s ${JSON.stringify( r.info )}` );
}
console.log( logs.slice( 0, 80 ).join( '\n' ) );
await browser.close();
