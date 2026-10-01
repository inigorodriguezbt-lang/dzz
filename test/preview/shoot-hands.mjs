// Screenshots of the hands preview: node test/preview/shoot-hands.mjs <port> <outdir> '<json array of poses>'
import { launch } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ port, outdir, json, w = '720', h = '540' ] = process.argv.slice( 2 );
const poses = JSON.parse( json );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: + w, height: + h } } );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/hands.html?w=${w}&h=${h}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000 } ); } catch ( e ) { logs.push( 'TIMEOUT' ); }
let i = 0;
for ( const p of poses ) {
	const r = await page.evaluate( ( o ) => { try { return window.pose( o ); } catch ( e ) { return 'ERR ' + e.message + '\n' + e.stack; } }, p );
	const name = `${outdir}/${String( i ++ ).padStart( 2, '0' )}-${p.name || 'pose'}.png`;
	await page.screenshot( { path: name } );
	console.log( name, JSON.stringify( r ) );
}
console.log( logs.filter( l => ! l.includes( 'vite' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
