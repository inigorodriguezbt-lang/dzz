// Shore fishing (a nod to Tidewater): stand at the water with a rod, look at the sea and press F to cast. The bobber
// rides the swell until something bites — it dips, the line jerks, you have a moment to strike (F) — then you
// reel it in. What bites depends on the water under the bobber: reef fish and octopus over the shallow reef,
// ulua off rocky drop-offs, ahi, mahimahi and the odd shark over deep water (sharks more at night).
// Bait (consumed per bite) and a tackle box make bites come faster; reading the fishing guide helps too.
// What you see: the rod goes into your hands (the hands module draws it), a line runs from its tip to a red-topped
// bobber that lands a little short of the crosshair, and rings spread on the water at a nibble and a bite.
import * as THREE from 'three';
import { getItem, makeStack } from './ItemDB.js';
import { M } from './models/lib.js';
import { playItemSound, ensureItemSound } from './sounds.js';

// [ id, weight ] by depth band (m of water under the bobber)
const CATCH = {
	shallow: [ [ 'raw_fish', 62 ], [ 'raw_tako', 16 ], [ 'raw_ulua', 8 ], [ 'junk', 14 ] ],
	reef: [ [ 'raw_fish', 45 ], [ 'raw_ulua', 22 ], [ 'raw_tako', 10 ], [ 'raw_mahimahi', 8 ], [ 'raw_ahi', 5 ], [ 'raw_shark', 4 ], [ 'junk', 6 ] ],
	deep: [ [ 'raw_ahi', 30 ], [ 'raw_mahimahi', 28 ], [ 'raw_ulua', 14 ], [ 'raw_fish', 12 ], [ 'raw_shark', 12 ], [ 'junk', 4 ] ],
};
const JUNK = [ 'slippers', 'empty_bottle', 'water_bottle', 'rope', 'scrap_metal', 'tabi' ];
const BIG = new Set( [ 'raw_ahi', 'raw_shark', 'raw_ulua', 'raw_mahimahi' ] );
const MAX_CAST = 14;
const DROP = 0.045; // (rad) casts land this far below the crosshair, so neither it nor the prompt hides the bobber
const BOB_PX = 7; // the bobber never gets smaller than this on screen (a real one is a speck at 14 m)
const LINE_PX = 1.6; // on-screen line width (px)
const LINE_N = 16; // line segments

export class Fishing {
	constructor( game ) {
		this.game = game;
		this.state = null; // null | 'cast' | 'wait' | 'bite' | 'reel'
		this.rod = null;
		this.bobberPos = new THREE.Vector3();
		this.castFrom = new THREE.Vector3();
		this.t = 0;
		this.obj = null;
		this.line = null;
		this.rings = [];
		this.offProvider = game.interact.addProvider( ( ray ) => this.provide( ray ) );
		this._v = new THREE.Vector3();
		this._d = new THREE.Vector3();
		this._a = new THREE.Vector3();
		this._b = new THREE.Vector3();
		this._pts = Array.from( { length: LINE_N + 1 }, () => new THREE.Vector3() );
	}

	get inv() { return this.game.player.inventory; }

	bestRod() {
		const held = this.inv.heldStack?.();
		if ( held && getItem( held.id )?.tool?.kind === 'fishingrod' && held.cond > 0 ) return held;
		const rods = this.inv.findAll( ( s, d ) => d?.tool?.kind === 'fishingrod' && s.cond > 0 );
		rods.sort( ( a, b ) => ( getItem( b.id ).tool.quality || 1 ) - ( getItem( a.id ).tool.quality || 1 ) );
		return rods[ 0 ] || null;
	}

	// where a cast along the view would land on open water, or null
	target( ray ) {
		const g = this.game, P = g.physics;
		const o = ray.origin, d = ray.dir;
		const water = P.waterLevel( o.x, o.z );
		const flat = Math.hypot( d.x, d.z ) || 1;
		let reach;
		if ( d.y < - 0.03 ) {
			// where the view meets the water, seen a little lower (beyond the rod's reach it lands short anyway)
			const h = o.y - water, full = h / - d.y * flat;
			reach = full > MAX_CAST ? MAX_CAST : h / Math.tan( Math.atan2( - d.y, flat ) + DROP );
		} else reach = MAX_CAST * 0.75 * flat; // looking out or up: a long cast, well below the crosshair
		if ( reach < 2.5 ) return null;
		const x = o.x + d.x / flat * reach, z = o.z + d.z / flat * reach;
		const lvl = P.waterLevel( x, z );
		const depth = lvl - g.hf.heightAt( x, z );
		if ( depth < 0.35 ) return null;
		// nothing solid in the way of the line
		this._d.set( x - o.x, lvl - o.y, z - o.z );
		const L = this._d.length();
		this._d.divideScalar( L );
		if ( P.raycastBoxes( o, this._d, L ) ) return null;
		return { pos: new THREE.Vector3( x, lvl, z ), depth };
	}

