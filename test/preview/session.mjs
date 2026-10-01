// One full-game boot, then a script of steps: node test/preview/session.mjs <url> <outdir> <steps.json>
// steps: [ { js: "expression (may be async)", wait: ms, shot: "name" } ]. The page gets helpers:
//   __press( code ), __down( code ), __up( code ) — fake input (the canvas has no pointer lock headless)
import { launch, lean } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ url, outdir, stepsFile ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
await lean( page );
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) && ! t.includes( 'ERR_CERT' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 300000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
console.log( 'ready after', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
await page.evaluate( () => {
	const I = window.__app.input;
	// pretend the pointer is locked so gameplay input flows
	Object.defineProperty( I, 'locked', { get: () => true, set: () => {}, configurable: true } );
	window.__press = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); setTimeout( () => { I.down.delete( c ); I.releasedQ.add( c ); }, 60 ); };
	window.__down = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); };
	window.__up = ( c ) => { I.down.delete( c ); I.releasedQ.add( c ); };
} );
for ( const s of steps ) {
	if ( s.js ) {
		try { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( ( s.name || s.shot || 'step' ) + ':', JSON.stringify( r ) ); } catch ( e ) { console.log( 'eval error', e.message ); }
	}
	if ( s.wait ) await page.waitForTimeout( s.wait );
	if ( s.shot ) { try { await page.screenshot( { path: `${outdir}/${s.shot}.jpg`, type: 'jpeg', quality: 85, timeout: 150000 } ); console.log( 'shot', s.shot ); } catch ( e ) { console.log( 'shot failed', s.shot, e.message.split( '\n' )[ 0 ] ); } }
}
console.log( logs.slice( 0, 80 ).join( '\n' ) );
await browser.close();
