// Vehicle preview captures (dev only): node test/preview/vehicles-shot.mjs <port> <outdir> <steps.json> [query]
// steps: [ { js: "expression run in the page", shot: "name" } ] — each shot saves the canvas as <outdir>/<name>.png
import fs from 'node:fs';
import { chromium } from 'playwright';

const [ port, outdir, stepsFile, query = '' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const m = /[?&]w=(\d+)/.exec( query ), n = /[?&]h=(\d+)/.exec( query );
const page = await browser.newPage( { viewport: { width: m ? + m[ 1 ] : 1280, height: n ? + n[ 1 ] : 720 } } );
page.on( 'console', msg => { if ( msg.type() === 'error' || msg.type() === 'warning' ) console.log( `[${msg.type()}] ${msg.text().slice( 0, 400 )}` ); } );
page.on( 'pageerror', e => console.log( `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/test/preview/vehicles.html?${query}` );
await page.waitForFunction( () => window.__ready === true, null, { timeout: 120000 } );
for ( const s of steps ) {
	const t0 = Date.now();
	if ( s.js ) {
		try { const r = await page.evaluate( s.js ); if ( r !== undefined && r !== true ) console.log( JSON.stringify( r ) ); } catch ( e ) { console.log( 'eval error: ' + e.message.split( '\n' )[ 0 ] ); }
	}
	if ( s.shot ) {
		const url = await page.evaluate( () => document.getElementById( 'c' ).toDataURL( 'image/png' ) );
		fs.writeFileSync( `${outdir}/${s.shot}.png`, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
		console.log( `shot ${s.shot} ${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )} s` );
	}
}
await browser.close();
