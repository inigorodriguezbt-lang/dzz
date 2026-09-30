// Items module integration run in the full game (not shipped): node test/preview/items-session.mjs <url> <outdir> <steps.json>
// Like session.mjs but on low graphics settings (the test machine is shared and slow) and printing each step as it
// finishes. steps: [ { name, js, wait, shot } ]; the page gets __fin() (finish the running timed action now).
import { launch, lean } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ url, outdir, stepsFile ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 800, height: 450 } } );
await lean( page );
page.on( 'console', m => { const t = m.text(); if ( m.type() === 'error' || m.type() === 'warning' ) if ( ! /vite|ERR_CERT|GPU stall|no image data/.test( t ) ) console.log( `  [${m.type()}] ${t.slice( 0, 300 )}` ); } );
page.on( 'pageerror', e => console.log( `  [pageerror] ${e.message}` ) );
await page.addInitScript( () => {
	try { localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { quality: 'low', shadows: 'medium', terrainDetail: 'low', vegetation: 'low', clouds: 'off', antialias: 'fxaa', bloom: false, water: 'low', grass: false, renderScale: 0.75, renderDistance: 600, tutorial: false } ) ); } catch ( e ) { /* ignore */ }
} );
const t0 = Date.now();
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true && window.__app?.game, null, { timeout: 400000 } ); } catch ( e ) { console.log( 'TIMEOUT waiting for ready' ); }
console.log( 'ready after', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
await page.evaluate( () => { window.__fin = () => { const a = window.__app.game.actions; for ( let i = 0; i < 4 && a.busy; i ++ ) a.update( 999 ); }; } );
for ( const s of steps ) {
	const ts = Date.now();
	if ( s.js ) {
		try { const r = await page.evaluate( s.js ); console.log( ( s.name || 'step' ) + ': ' + JSON.stringify( r ) ); } catch ( e ) { console.log( ( s.name || 'step' ) + ' eval error: ' + e.message.split( '\n' )[ 0 ] ); }
	}
	if ( s.wait ) await page.waitForTimeout( s.wait );
	if ( s.shot ) { try { await page.screenshot( { path: `${outdir}/${s.shot}.jpg`, type: 'jpeg', quality: 85, timeout: 240000 } ); console.log( 'shot ' + s.shot + ' (' + ( ( Date.now() - ts ) / 1000 ).toFixed( 0 ) + ' s)' ); } catch ( e ) { console.log( 'shot failed ' + s.shot + ': ' + e.message.split( '\n' )[ 0 ] ); } }
}
await browser.close();