	provide( ray ) {
		const g = this.game;
		if ( g.player.vehicle ) return null;
		if ( this.state === 'bite' ) return [ { t: 0.01, id: 'fish:strike', label: 'Strike', sub: 'Bite', noOcclusion: true, action: () => this.strike() } ];
		if ( this.state === 'wait' ) return [ { t: 2.4, id: 'fish:reel', label: 'Reel in', sub: 'Waiting', noOcclusion: true, action: () => this.stop() } ];
		if ( this.state ) return null;
		if ( ray.dir.y > 0.25 ) return null;
		const rod = this.bestRod();
		if ( ! rod ) return null;
		const tg = this.target( ray );
		if ( ! tg ) return null;
		const bait = this.inv.count( 'fishing_bait' );
		return [ { t: 2.5, id: 'fish:cast', label: 'Cast', sub: bait ? `${bait} bait` : 'No bait', noOcclusion: true, action: () => this.cast( rod, tg ) } ];
	}

	// from the rod's inventory action: cast where you are looking if that is water
	cast( rod = null, tg = null ) {
		const g = this.game;
		rod = rod || this.bestRod();
		if ( ! rod ) { g.toast( 'Need a fishing rod', 'warn' ); return false; }
		if ( ! tg ) {
			const cam = g.camera;
			tg = this.target( { origin: cam.position.clone(), dir: new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( cam.quaternion ) } );
			if ( ! tg ) { g.toast( 'Look at open water', 'warn' ); return false; }
			g.app?.ui?.closeScreen?.();
		}
		this.rod = rod;
		this.state = 'cast';
		this.castFrom.copy( g.player.pos );
		// the rod goes into your hands so you see what you fish with
		if ( g.hands?.select && this.inv.hands !== rod.uid ) g.hands.select( rod );
		ensureItemSound( g.audio, 'cast' );
		g.actions.start( {
			label: 'Casting', time: 1.1, sound: 'cast', cancelOnMove: true,
			onDone: () => {
				this.bobberPos.copy( tg.pos );
				this.depth = tg.depth;
				this._show();
				this._ring( 0.7 );
				g.audio?.play( 'plop', { pos: tg.pos, vol: 0.5 } );
				this.state = 'wait';
				this.waitT = this._biteTime();
				this.t = 0;
			},
			onCancel: () => { if ( this.state === 'cast' ) this.state = null; },
		} );
		return true;
	}

	_biteTime() {
		const g = this.game;
		let t = 9 + Math.random() * 22;
		if ( this.inv.count( 'fishing_bait' ) > 0 ) t *= 0.5;
		if ( this.inv.count( 'tackle_box' ) > 0 ) t *= 0.8;
		if ( g.itemUse?.knowledge?.fishing ) t *= 0.8;
		t *= 1 - ( g.skills?.level( 'fishing' ) || 0 ) * 0.03; // practice: up to 30 % sooner
		const h = g.hour;
		if ( ( h > 5 && h < 8.5 ) || ( h > 17 && h < 20 ) ) t *= 0.7; // the bite is on at dawn and dusk
		t /= ( getItem( this.rod.id ).tool.quality || 1 ) ** 0.5;
		return t;
	}

	_band() { return this.depth < 2.5 ? 'shallow' : this.depth < 12 ? 'reef' : 'deep'; }

	_pick() {
		const g = this.game, table = CATCH[ this._band() ].map( ( [ id, w ] ) => [ id, w * ( id === 'raw_shark' && g.world.sky.night > 0.5 ? 2.2 : 1 ) ] ).filter( ( [ id ] ) => id === 'junk' || getItem( id ) );
		let x = Math.random() * table.reduce( ( a, e ) => a + e[ 1 ], 0 );
		for ( const [ id, w ] of table ) { x -= w; if ( x <= 0 ) return id; }
		return table[ 0 ][ 0 ];
	}

