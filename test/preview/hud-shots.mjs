// HUD states on the UI harness (test/preview/ui.html), with timed steps per shot:
//   node test/preview/hud-shots.mjs <port> <outdir> <spec.json>
//   spec: [ { name, query, size: "1920x1080", steps: [ { js, wait } ], shot: true } ]
// Each shot is saved as <outdir>/<name>.jpg; console errors and page errors are printed.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from '../lib/browser.mjs';

const [ port, outdir, specFile ] = process.argv.slice( 2 );
const spec = JSON.parse( fs.readFileSync( specFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
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
const browser = await launch();
let failed = 0;
const contexts = new Map();
for ( const s of spec ) {
	const size = s.size || '1920x1080';
	let ctx = contexts.get( size );
	if ( ! ctx ) {
		const [ w, hh ] = size.split( 'x' ).map( Number );
		ctx = await browser.newContext( { viewport: { width: w, height: hh } } );
		await ctx.route( /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fonts );
		contexts.set( size, ctx );
	}
	const page = await ctx.newPage();
	const logs = [];
	page.on( 'console', m => { if ( ( m.type() === 'error' || m.type() === 'warning' ) && ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
	page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}\n${( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( '\n' )}` ) );
	await page.goto( `http://127.0.0.1:${port}/test/preview/ui.html?${s.query || ''}` );
	try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 90000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for __ready' ); failed ++; }
	for ( const st of s.steps || [] ) {
		if ( st.js ) { try { const r = await page.evaluate( st.js ); if ( r !== undefined ) console.log( `  ${s.name}:`, JSON.stringify( r ) ); } catch ( e ) { logs.push( 'eval: ' + e.message ); } }
		if ( st.wait ) await page.waitForTimeout( st.wait );
		if ( st.shot ) { await page.screenshot( { path: `${outdir}/${s.name}-${st.shot}.jpg`, type: 'jpeg', quality: 88 } ); console.log( 'shot', `${outdir}/${s.name}-${st.shot}.jpg` ); }
	}
	if ( s.shot !== false ) {
		const file = `${outdir}/${s.name}.jpg`;
		try { await page.screenshot( { path: file, type: 'jpeg', quality: 88, timeout: 240000 } ); } catch ( e ) { logs.push( 'screenshot failed: ' + e.message.split( '\n' )[ 0 ] ); failed ++; }
		console.log( 'shot', file );
	}
	if ( logs.length ) console.log( '  ' + logs.join( '\n  ' ) );
	if ( logs.some( l => l.startsWith( '[pageerror]' ) || l.startsWith( '[error]' ) ) ) failed ++;
	await page.close();
}
await browser.close();
process.exit( failed ? 1 : 0 );
