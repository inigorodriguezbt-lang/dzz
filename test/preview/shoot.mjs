// Screenshots of the weapons preview in one browser session:
//   node test/preview/shoot.mjs <port> <outdir> '<json array of pose objects>' [w] [h]
// each pose is passed to window.pose(); files are <outdir>/<i>-<item>.png (or pose.name)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [ port, outdir, json, w = '960', h = '540' ] = process.argv.slice( 2 );
const poses = JSON.parse( json );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: + w, height: + h } } );
const logs = [];
page.on( 'console', m => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/weapons.html?w=${w}&h=${h}&item=${poses[ 0 ]?.item || 'm4a1'}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000 } ); } catch ( e ) { logs.push( 'TIMEOUT' ); }
let i = 0;
for ( const p of poses ) {
	const r = await page.evaluate( ( o ) => { try { return window.pose( o ); } catch ( e ) { return 'ERR ' + e.message + '\n' + e.stack; } }, p );
	const name = `${outdir}/${String( i ++ ).padStart( 2, '0' )}-${p.name || p.item || 'pose'}.png`;
	await page.screenshot( { path: name } );
	console.log( name, JSON.stringify( r ) );
}
console.log( logs.filter( l => ! l.includes( 'vite' ) ).slice( 0, 40 ).join( '\n' ) );
await browser.close();
