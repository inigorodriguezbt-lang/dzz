// Evaluate JS in the roads preview after it is ready: node test/roads-probe.mjs "<url>" "<js expr>" [out.png]
import { launch } from './lib/browser.mjs';
const [ url, expr, out ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
try { await page.waitForFunction( () => window.__done === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for done' ); }
const r = await page.evaluate( expr );
console.log( typeof r === 'string' ? r : JSON.stringify( r, null, 1 ) );
if ( out ) await page.screenshot( { path: out, timeout: 120000 } );
console.log( logs.filter( l => ! l.includes( '[vite]' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
