// Full-game session for the creatures module (dev only, not shipped):
//   node test/preview/creatures-game.mjs <port> <out-prefix> "<query incl. &frames=2>" "<async js body>"
// The page loop stops after a couple of frames; the body then drives the game by hand with helpers:
//   await step( seconds, dt = 1/30 )   advance the game and world (no drawing)
//   shot( name )                        render one frame and save <out-prefix>-<name>.png
//   look( x, y, z )                     aim the player's camera at a world point
//   g, app, THREE-free vectors via g.player.pos.clone()
// Whatever the body returns is printed as JSON.
import fs from 'node:fs';
import { chromium } from 'playwright';

const [ port, prefix, query, body ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
// SHOT_W / SHOT_H: a smaller viewport renders much faster under SwiftShader
const page = await browser.newPage( { viewport: { width: + ( process.env.SHOT_W || 1280 ), height: + ( process.env.SHOT_H || 720 ) } } );
const logs = [];
const t0 = Date.now();
const T = () => ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ) + 's';
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'PCFSoft' ) ) console.log( T(), `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => console.log( T(), `[pageerror] ${e.message}` ) );
await page.goto( `http://127.0.0.1:${port}/?${query}` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 480000, polling: 1000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
console.log( T(), 'ready' );
await page.exposeFunction( '__save', ( name, url ) => { fs.writeFileSync( `${prefix}-${name}.png`, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) ); } );
const res = await page.evaluate( `( async () => {
	const app = window.__app, g = app.game;
	const step = async ( sec, dt = 1 / 30 ) => {
		const n = Math.ceil( sec / dt );
		for ( let i = 0; i < n; i ++ ) {
			g.update( dt ); app.world.update( dt );
			if ( i % 10 === 9 ) await new Promise( r => setTimeout( r, 0 ) );
		}
	};
	const log = ( ...a ) => console.log( 'LOG', ...a.map( x => typeof x === 'string' ? x : JSON.stringify( x ) ) );
	const shot = async ( name ) => {
		app.world.update( 0.001 );
		app.renderer.render( { scene: app.world.scene, camera: app.world.camera, viewScene: g.player.vehicle ? null : g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
		await window.__save( name, app.canvas.toDataURL( 'image/png' ) );
	};
	const look = ( x, y, z ) => {
		const p = g.player, dx = x - p.pos.x, dy = y - p.eye, dz = z - p.pos.z;
		p.yaw = Math.atan2( - dx, - dz ); p.pitch = Math.atan2( dy, Math.hypot( dx, dz ) );
		p.update( 0.001 );
	};
	try { ${body} } catch ( e ) { return { error: e.message, stack: e.stack.split( '\\n' ).slice( 0, 6 ) }; }
} )()` );
console.log( JSON.stringify( res, null, 1 ) );
console.log( logs.slice( 0, 60 ).join( '\n' ) );
await browser.close();
