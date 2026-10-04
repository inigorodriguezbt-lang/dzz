// Boots a production build the way the claude.ai play link serves it, before publishing it:
//   node test/artifact-smoke.mjs <build dir> <out dir>
// The artifact host wraps the page in its own skeleton, serves it from a deep path without COOP/COEP (so no
// SharedArrayBuffer), and the binaries (.gz .bin .glb) go up as application/wasm (docs/HANDOFF.md, "The play link").
// Saves menu.jpg (the plain link, as a player opens it) and world.jpg (?quick=1, which only works locally).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, lean } from './lib/browser.mjs';

const [ ROOT, OUT ] = process.argv.slice( 2 ).map( p => path.resolve( p ) );
if ( ! ROOT || ! OUT ) { console.log( 'usage: node test/artifact-smoke.mjs <build dir> <out dir>' ); process.exit( 1 ); }
const BASE = '/artifact/x/', PORT = 5301;
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
const page = SKELETON + fs.readFileSync( path.join( ROOT, 'index.html' ), 'utf8' ) + '\n</body></html>';
const CT = { js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png', ogg: 'audio/ogg', md: 'text/markdown', gz: 'application/wasm', bin: 'application/wasm', glb: 'application/wasm' };

const srv = http.createServer( ( req, res ) => {
	let p = decodeURIComponent( req.url.split( '?' )[ 0 ] );
	if ( ! p.startsWith( BASE ) ) { res.writeHead( 404 ); return res.end(); }
	p = p.slice( BASE.length ) || 'index.html';
	if ( p === 'index.html' ) { res.writeHead( 200, { 'content-type': 'text/html' } ); return res.end( page ); }
	const f = path.join( ROOT, p );
	if ( ! f.startsWith( ROOT ) || ! fs.existsSync( f ) ) { console.log( '404', p ); res.writeHead( 404 ); return res.end(); }
	const b = fs.readFileSync( f );
	res.writeHead( 200, { 'content-type': CT[ p.split( '.' ).pop() ] || 'application/octet-stream', 'content-length': b.length } );
	res.end( b );
} );
await new Promise( r => srv.listen( PORT, '127.0.0.1', r ) );
fs.mkdirSync( OUT, { recursive: true } );

const browser = await launch();
const logs = [];
try {
	const pg = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
	await lean( pg );
	pg.on( 'console', m => { if ( m.type() === 'error' || m.type() === 'warning' ) logs.push( `[${m.type()}] ${m.text()}` ); } );
	pg.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
	pg.on( 'requestfailed', r => logs.push( `[reqfail] ${r.url()} ${r.failure()?.errorText}` ) );
	await pg.goto( `http://127.0.0.1:${PORT}${BASE}index.html` );
	await pg.waitForTimeout( 25000 );
	console.log( 'title:', await pg.title(), '| isolated:', await pg.evaluate( () => crossOriginIsolated ) );
	await pg.screenshot( { path: OUT + '/menu.jpg', type: 'jpeg', quality: 85, timeout: 120000 } );
	await pg.goto( `http://127.0.0.1:${PORT}${BASE}index.html?quick=1&mode=creative&at=-2620,-9850&hour=10` );
	try { await pg.waitForFunction( () => window.__ready === true, null, { timeout: 300000 } ); console.log( 'world ready' ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
	await pg.waitForTimeout( 6000 );
	await pg.screenshot( { path: OUT + '/world.jpg', type: 'jpeg', quality: 85, timeout: 180000 } );
} finally {
	await browser.close();
	srv.close();
	// (the font requests fail only in the cloud container, whose proxy the headless browser doesn't trust)
	console.log( logs.filter( l => ! l.includes( 'GPU stall' ) && ! l.includes( 'ERR_CERT' ) ).slice( 0, 60 ).join( '\n' ) || '(no errors)' );
}