	strike() {
		const g = this.game;
		if ( this.state !== 'bite' ) return;
		const id = this._pick();
		const big = BIG.has( id );
		this.state = 'reel';
		this.catchId = id;
		// bait is taken whether you land it or not
		if ( this.inv.count( 'fishing_bait' ) > 0 ) this.inv.consume( 'fishing_bait', 1 );
		ensureItemSound( g.audio, 'reel' );
		g.actions.start( {
			label: 'Reeling in', time: big ? 5 + Math.random() * 3 : 2.5 + Math.random() * 1.5, sound: 'reel', cancelOnMove: true,
			onDone: () => this._land(),
			onCancel: () => this.stop( 'Got away', 'warn' ),
		} );
	}

	_land() {
		const g = this.game, rod = this.rod;
		const q = getItem( rod.id ).tool.quality || 1;
		const big = BIG.has( this.catchId );
		const lvl = g.skills?.level( 'fishing' ) || 0;
		let chance = 0.72 * q + ( g.itemUse?.knowledge?.fishing ? 0.12 : 0 ) + lvl * 0.02 - ( big ? 0.18 : 0 );
		chance *= 0.6 + 0.4 * rod.cond;
		rod.cond = Math.max( 0.02, rod.cond - ( big ? 0.03 : 0.01 ) );
		if ( Math.random() > Math.min( 0.95, chance ) ) { g.skills?.xp( 'fishing', 1 ); this.stop( big ? 'Line snapped' : 'Got away', 'warn' ); return; }
		let id = this.catchId;
		if ( id === 'junk' ) id = JUNK[ Math.floor( Math.random() * JUNK.length ) ];
		const s = makeStack( id, 1, { loot: id !== this.catchId } );
		if ( ! s ) { this.stop(); return; }
		if ( getItem( id ).cat === 'food' ) { s.data.age = 0; s.cond = 1; }
		g.audio?.play( 'splash', { pos: this.bobberPos, vol: 0.6 } );
		const caught = { ...s }; // (a fish that joins a stack you carry leaves this one at qty 0)
		if ( this.inv.add( s ) > 0 ) { g.dropStack( s ); g.toast( 'No room, dropped', 'warn' ); }
		g.events.emit( 'item:pick', { stack: caught } );
		const name = getItem( id ).name.replace( /^Raw /, '' );
		g.toast( `Caught: ${name}`, this.catchId === 'junk' ? 'info' : 'good' );
		g.stats.fish = ( g.stats.fish || 0 ) + ( this.catchId === 'junk' ? 0 : 1 );
		// practice, and a catch is a small joy
		g.skills?.xp( 'fishing', this.catchId === 'junk' ? 1 : big ? 8 : 4 );
		if ( this.catchId !== 'junk' ) g.survival?.mood?.( { boredom: big ? - 8 : - 4, unhappy: big ? - 4 : - 1 } );
		this.inv.changed();
		this.stop();
	}

	stop( msg = null, kind = 'info' ) {
		this.state = null;
		this._hide();
		if ( msg ) this.game.toast( msg, kind );
	}

	// ---- bobber, line and rings ----

