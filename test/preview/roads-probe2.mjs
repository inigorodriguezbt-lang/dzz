// Roads preview (world + roads only) on lavapipe: node test/preview/roads-probe2.mjs <port> "<query>" "<js>" [out.jpg]
import { launch, lean } from '../lib/browser.mjs';
const [ port, query, expr, out ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
await lean( page );
const logs = [];
page.on( 'crash', () => { console.log( 'PAGE CRASHED' ); console.log( logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) && ! t.includes( 'GPU stall' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/roads.html?${query}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 300000, polling: 1000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
await page.waitForTimeout( 4000 );
try { const r = await page.evaluate( expr || '1' ); console.log( typeof r === 'string' ? r : JSON.stringify( r, null, 1 ) ); } catch ( e ) { console.log( 'eval error', e.message ); }
if ( out ) await page.screenshot( { path: out, type: 'jpeg', quality: 85, timeout: 120000 } );
console.log( logs.slice( 0, 40 ).join( '\n' ) );
await browser.close();
