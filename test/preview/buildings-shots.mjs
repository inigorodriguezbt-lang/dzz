// Screenshots of the buildings preview: node test/preview/buildings-shots.mjs <port> <outdir> <views.json>
// views: [ { name, at: [ x, z ], h, yaw, pitch, hour, look?: [ x, y, z ], feet?, wait? , js? } ]
import { launch, lean } from '../lib/browser.mjs';
import fs from 'node:fs';
const [ port, outdir, file ] = process.argv.slice( 2 );
const views = JSON.parse( fs.readFileSync( file, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
await lean( page, 3 );
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) ) { logs.push( `[${m.type()}] ${t}` ); if ( m.type() === 'error' ) console.log( '[error]', t.slice( 0, 400 ) ); } } );
page.on( 'pageerror', e => console.log( '[pageerror]', e.message ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
const v0 = views[ 0 ];
await page.goto( `http://127.0.0.1:${port}/test/preview/buildings.html?at=${( v0.at || [ -4300, -10300 ] ).join( ',' )}&hour=${v0.hour ?? 10}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 240000 } ); } catch ( e ) {
	console.log( 'TIMEOUT ready\n' + logs.slice( 0, 60 ).join( '\n' ) );
	await browser.close();
	process.exit( 1 );
}
console.log( 'ready', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
for ( const v of views ) {
	await page.evaluate( ( v ) => {
		if ( v.at ) window.__view( v.at[ 0 ], v.at[ 1 ], v.h ?? 1.7, v.yaw ?? 0, v.pitch ?? 0, v.hour ?? 10, v.feet ?? null );
		if ( v.look ) window.__look( ...v.look );
	}, v );
	if ( v.js ) { try { const r = await page.evaluate( v.js ); if ( r !== undefined ) console.log( v.name, JSON.stringify( r ) ); } catch ( e ) { console.log( 'js error', e.message ); } }
	const t1 = Date.now();
	await page.waitForTimeout( 1500 );
	try { await page.waitForFunction( () => window.__idle(), null, { timeout: 120000, polling: 500 } ); } catch ( e ) { logs.push( 'TIMEOUT idle ' + v.name ); }
	await page.waitForTimeout( v.wait ?? 1500 );
	const inf = await page.evaluate( () => document.getElementById( 'info' ).textContent );
	await page.screenshot( { path: `${outdir}/${v.name}.jpg`, type: 'jpeg', quality: 85, timeout: 120000 } );
	console.log( 'shot', v.name, ( ( Date.now() - t1 ) / 1000 ).toFixed( 1 ) + 's', inf );
}
console.log( logs.slice( 0, 60 ).join( '\n' ) );
await browser.close();