	_show() {
		const g = this.game;
		if ( ! this.obj ) {
			// a 5 cm bobber with a glowing red cap: it has to read at 14 m
			const grp = new THREE.Group();
			const top = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2 ), M( 0xe0262a, { rough: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0.9 } ) );
			const bot = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2 ), M( 0xf2f2ee, { rough: 0.4 } ) );
			const stem = new THREE.Mesh( new THREE.CylinderGeometry( 0.006, 0.006, 0.06, 6 ).translate( 0, 0.075, 0 ), M( 0xe0262a, { rough: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0.9 } ) );
			grp.add( top, bot, stem );
			this.obj = grp;
			// the line: a camera-facing ribbon a pixel or two wide (a GL line is 1 px whatever you ask)
			const geo = new THREE.BufferGeometry();
			geo.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( ( LINE_N + 1 ) * 2 * 3 ), 3 ) );
			const idx = [];
			for ( let i = 0; i < LINE_N; i ++ ) { const a = i * 2; idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 ); }
			geo.setIndex( idx );
			this.lineMat = new THREE.MeshBasicMaterial( { color: 0xe8eef0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false } );
			this.line = new THREE.Mesh( geo, this.lineMat );
			this.line.frustumCulled = false;
			this.line.layers.set( 1 );
		}
		g.scene.add( this.obj, this.line );
	}

	_hide() {
		if ( this.obj ) this.game.scene.remove( this.obj, this.line );
		for ( const r of this.rings ) this.game.scene.remove( r.mesh );
		for ( const r of this.rings ) r.mesh.material.dispose();
		this.rings.length = 0;
	}

	_bobK() { return this.obj ? this.obj.scale.x : 1; }

	// rings spreading on the water from the bobber (landing, nibbles, the bite)
	_ring( strength = 1 ) {
		const g = this.game;
		if ( ! this._ringGeo ) this._ringGeo = new THREE.RingGeometry( 0.86, 1, 28 ).rotateX( - Math.PI / 2 );
		const mat = new THREE.MeshBasicMaterial( { color: 0xf4f8fa, transparent: true, opacity: 0.5 * strength, depthWrite: false, fog: false } );
		const mesh = new THREE.Mesh( this._ringGeo, mat );
		mesh.layers.set( 1 );
		mesh.position.copy( this.bobberPos );
		mesh.position.y = g.physics.waterLevel( this.bobberPos.x, this.bobberPos.z ) + 0.01;
		g.scene.add( mesh );
		this.rings.push( { mesh, t: 0, k: strength } );
	}

	_updateRings( dt ) {
		for ( let i = this.rings.length - 1; i >= 0; i -- ) {
			const r = this.rings[ i ];
			r.t += dt;
			const life = 1.1;
			if ( r.t >= life ) { this.game.scene.remove( r.mesh ); r.mesh.material.dispose(); this.rings.splice( i, 1 ); continue; }
			r.mesh.scale.setScalar( 0.06 + r.t * 0.55 * ( 0.6 + r.k * 0.4 ) );
			r.mesh.material.opacity = 0.55 * r.k * ( 1 - r.t / life );
		}
	}

	// the rod tip in the world where the hands module draws it (the view model has its own camera), else a point up
	// and to the right of the view
	_rodTip( out ) {
		const g = this.game, cam = g.camera, it = g.hands?.vm?.item;
		if ( it?.obj && it.size && it.def?.tool?.kind === 'fishingrod' && this.inv.hands === this.rod?.uid && g.viewCamera ) {
			out.set( it.size.x * 0.5, 0, 0 ).applyMatrix4( it.obj.matrixWorld );
			if ( out.z < - 0.05 ) {
				const k = Math.tan( cam.fov * Math.PI / 360 ) / Math.tan( g.viewCamera.fov * Math.PI / 360 );
				out.x *= k; out.y *= k;
				return cam.localToWorld( out );
			}
		}
		return out.set( 0.25, 0.3, - 1.2 ).applyQuaternion( cam.quaternion ).add( cam.position );
	}

	update( dt ) {
		const g = this.game;
		if ( ! this.state ) return;
		// walked off, dropped the rod, got in a car or into the water: the line comes in
		const moved = g.player.pos.distanceTo( this.castFrom ) > 2.2;
		const putAway = g.hands && this.state !== 'cast' && this.rod && this.inv.hands !== this.rod.uid;
		if ( moved || putAway || g.player.vehicle || g.player.swimming || g.dead || ( this.rod && ! this.inv.findUid( this.rod.uid ) ) ) {
			if ( this.state === 'reel' ) g.actions.cancel();
			this.stop();
			return;
		}
		this._updateRings( dt );
		if ( this.state === 'cast' ) return;
		this.t += dt;
		const b = this.bobberPos;
		const base = g.physics.waterLevel( b.x, b.z );
		let y = base + Math.sin( this.t * 2.1 ) * 0.02;
		if ( this.state === 'wait' ) {
			this.waitT -= dt;
			// nibbles before the real bite
			if ( this.waitT < 3 && Math.random() < dt * 0.8 ) { y -= 0.015 * this._bobK(); if ( ! this.rings.length ) this._ring( 0.45 ); }
			if ( this.waitT <= 0 ) {
				this.state = 'bite';
				this.biteT = 1.5;
				this._ring( 1 );
				playItemSound( g, 'reel', { vol: 0.25, rate: 1.6 } );
				g.audio?.play( 'plop', { pos: b, vol: 0.7, rate: 0.8 } );
				g.player.shake = Math.max( g.player.shake, 0.15 );
			}
		} else if ( this.state === 'bite' ) {
			// it jerks under and back (sized to the bobber, so the cap still flashes red at full reach)
			y -= 0.05 * this._bobK() * ( 0.4 + Math.abs( Math.sin( this.t * 17 ) ) * 0.7 );
			if ( this.rings.length < 2 && Math.random() < dt * 3 ) this._ring( 0.8 );
			this.biteT -= dt;
			if ( this.biteT <= 0 ) {
				// missed it: the fish may steal the bait
				if ( Math.random() < 0.5 && this.inv.count( 'fishing_bait' ) > 0 ) { this.inv.consume( 'fishing_bait', 1 ); g.toast( 'Missed, bait taken', 'info' ); } else g.toast( 'Missed', 'info' );
				this.state = 'wait';
				this.waitT = this._biteTime();
			}
		} else if ( this.state === 'reel' ) {
			// the bobber is dragged towards you
			const p = g.player.pos;
			const k = Math.min( 1, dt * 0.35 );
			b.x += ( p.x - b.x ) * k; b.z += ( p.z - b.z ) * k;
			y = base - 0.05 + Math.sin( this.t * 23 ) * 0.03;
		}
		this.obj.position.set( b.x, y, b.z );
		// a floor on its size on screen, so a cast at full reach still shows
		const cam = g.camera, H = typeof innerHeight === 'number' ? innerHeight : 900;
		const px = 2 * Math.tan( cam.fov * Math.PI / 360 ) / Math.max( 200, H );
		this.obj.scale.setScalar( Math.max( 1, cam.position.distanceTo( this.obj.position ) * px * BOB_PX / 0.1 ) );
		this._drawLine( b, y );
	}

	// the line from the rod tip sagging to the bobber (taut and twitching while a fish pulls), as a ribbon turned to
	// the camera and widened with distance so it stays LINE_PX wide on screen
	_drawLine( b, y ) {
		const g = this.game, cam = g.camera;
		const tip = this._rodTip( this._v );
		const pull = this.state === 'bite' || this.state === 'reel';
		const sag = pull ? 0.04 : 0.6;
		const twitch = pull ? Math.sin( this.t * 31 ) * 0.03 : 0;
		const P = this._pts;
		for ( let i = 0; i <= LINE_N; i ++ ) {
			const t = i / LINE_N, bow = Math.sin( t * Math.PI );
			P[ i ].set( tip.x + ( b.x - tip.x ) * t, tip.y + ( y + 0.1 * this.obj.scale.x - tip.y ) * t - bow * sag + bow * twitch, tip.z + ( b.z - tip.z ) * t );
		}
		const H = typeof innerHeight === 'number' ? innerHeight : 900;
		const perPx = 2 * Math.tan( cam.fov * Math.PI / 360 ) / Math.max( 200, H );
		const arr = this.line.geometry.attributes.position.array;
		const side = this._a, toCam = this._b, dir = this._d;
		for ( let i = 0; i <= LINE_N; i ++ ) {
			const p = P[ i ];
			dir.subVectors( P[ Math.min( LINE_N, i + 1 ) ], P[ Math.max( 0, i - 1 ) ] );
			toCam.subVectors( cam.position, p );
			const w = Math.max( 0.0015, toCam.length() * perPx * LINE_PX * 0.5 );
			side.crossVectors( dir, toCam ).normalize().multiplyScalar( w );
			arr[ i * 6 ] = p.x - side.x; arr[ i * 6 + 1 ] = p.y - side.y; arr[ i * 6 + 2 ] = p.z - side.z;
			arr[ i * 6 + 3 ] = p.x + side.x; arr[ i * 6 + 4 ] = p.y + side.y; arr[ i * 6 + 5 ] = p.z + side.z;
		}
		this.line.geometry.attributes.position.needsUpdate = true;
		// unlit: dim it at night so it does not glow
		const night = g.world?.sky?.night || 0;
		this.lineMat.color.setHex( 0xe8eef0 ).multiplyScalar( 1 - 0.75 * night );
	}

	dispose() {
		this.offProvider?.();
		this._hide();
		this.obj?.traverse( o => o.geometry?.dispose() );
		this.line?.geometry.dispose(); this.line?.material.dispose();
		this._ringGeo?.dispose();
	}
}
