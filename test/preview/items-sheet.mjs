// Full-page screenshot of the item preview page (not shipped): node test/preview/items-sheet.mjs <url> <out.jpg> [width] [height]
// Headless Chromium through test/lib/browser.mjs (lavapipe when available); prints the page's console.
import { launch, lean } from '../lib/browser.mjs';
const [ url, out, w = '1400', h = '900' ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: + w, height: + h } } );
await lean( page );
const logs = [];
page.on( 'console', m => { if ( m.type() !== 'debug' && ! /GPU stall/.test( m.text() ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__done === true, null, { timeout: 280000 } ); } catch ( e ) { logs.push( 'TIMEOUT' ); }
await page.waitForTimeout( 300 );
await page.evaluate( () => { const s = document.getElementById( 'sheet' ); if ( s && s.style.display !== 'none' ) { s.style.position = 'static'; s.style.overflow = 'visible'; document.body.style.overflow = 'visible'; } } );
await page.screenshot( { path: out, fullPage: true, timeout: 120000, ...( /\.png$/i.test( out ) ? {} : { type: 'jpeg', quality: 85 } ) } );
console.log( logs.slice( 0, 40 ).join( '\n' ) );
await browser.close();
