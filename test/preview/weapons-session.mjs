// One light full-game boot for the weapons module (low graphics preset so it fits next to other test runs), then a
// script of steps. node test/preview/weapons-session.mjs <url> <outdir> <steps.json> [w] [h]
// steps: [ { name, js: "expression (may be async)", until: "expression that becomes truthy", timeout: ms, wait: ms, shot: "file" } ]
// The page gets __press( code ), __down( code ), __up( code ) for fake input.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [ url, outdir, stepsFile, w = '800', h = '450' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: + w, height: + h } } );
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) && ! t.includes( 'ERR_CERT' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.addInitScript( () => {
	try {
		localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { quality: 'low', shadows: 'off', terrainDetail: 'low', vegetation: 'low', clouds: 'off', antialias: 'fxaa', bloom: false, water: 'low', grass: false, renderScale: 0.75, renderDistance: 500, tutorial: false } ) );
	} catch ( e ) { /* private mode */ }
} );
const t0 = Date.now();
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 300000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
console.log( 'ready after', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
await page.evaluate( () => {
	const I = window.__app.input;
	Object.defineProperty( I, 'locked', { get: () => true, set: () => {}, configurable: true } );
	window.__press = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); setTimeout( () => { I.down.delete( c ); I.releasedQ.add( c ); }, 60 ); };
	window.__down = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); };
	window.__up = ( c ) => { I.down.delete( c ); I.releasedQ.add( c ); };
} );
// __mk( id ): a fresh item stack (for dressing the player in a step)
await page.evaluate( async () => { const m = await import( '/src/game/items/ItemDB.js' ); window.__mk = ( id ) => m.makeStack( id, 1, { full: true } ); } );
for ( const s of steps ) {
	const ts = Date.now();
	try {
		if ( s.js ) { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( ( s.name || 'step' ) + ':', JSON.stringify( r ) ); }
		if ( s.until ) {
			try { await page.waitForFunction( s.until, null, { timeout: s.timeout || 240000, polling: 500 } ); console.log( ( s.name || 'step' ) + ': reached in', ( ( Date.now() - ts ) / 1000 ).toFixed( 1 ), 's' ); } catch ( e ) { console.log( ( s.name || 'step' ) + ': TIMEOUT' ); }
		}
		if ( s.wait ) await page.waitForTimeout( s.wait );
		if ( s.shot ) { await page.screenshot( { path: `${outdir}/${s.shot}.png`, timeout: 240000 } ); console.log( 'shot', s.shot ); }
	} catch ( e ) { console.log( 'step failed', s.name, e.message.split( '\n' )[ 0 ] ); if ( /closed|crashed/.test( e.message ) ) break; }
}
console.log( logs.slice( 0, 60 ).join( '\n' ) );
await browser.close();
