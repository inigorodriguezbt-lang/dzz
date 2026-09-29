// One full-game boot for HUD checks, like session.mjs but with a chosen viewport, the Google fonts and JPEG shots:
//   node test/preview/hud-session.mjs <url> <outdir> <steps.json> [WxH]
// steps: [ { js: "expression (may be async)", wait: ms, shot: "name" } ]. The page gets __press / __down / __up
// (fake input: headless has no pointer lock) and __g (the game).
import { launch, lean } from '../lib/browser.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [ url, outdir, stepsFile, size = '1920x1080' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
const [ W, H ] = size.split( 'x' ).map( Number );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: W, height: H } } );
await lean( page, 1 );
// low graphics before the boot (less memory, faster frames); HUD settings stay at their defaults
const LOW_SETTINGS = { quality: 'low', shadows: 'off', terrainDetail: 'low', vegetation: 'low', clouds: 'off', antialias: 'fxaa', bloom: false, water: 'low', grass: false, renderScale: 0.75, renderDistance: 600, showFps: false };
await page.addInitScript( ( [ key, v ] ) => { try { localStorage.setItem( key, JSON.stringify( v ) ); } catch ( e ) { /* no storage */ } }, [ 'deadtide.settings.v1', LOW_SETTINGS ] );
const fontCache = new Map();
await page.route( /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async route => {
	const req = route.request(), u = req.url();
	try {
		let hit = fontCache.get( u );
		if ( ! hit ) { hit = { body: execFileSync( 'curl', [ '-sSfL', '--max-time', '20', '-A', req.headers()[ 'user-agent' ] || 'Mozilla/5.0 Chrome/120', u ] ), type: u.includes( 'gstatic' ) ? 'font/woff2' : 'text/css; charset=utf-8' }; fontCache.set( u, hit ); }
		await route.fulfill( { status: 200, body: hit.body, contentType: hit.type, headers: { 'access-control-allow-origin': '*' } } );
	} catch ( e ) { await route.abort(); }
} );
// STUB=Vegetation,Buildings,Creatures swaps those content modules for an empty install() (less memory when the
// machine is busy; the HUD does not need them)
for ( const name of ( process.env.STUB || '' ).split( ',' ).filter( Boolean ) ) {
	await page.route( new RegExp( `/src/(world|city|ai|vehicles|weapons)/${name}\\.js(\\?.*)?$` ), route => route.fulfill( { status: 200, contentType: 'text/javascript', body: 'export function install() {}' } ) );
}
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ( m.type() === 'error' || m.type() === 'warning' ) && ! t.includes( 'vite' ) && ! t.includes( 'GL Driver' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'crash', () => { console.log( 'PAGE CRASHED (out of memory?)\n' + logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}\n${( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( '\n' )}` ) );
const t0 = Date.now();
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 600000 } ); } catch ( e ) { console.log( 'TIMEOUT waiting for ready\n' + logs.join( '\n' ) ); await browser.close(); process.exit( 1 ); }
console.log( 'ready after', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
await page.evaluate( () => {
	const I = window.__app.input;
	Object.defineProperty( I, 'locked', { get: () => true, set: () => {}, configurable: true } );
	window.__press = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); setTimeout( () => { I.down.delete( c ); I.releasedQ.add( c ); }, 60 ); };
	window.__down = ( c ) => { I.pressedQ.add( c ); I.down.add( c ); };
	window.__up = ( c ) => { I.down.delete( c ); I.releasedQ.add( c ); };
	window.__g = window.__app.game;
} );
for ( const s of steps ) {
	if ( s.js ) {
		try { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( ( s.name || s.shot || 'step' ) + ':', JSON.stringify( r ) ); } catch ( e ) { console.log( 'eval error', e.message ); }
	}
	if ( s.wait ) await page.waitForTimeout( s.wait );
	if ( s.shot ) { try { await page.screenshot( { path: `${outdir}/${s.shot}.jpg`, type: 'jpeg', quality: 88, timeout: 150000 } ); console.log( 'shot', s.shot ); } catch ( e ) { console.log( 'shot failed', s.shot, e.message.split( '\n' )[ 0 ] ); } }
}
console.log( logs.slice( 0, 80 ).join( '\n' ) );
await browser.close();
