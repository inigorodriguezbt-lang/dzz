// Evaluate JS in the weapons preview page: node test/preview/weapons-probe.mjs <port> "<async js expr>" [firstItem]
import { launch } from '../lib/browser.mjs';
const [ port, expr ] = process.argv.slice( 2 );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
const logs = [];
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/test/preview/weapons.html?w=960&h=540&item=${process.argv[4] || 'machete'}` );
await page.waitForFunction( () => window.__ready === true, null, { timeout: 300000 } );
console.log( 'ready', Date.now() - t0 );
console.log( JSON.stringify( await page.evaluate( expr ), null, 1 ) );
console.log( logs.slice( 0, 30 ).join( '\n' ) );
await browser.close();
