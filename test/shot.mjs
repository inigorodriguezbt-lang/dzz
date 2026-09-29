// Headless screenshot of the running game: node test/shot.mjs <url> <out.png> [waitMs]
import { launch, lean } from './lib/browser.mjs';
const [ url, out, wait = '4000' ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
await lean( page );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 180000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
await page.waitForTimeout( + wait );
try { await page.waitForFunction( () => window.__done === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for done' ); }
await page.screenshot( { path: out, timeout: 120000 } );
const info = await page.evaluate( () => ( { frames: window.__frames, info: window.__world ? window.__world.renderer.gl.info.render : null } ) );
console.log( JSON.stringify( info ) );
console.log( logs.slice( 0, 60 ).join( '\n' ) );
await browser.close();
