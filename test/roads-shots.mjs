// Several screenshots from one load of the roads preview:
//   node test/roads-shots.mjs <port> <out-prefix> "x,z,h,yaw,pitch,fov,hour,wet|..."
import { launch } from './lib/browser.mjs';
const [ port, prefix, views ] = process.argv.slice( 2 );
const list = views.split( '|' ).map( v => v.split( ',' ).map( Number ) );
const [ x, z, h, yaw, pitch, fov, hour ] = list[ 0 ];
const url = `http://127.0.0.1:${port}/test/preview/roads.html?at=${x},${z}&h=${h}&yaw=${yaw}&pitch=${pitch}&hour=${hour || 10}` + ( fov ? `&fov=${fov}` : '' );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 240000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
const gal = process.env.GALLERY ? process.env.GALLERY.split( ',' ).map( Number ) : null;
await page.evaluate( () => { window.__budget = 0; } );
for ( let i = 0; i < list.length; i ++ ) {
	try {
		await page.evaluate( ( v ) => { window.__budget = 0; window.__view( ...v ); }, list[ i ] );
		// the gallery is a fake near cell: (re)inject it once the camera is next to it
		if ( gal && Math.hypot( list[ i ][ 0 ] - gal[ 0 ], list[ i ][ 1 ] - gal[ 1 ] ) < 300 ) await page.evaluate( ( g ) => window.__gallery( ...g ), gal );
		await page.waitForTimeout( 1500 );
		await page.waitForFunction( () => window.__idle(), null, { timeout: 180000, polling: 500 } );
		const s0 = await page.evaluate( () => window.__synced );
		await page.evaluate( () => { window.__budget = 2; } );
		await page.waitForFunction( ( s ) => window.__synced > s, s0, { timeout: 300000, polling: 500 } );
		await page.screenshot( { path: `${prefix}${i}.png`, timeout: 300000 } );
		console.log( 'shot', i, await page.evaluate( () => document.getElementById( 'info' ).textContent ) );
	} catch ( e ) { console.log( 'shot', i, 'FAILED', e.message.split( '\n' )[ 0 ] ); }
}
console.log( logs.filter( l => ! l.includes( '[vite]' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
