// node test/preview/bldlite-shots.mjs <port> <outdir> <steps.json>; steps: [ { name, js, wait } ] (js evaluated in the page)
import { launch } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ port, outdir, file ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( file, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.on( 'console', m => { if ( m.type() === 'error' || m.type() === 'warning' ) console.log( `[${m.type()}]`, m.text().slice( 0, 600 ) ); } );
page.on( 'pageerror', e => console.log( '[pageerror]', e.message ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/test/preview/bldlite.html` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000 } ); } catch ( e ) { console.log( 'TIMEOUT ready' ); await browser.close(); process.exit( 1 ); }
console.log( 'ready', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
for ( const s of steps ) {
	try { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( s.name, JSON.stringify( r ).slice( 0, 800 ) ); } catch ( e ) { console.log( 'js error', s.name, e.message ); }
	await page.waitForTimeout( s.wait ?? 800 );
	if ( s.name ) { await page.screenshot( { path: `${outdir}/${s.name}.jpg`, type: 'jpeg', quality: 85, timeout: 60000 } ); console.log( 'shot', s.name ); }
}
await browser.close();
