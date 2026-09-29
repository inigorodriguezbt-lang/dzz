// Creatures simulation driver (dev only): node test/preview/creatures-sim.mjs <port> <out-prefix> "<async js body>"
// Opens test/preview/creatures-sim.html and runs the body with the page helpers (reset, step, shot, ahead, fireAt,
// hit, interactAt, lookAt, log, game, THREE) plus save( name ): writes the canvas to <out-prefix>-<name>.png.
// Whatever the body returns is printed as JSON, with the page's console errors.
import fs from 'node:fs';
import { chromium } from 'playwright';

const [ port, prefix, body ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
const t0 = Date.now();
const T = () => ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ) + 's';
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'PCFSoft' ) ) console.log( T(), `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => console.log( T(), `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/creatures-sim.html` );
await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000, polling: 250 } );
await page.exposeFunction( '__save', ( name, url ) => { fs.writeFileSync( `${prefix}-${name}.png`, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) ); } );
const res = await page.evaluate( `( async () => {
	const save = async ( name ) => window.__save( name, document.getElementById( 'c' ).toDataURL( 'image/png' ) );
	const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
	try { ${body} } catch ( e ) { return { error: e.message, stack: e.stack.split( '\\n' ).slice( 0, 8 ) }; }
} )()` );
console.log( JSON.stringify( res ) );
await browser.close();
