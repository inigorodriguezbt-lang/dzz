// One full-game boot for the roads checks, then a script of views (not shipped):
//   node test/preview/roads-session.mjs <port> <outdir> <steps.json> [x,z]
// steps: [ { name, pose: { x, z, yaw (deg), pitch (deg), hour, weather, y (height above ground, flies) }, js, wait, shot } ]
// Poses teleport, wait for the streaming around the camera to settle and then save a JPEG. Lighter settings
// keep the page inside the shared memory limit.
import { launch, lean } from '../lib/browser.mjs';
import fs from 'node:fs';

const [ port, outdir, stepsFile, at = '-4020,-10090' ] = process.argv.slice( 2 );
const steps = JSON.parse( fs.readFileSync( stepsFile, 'utf8' ) );
fs.mkdirSync( outdir, { recursive: true } );
const browser = await launch();
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
await lean( page );
await page.addInitScript( () => {
	try {
		localStorage.setItem( 'deadtide.settings.v1', JSON.stringify( {
			version: 2, quality: 'custom', shadows: 'medium', terrainDetail: 'medium', vegetation: 'medium', clouds: 'low', antialias: 'fxaa',
			water: 'medium', grass: true, renderDistance: 1100, ao: true, shafts: false, lensFlare: false, bloom: true, tutorial: false, showFps: false,
		} ) );
	} catch ( e ) { /* ignore */ }
} );
const logs = [];
page.on( 'crash', () => { console.log( 'PAGE CRASHED' ); console.log( logs.join( '\n' ) ); process.exit( 2 ); } );
page.on( 'console', m => { const t = m.text(); if ( ! t.includes( 'vite' ) && ! t.includes( 'ERR_CERT' ) && ! t.includes( 'GPU stall' ) ) logs.push( `[${m.type()}] ${t}` ); } );
page.on( 'pageerror', e => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( `http://127.0.0.1:${port}/?quick=1&mode=creative&at=${at}&hour=11` );
try { await page.waitForFunction( () => window.__ready === true, null, { timeout: 400000, polling: 1000 } ); } catch ( e ) { logs.push( 'TIMEOUT waiting for ready' ); }
console.log( 'ready after', ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ), 's' );
await page.evaluate( () => {
	const g = window.__app.game;
	g.timeFrozen = true;
	window.__pose = ( o ) => {
		const c = g.commands;
		if ( o.weather ) c.run( '/weather ' + o.weather + ' lock' );
		if ( o.hour !== undefined ) { const h = Math.floor( o.hour ), m = Math.round( ( o.hour - h ) * 60 ); c.run( '/time set ' + h + ':' + String( m ).padStart( 2, '0' ) ); }
		g.player.flying = o.y !== undefined;
		if ( o.y !== undefined ) c.teleport( o.x, g.hf.heightAt( o.x, o.z ) + o.y, o.z ); else c.teleport( o.x, null, o.z );
		g.player.vel.set( 0, 0, 0 );
		g.player.yaw = ( o.yaw || 0 ) * Math.PI / 180; g.player.pitch = ( o.pitch || 0 ) * Math.PI / 180;
		window.__app.renderer.resetExposure?.();
		return g.player.pos.toArray().map( v => + v.toFixed( 1 ) );
	};
	// wait until no world job is pending for a while (the roads, buildings, vegetation and terrain stream in workers)
	window.__settle = async ( maxMs = 90000 ) => {
		const a = window.__app, t0 = performance.now();
		let calm = 0;
		while ( calm < 6 && performance.now() - t0 < maxMs ) {
			await new Promise( r => setTimeout( r, 250 ) );
			calm = a.world.pool.busy === 0 ? calm + 1 : 0;
		}
		return + ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 );
	};
} );
for ( const s of steps ) {
	if ( s.pose ) {
		try {
			const p = await page.evaluate( ( o ) => window.__pose( o ), s.pose );
			const t = await page.evaluate( () => window.__settle() );
			await page.evaluate( () => window.__pose && window.__app.renderer.resetExposure?.() );
			console.log( ( s.name || s.shot || 'pose' ) + ': at', JSON.stringify( p ), 'settled', t, 's' );
		} catch ( e ) { console.log( 'pose error', e.message.split( '\n' )[ 0 ] ); }
	}
	if ( s.js ) {
		try { const r = await page.evaluate( s.js ); if ( r !== undefined ) console.log( ( s.name || s.shot || 'step' ) + ':', JSON.stringify( r ) ); } catch ( e ) { console.log( 'eval error', e.message.split( '\n' )[ 0 ] ); }
	}
	if ( s.wait ) await page.waitForTimeout( s.wait );
	if ( s.shot ) {
		try { await page.screenshot( { path: `${outdir}/${s.shot}.jpg`, type: 'jpeg', quality: 85, timeout: 150000 } ); console.log( 'shot', s.shot ); } catch ( e ) { console.log( 'shot failed', s.shot, e.message.split( '\n' )[ 0 ] ); }
	}
}
console.log( logs.slice( 0, 80 ).join( '\n' ) );
await browser.close();
