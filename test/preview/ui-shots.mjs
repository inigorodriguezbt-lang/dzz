// Screenshots of the UI harness (test/preview/ui.html), no game boot:
//   node test/preview/ui-shots.mjs <port> <outdir> name=query [name=query …] [--size=1920x1080] [--size=960x540 …]
//   e.g. node test/preview/ui-shots.mjs 5231 /tmp/ui hud=screen=hud&hud=damaged,loot options=screen=options&tab=graphics
// Each shot is saved as <outdir>/<name>-<w>x<h>.png. Console errors and page errors are printed per shot.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from '../lib/browser.mjs';

const args = process.argv.slice( 2 );
const [ port, outdir ] = args;
const sizes = args.filter( a => a.startsWith( '--size=' ) ).map( a => a.slice( 7 ).split( 'x' ).map( Number ) );
if ( ! sizes.length ) sizes.push( [ 1920, 1080 ] );
const shots = args.slice( 2 ).filter( a => ! a.startsWith( '--' ) ).map( a => { const i = a.indexOf( '=' ); return [ a.slice( 0, i ), a.slice( i + 1 ) ]; } );
fs.mkdirSync( outdir, { recursive: true } );

// Google Fonts (Inter, JetBrains Mono): fetched with curl so they also load where the network needs the
// HTTPS proxy (Chromium would send the dev-server requests to the proxy too), cached for every shot
const fontCache = new Map();
async function fonts( route ) {
	const req = route.request(), url = req.url();
	try {
		let hit = fontCache.get( url );
		if ( ! hit ) {
			const body = execFileSync( 'curl', [ '-sSfL', '--max-time', '20', '-A', req.headers()[ 'user-agent' ] || 'Mozilla/5.0 Chrome/120', url ] );
			hit = { body, contentType: url.includes( 'gstatic' ) ? 'font/woff2' : 'text/css; charset=utf-8' };
			fontCache.set( url, hit );
		}
		await route.fulfill( { status: 200, body: hit.body, contentType: hit.contentType, headers: { 'access-control-allow-origin': '*' } } );
	} catch ( e ) { await route.abort(); }
}
// lavapipe when available (test/lib/browser.mjs): the item renders are WebGL and SwiftShader is slow
const browser = await launch();
let failed = 0;
for ( const [ w, hh ] of sizes ) {
	const ctx = await browser.newContext( { viewport: { width: w, height: hh } } );
	await ctx.route( /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fonts );
	for ( const [ name, query ] of shots ) {
		const page = await ctx.newPage();
		const logs = [];
		page.on( 'console', m => { if ( ( m.type() === 'error' || m.type() === 'warning' ) && ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
		page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}\n${( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( '\n' )}` ) );
		await page.goto( `http://127.0.0.1:${port}/test/preview/ui.html?${query}` );
		try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 90000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for __ready' ); failed ++; }
		const file = `${outdir}/${name}-${w}x${hh}.png`;
		// the first in-game page renders the 3D item icons (slow on a CPU driver); later pages read them from IndexedDB
		try { await page.screenshot( { path: file, timeout: 240000 } ); } catch ( e ) { logs.push( 'screenshot failed: ' + e.message.split( '\n' )[ 0 ] ); failed ++; }
		console.log( 'shot', file, logs.length ? '\n  ' + logs.join( '\n  ' ) : '' );
		if ( logs.some( l => l.startsWith( '[pageerror]' ) || l.startsWith( '[error]' ) ) ) failed ++;
		await page.close();
	}
	await ctx.close();
}
await browser.close();
process.exit( failed ? 1 : 0 );
