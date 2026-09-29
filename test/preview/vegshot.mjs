// Screenshots of the vegetation world preview (not shipped):
//   node test/preview/vegshot.mjs <port> <out.png|jpg> "<query>" ["<js expr to print>"]
// Grabs the canvas right after a render (window.__grab), which is much faster than a page screenshot
// on the CPU WebGL drivers. Uses the lavapipe launcher (test/lib/browser.mjs).
import fs from 'node:fs';
import { launch, lean } from '../lib/browser.mjs';

const [ port, out, query, expr ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: + ( process.env.W || 1280 ), height: + ( process.env.H || 720 ) } } );
await lean( page );
const logs = [];
page.on( 'console', m => { if ( ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/test/preview/vegworld.html?${query}` );
try { await page.waitForFunction( () => window.__done === true, null, { timeout: 400000, polling: 500 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for done' ); }
const shots = out.split( ',' );
for ( const o of shots ) {
	const url = await page.evaluate( ( jpg ) => window.__grab ? window.__grab( jpg ) : null, o.endsWith( '.jpg' ) );
	if ( url ) fs.writeFileSync( o, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
}
if ( expr ) { try { console.log( JSON.stringify( await page.evaluate( expr ) ) ); } catch ( e ) { console.log( 'eval error', e.message ); } }
console.log( `${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
console.log( logs.slice( 0, 40 ).join( '\n' ) );
await browser.close();
