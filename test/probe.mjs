// node test/probe.mjs <url> "<js expression evaluated after ready>" [out.png]
import { launch, lean } from './lib/browser.mjs';
const [ url, expr, out ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
await lean( page );
const logs = [];
page.on( 'console', m => { if ( ! m.text().includes( 'vite' ) && ! m.text().includes( 'ERR_CERT' ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
await page.waitForTimeout( 3000 );
if ( expr ) { try { console.log( JSON.stringify( await page.evaluate( expr ), null, 1 ) ); } catch ( e ) { console.log( 'eval error', e.message ); } }
if ( out ) { await page.waitForTimeout( 1500 ); await page.screenshot( { path: out, timeout: 180000 } ); }
console.log( logs.slice( 0, 80 ).join( '\n' ) );
await browser.close();
