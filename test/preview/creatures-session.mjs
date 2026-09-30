// One full-game boot for the creatures module (dev only, not shipped), then a script of steps:
//   node test/preview/creatures-session.mjs <url> <outdir> <steps.json> [width height]
// steps: [ { js: "expression (may be async)", wait: ms, shot: "name" } ] run in order; shots are JPEG. Prints each
// step's result and the page's console errors and warnings. Like test/preview/session.mjs, with JPEG output.
import { launch, lean } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ url, outdir, stepsFile, W = 960, H = 540 ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: + W, height: + H } } );
await lean( page );
// SETTINGS='{"water":"low",...}' overrides the saved options (lighter settings when the machine is loaded)
if ( process.env.SETTINGS ) await page.addInitScript( ( v ) => { try { localStorage.setItem( 'deadtide.settings.v1', v ); } catch ( e ) { /* private mode */ } }, process.env.SETTINGS );
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ( m.type() === 'error' || m.type() === 'warning' ) && ! t.includes( 'vite' ) && ! t.includes( 'GL Driver' ) && ! t.includes( 'GPU stall' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
const T = () => ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ) + 's';
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 300000, polling: 1000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
console.log( T(), 'ready' );
await page.evaluate( () => {
	const I = window.__app.input;
	Object.defineProperty( I, 'locked', { get: () => true, set: () => {}, configurable: true } );
	window.__press = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); setTimeout( () => { I.down.delete( c ); I.releasedQ.add( c ); }, 60 ); };
	document.querySelector( 'vite-error-overlay' )?.remove();
} );
try {
	for ( const s of steps ) {
		if ( s.js ) {
			try { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( T(), ( s.name || s.shot || 'step' ) + ':', JSON.stringify( r ) ); } catch ( e ) { console.log( T(), 'eval error', e.message.split( '\n' )[ 0 ] ); }
		}
		if ( s.wait ) await page.waitForTimeout( s.wait );
		if ( s.shot ) { try { await page.screenshot( { path: `${outdir}/${s.shot}.jpg`, type: 'jpeg', quality: 85, timeout: 150000 } ); console.log( T(), 'shot', s.shot ); } catch ( e ) { console.log( 'shot failed', s.shot, e.message.split( '\n' )[ 0 ] ); } }
	}
} finally {
	console.log( logs.slice( 0, 60 ).join( '\n' ) );
	await browser.close();
}
