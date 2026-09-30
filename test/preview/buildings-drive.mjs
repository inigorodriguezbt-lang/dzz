// Interactive full-game driver for the buildings module (dev only, not shipped). One boot, then steps sent
// over HTTP, so a series of checks doesn't pay the ~40 s boot each time:
//   node test/preview/buildings-drive.mjs <vitePort> <outdir> <ctlPort> "<query incl. &frames=2>"
//   curl -s localhost:<ctlPort>/step -d @steps.json      (steps as in buildings-game.mjs)
//   curl -s localhost:<ctlPort>/goto -d 'quick=1&...'     (reload the page with a new query)
//   curl -s localhost:<ctlPort>/quit                       (close the browser and exit)
// The page's own loop stops after `frames`; steps simulate the game at 30 fps with gameplay input on.
import fs from 'node:fs';
import http from 'node:http';
import { launch, lean } from '../lib/browser.mjs';

const [ port, outdir, ctl = '5294', query0 = 'quick=1&mode=creative&frames=2' ] = process.argv.slice( 2 );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const lite = process.env.LITE === '1';
const W = + ( process.env.VW || 960 ), H = + ( process.env.VH || 540 );
const page = await browser.newPage( { viewport: { width: W, height: H } } );
await lean( page, + ( process.env.WORKERS || 2 ) );
// SETTINGS='{"shadows":"high"}' overrides; the defaults otherwise (only the tutorial off)
await page.addInitScript( ( o ) => {
	try { localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( { tutorial: false, ...( o.lite ? { shadows: 'low', terrainDetail: 'low', water: 'low', vegetation: 'low' } : {} ), ...o.extra } ) ); } catch ( e ) { /* ignore */ }
}, { lite, extra: JSON.parse( process.env.SETTINGS || '{}' ) } );
const STUBS = { vegetation: '/src/world/Vegetation.js', roads: '/src/city/Roads.js', items: '/src/game/items/WorldItems.js', hands: '/src/weapons/Hands.js', creatures: '/src/ai/Creatures.js', vehicles: '/src/vehicles/Vehicles.js' };
for ( const k of ( process.env.STUB || '' ).split( ',' ).filter( Boolean ) ) {
	await page.route( `**${STUBS[ k ]}*`, route => route.fulfill( { contentType: 'application/javascript', body: 'export function install() {}' } ) );
}
let logs = [];
page.on( 'crash', () => { console.log( 'PAGE CRASHED\n' + logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( '[vite]' ) && ! t.includes( 'GPU stall' ) && ! t.includes( 'GL_INVALID_OPERATION' ) ) logs.push( `[${m.type()}] ${t.slice( 0, 600 )}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message} ${e.stack?.split( '\n' ).slice( 1, 3 ).join( ' ' )}` ) );

async function boot( query ) {
	const t0 = Date.now();
	await page.goto( `http://127.0.0.1:${port}/?${query}` );
	try { await page.waitForFunction( () => window.__ready === true && window.__app?.game, null, { timeout: 480000, polling: 1000 } ); } catch ( e ) {
		return 'TIMEOUT waiting for ready\n' + logs.slice( - 40 ).join( '\n' );
	}
	await page.evaluate( () => {
		const C = window.__app.game.city;
		if ( ! C ) return;
		const up = C.update.bind( C );
		window.__cityT = [];
		C.update = ( dt ) => { const t = performance.now(); up( dt ); window.__cityT.push( performance.now() - t ); };
		window.__prof = {};
		for ( const k of [ '_storeyGen', '_cellGen', '_clearGen' ] ) {
			const f = C[ k ].bind( C );
			C[ k ] = function * ( ...args ) {
				const it = f( ...args );
				for ( let step = 0; ; step ++ ) {
					const t = performance.now();
					const r = it.next();
					const d = performance.now() - t;
					const key = k + ':' + step, p = window.__prof[ key ] = window.__prof[ key ] || { n: 0, max: 0, sum: 0 };
					p.n ++; p.sum += d; p.max = Math.max( p.max, d );
					if ( r.done ) return r.value;
					yield r.value;
				}
			};
		}
		for ( const k of [ '_stream', '_interiors', '_integrate', '_cellReady', '_lights', '_coarse', '_shellBoxes', '_dropInterior', '_dropStorey' ] ) {
			const f = C[ k ].bind( C );
			C[ k ] = ( ...args ) => { const t = performance.now(); const r = f( ...args ); const d = performance.now() - t; const p = window.__prof[ k ] = window.__prof[ k ] || { n: 0, max: 0, sum: 0 }; p.n ++; p.sum += d; p.max = Math.max( p.max, d ); return r; };
		}
	} );
	return `ready ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )} s`;
}

async function runSteps( steps ) {
	const out = [];
	const log = ( t ) => out.push( t );
	for ( const s of steps ) {
		const t1 = Date.now();
		let r;
		try {
			r = await page.evaluate( async ( s ) => {
				const a = window.__app, g = a.game, C = g.city;
				const yieldNow = () => new Promise( r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage( 0 ); } );
				const frame = () => a.renderer.render( { scene: a.world.scene, camera: a.world.camera, viewScene: g.player.vehicle || s.noView ? null : g.viewScene, viewCamera: g.viewCamera, grade: g.grade() } );
				let out;
				if ( s.js ) { try { out = await ( 0, eval )( `( async ( a, g, C, T ) => ( ${s.js} ) )` )( a, g, C, window.__T ); } catch ( e ) { out = 'error: ' + e.message + ' ' + e.stack?.split( '\n' )[ 1 ]; } }
				const until = s.until ? ( 0, eval )( `( a, g, C, T ) => ( ${s.until} )` ) : null;
				window.__cityT = []; window.__prof = {};
				let n = 0;
				const ft = [];
				for ( let i = 0; i < ( s.run || 0 ); i ++ ) {
					if ( until && until( a, g, C, window.__T ) ) break;
					for ( const k of s.keys || [] ) { a.input.down.add( k ); if ( i === 0 ) a.input.pressedQ.add( k ); }
					g.inputActive = true; a.input.enabled = true;
					const t = performance.now();
					g.update( 1 / 30 );
					a.world.update( 1 / 30 );
					ft.push( performance.now() - t );
					a.input.endFrame();
					n ++;
					if ( s.render !== false && ( s.renderEvery ? i % s.renderEvery === 0 : i % 30 === 29 ) ) frame();
					await yieldNow();
					if ( a.world.pool.busy ) await new Promise( r => setTimeout( r, 5 ) );
				}
				for ( const k of s.keys || [] ) a.input.down.delete( k );
				const T = window.__cityT;
				const perf = T.length ? { frames: n, cityMean: +( T.reduce( ( p, q ) => p + q, 0 ) / T.length ).toFixed( 2 ), cityMax: +Math.max( ...T ).toFixed( 2 ), updMean: +( ft.reduce( ( p, q ) => p + q, 0 ) / ft.length ).toFixed( 1 ) } : null;
				let url = null, info = null;
				if ( s.shot ) {
					a.world.update( 0.001 );
					frame();
					url = a.canvas.toDataURL( 'image/jpeg', 0.85 );
					const ri = a.renderer.gl.info.render;
					info = { calls: ri.calls, tris: Math.round( ri.triangles / 1000 ) + 'k', far: C?.far.size, near: C?.near.size, int: C?.interiors.size, q: C?.queue.length, busy: a.world.pool.busy, pos: [ g.player.pos.x, g.player.pos.y, g.player.pos.z ].map( v => Math.round( v * 10 ) / 10 ) };
				}
				if ( perf ) perf.prof = Object.fromEntries( Object.entries( window.__prof ).filter( ( [ k, v ] ) => v.max > 1 ).map( ( [ k, v ] ) => [ k, v.n + 'x max ' + v.max.toFixed( 1 ) + ' sum ' + v.sum.toFixed( 0 ) ] ) );
				if ( perf ) perf.heap = Math.round( ( performance.memory?.usedJSHeapSize || 0 ) / 1e6 );
				return { out, url, perf, info };
			}, s );
		} catch ( e ) { log( 'step failed: ' + e.message.split( '\n' )[ 0 ] ); continue; }
		if ( r.out !== undefined ) log( ( s.shot || s.name || s.js?.slice( 0, 40 ) || '' ) + ': ' + JSON.stringify( r.out ) );
		if ( r.perf ) log( '  perf ' + JSON.stringify( r.perf ) );
		if ( r.url ) fs.writeFileSync( `${outdir}/${s.shot}.jpg`, Buffer.from( r.url.split( ',' )[ 1 ], 'base64' ) );
		if ( s.shot ) log( `shot ${s.shot} ${( ( Date.now() - t1 ) / 1000 ).toFixed( 1 )} s ${JSON.stringify( r.info )}` );
	}
	if ( logs.length ) { log( logs.slice( 0, 60 ).join( '\n' ) ); logs = []; }
	return out.join( '\n' );
}

console.log( await boot( query0 ) );
let busy = Promise.resolve();
http.createServer( ( req, res ) => {
	let body = '';
	req.on( 'data', c => body += c );
	req.on( 'end', () => {
		busy = busy.then( async () => {
			let text = '';
			try {
				if ( req.url.startsWith( '/step' ) ) text = await runSteps( JSON.parse( body ) );
				else if ( req.url.startsWith( '/goto' ) ) { logs = []; text = await boot( body.trim() ); }
				else if ( req.url.startsWith( '/quit' ) ) { res.end( 'bye\n' ); await browser.close(); process.exit( 0 ); }
			} catch ( e ) { text = 'error: ' + e.message; }
			res.end( text + '\n' );
		} );
	} );
} ).listen( + ctl, '127.0.0.1' );
console.log( 'control on', ctl );
