// Several screenshots from one load of the roads preview:
//   node test/roads-shots.mjs <port> <out-prefix> "x,z,h,yaw,pitch,fov,hour,wet|..."
import { chromium } from 'playwright';
const [ port, prefix, views ] = process.argv.slice( 2 );
const list = views.split( '|' ).map( v => v.split( ',' ).map( Number ) );
const [ x, z, h, yaw, pitch, fov, hour ] = list[ 0 ];
const url = `http://127.0.0.1:${port}/test/preview/roads.html?at=${x},${z}&h=${h}&yaw=${yaw}&pitch=${pitch}&hour=${hour || 10}` + ( fov ? `&fov=${fov}` : '' );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
for ( let i = 0; i < list.length; i ++ ) {
	await page.evaluate( ( v ) => window.__view( ...v ), list[ i ] );
	await page.waitForTimeout( 1500 );
	try { await page.waitForFunction( () => window.__idle(), null, { timeout: 120000, polling: 500 } ); } catch ( e ) { logs.push( 'TIMEOUT idle ' + i ); }
	const f0 = await page.evaluate( () => window.__frames );
	await page.waitForFunction( ( f ) => window.__frames >= f + 2, f0, { timeout: 60000 } );
	await page.screenshot( { path: `${prefix}${i}.png`, timeout: 120000 } );
	console.log( 'shot', i, await page.evaluate( () => document.getElementById( 'info' ).textContent ) );
}
console.log( logs.filter( l => ! l.includes( '[vite]' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
