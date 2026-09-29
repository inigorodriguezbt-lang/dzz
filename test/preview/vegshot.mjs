// Screenshots of the vegetation world preview (not shipped):
//   node test/preview/vegshot.mjs <port> <out.png> "<query>" ["<js expr to print>"]
// Grabs the canvas right after a render (window.__grab), which is much faster than a page
// screenshot under SwiftShader.
import fs from 'node:fs';
import { chromium } from 'playwright';

const [ port, out, query, expr ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
const logs = [];
page.on( 'console', m => { if ( ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/test/preview/vegworld.html?${query}` );
try { await page.waitForFunction( () => window.__done === true, null, { timeout: 400000, polling: 500 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for done' ); }
const url = await page.evaluate( () => window.__grab ? window.__grab() : null );
if ( url ) fs.writeFileSync( out, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
if ( expr ) { try { console.log( JSON.stringify( await page.evaluate( expr ) ) ); } catch ( e ) { console.log( 'eval error', e.message ); } }
console.log( `${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s` );
console.log( logs.slice( 0, 40 ).join( '\n' ) );
await browser.close();
