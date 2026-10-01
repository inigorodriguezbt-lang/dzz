// Creatures preview capture (dev only): node test/preview/creatures-shot.mjs <port> <out.png> "<js returning a promise or value>" [w] [h]
// Loads test/preview/creatures.html, runs the expression (it sets up and renders a scene), then grabs the canvas.
import fs from 'node:fs';
import { launch } from '../lib/browser.mjs';
const [ port, out, expr, w = '1280', h = '720' ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: + w, height: + h } } );
const logs = [];
page.on( 'console', m => { if ( ! m.text().includes( '[vite]' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/creatures.html?w=${w}&h=${h}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000, polling: 500 } ); } catch ( e ) { logs.push( 'TIMEOUT ready' ); }
let res = null;
try { res = await page.evaluate( expr ); } catch ( e ) { logs.push( 'eval error ' + e.message ); }
const url = await page.evaluate( () => document.getElementById( 'c' ).toDataURL( 'image/png' ) );
fs.writeFileSync( out, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
console.log( JSON.stringify( res ) );
console.log( logs.slice( 0, 40 ).join( '\n' ) );
await browser.close();
