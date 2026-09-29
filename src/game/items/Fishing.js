// Shore fishing (a nod to Tidewater): stand at the water with a rod, look at the sea and press F to cast. The bobber
// rides the swell until something bites — it dips, the line jerks, you have a moment to strike (F) — then you
// reel it in. What bites depends on the water under the bobber: reef fish and octopus over the shallow reef,
// ulua off rocky drop-offs, ahi, mahimahi and the odd shark over deep water (sharks more at night).
// Bait (consumed per bite) and a tackle box make bites come faster; reading the fishing guide helps too.
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
		this.offProvider = game.interact.addProvider( ( ray ) => this.provide( ray ) );
		this._v = new THREE.Vector3();
		this._d = new THREE.Vector3();
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
		let t;
		if ( d.y < - 0.03 ) t = ( o.y - water ) / - d.y;
		else t = MAX_CAST * 0.75;
		// looking far out or up: cast as far as the rod reaches
		const flat = Math.hypot( d.x, d.z ) || 1;
		const reach = Math.min( t * flat, MAX_CAST );
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
		if ( this.state === 'bite' ) return [ { t: 0.01, id: 'fish:strike', label: 'Strike!', sub: 'Something is biting', noOcclusion: true, action: () => this.strike() } ];
		if ( this.state === 'wait' ) return [ { t: 2.4, id: 'fish:reel', label: 'Reel in', sub: 'Waiting for a bite…', noOcclusion: true, action: () => this.stop( 'You reel in the line' ) } ];
		if ( this.state ) return null;
		if ( ray.dir.y > 0.25 ) return null;
		const rod = this.bestRod();
		if ( ! rod ) return null;
		const tg = this.target( ray );
		if ( ! tg ) return null;
		const bait = this.inv.count( 'fishing_bait' );
		return [ { t: 2.5, id: 'fish:cast', label: 'Cast the line', sub: `${getItem( rod.id ).name}${bait ? ` · ${bait} bait` : ' · no bait'}`, noOcclusion: true, action: () => this.cast( rod, tg ) } ];
	}

	// from the rod's inventory action: cast where you are looking if that is water
	cast( rod = null, tg = null ) {
		const g = this.game;
		rod = rod || this.bestRod();
		if ( ! rod ) { g.toast( 'You need a fishing rod', 'warn' ); return false; }
		if ( ! tg ) {
			const cam = g.camera;
			tg = this.target( { origin: cam.position.clone(), dir: new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( cam.quaternion ) } );
			if ( ! tg ) { g.toast( 'Stand at the water and look at it to cast', 'warn' ); return false; }
			g.app?.ui?.closeScreen?.();
		}
		this.rod = rod;
		this.state = 'cast';
		this.castFrom.copy( g.player.pos );
		ensureItemSound( g.audio, 'cast' );
		g.actions.start( {
			label: 'Casting', time: 1.1, sound: 'cast', cancelOnMove: true,
			onDone: () => {
				this.bobberPos.copy( tg.pos );
				this.depth = tg.depth;
				this._show();
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
			label: big ? 'Fighting a big one' : 'Reeling in', time: big ? 5 + Math.random() * 3 : 2.5 + Math.random() * 1.5, sound: 'reel', cancelOnMove: true,
			onDone: () => this._land(),
			onCancel: () => this.stop( 'It got away', 'warn' ),
		} );
	}

	_land() {
		const g = this.game, rod = this.rod;
		const q = getItem( rod.id ).tool.quality || 1;
		const big = BIG.has( this.catchId );
		let chance = 0.72 * q + ( g.itemUse?.knowledge?.fishing ? 0.12 : 0 ) - ( big ? 0.18 : 0 );
		chance *= 0.6 + 0.4 * rod.cond;
		rod.cond = Math.max( 0.02, rod.cond - ( big ? 0.03 : 0.01 ) );
		if ( Math.random() > Math.min( 0.95, chance ) ) { this.stop( big ? 'The line snaps — it was a big one' : 'It slips off the hook', 'warn' ); return; }
		let id = this.catchId;
		if ( id === 'junk' ) id = JUNK[ Math.floor( Math.random() * JUNK.length ) ];
		const s = makeStack( id, 1, { loot: id !== this.catchId } );
		if ( ! s ) { this.stop(); return; }
		if ( getItem( id ).cat === 'food' ) { s.data.age = 0; s.cond = 1; }
		g.audio?.play( 'splash', { pos: this.bobberPos, vol: 0.6 } );
		if ( this.inv.add( s ) > 0 ) { g.dropStack( s ); g.toast( 'No room — it flops onto the ground', 'warn' ); }
		g.events.emit( 'item:pick', { stack: s } );
		const name = getItem( id ).name.replace( /^Raw /, '' );
		g.toast( this.catchId === 'junk' ? `You reel in… ${name.toLowerCase()}. Great.` : `You caught ${/^[aeiou]/i.test( name ) ? 'an' : 'a'} ${name}!`, this.catchId === 'junk' ? 'info' : 'good' );
		g.stats.fish = ( g.stats.fish || 0 ) + ( this.catchId === 'junk' ? 0 : 1 );
		this.inv.changed();
		this.stop();
	}

	stop( msg = null, kind = 'info' ) {
		this.state = null;
		this._hide();
		if ( msg ) this.game.toast( msg, kind );
	}

	// ---- bobber and line ----

	_show() {
		const g = this.game;
		if ( ! this.obj ) {
			const grp = new THREE.Group();
			const top = new THREE.Mesh( new THREE.SphereGeometry( 0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2 ), M( 0xd8262a, { rough: 0.4 } ) );
			const bot = new THREE.Mesh( new THREE.SphereGeometry( 0.035, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2 ), M( 0xf2f2ee, { rough: 0.4 } ) );
			grp.add( top, bot );
			this.obj = grp;
			const geo = new THREE.BufferGeometry().setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( 13 * 3 ), 3 ) );
			this.line = new THREE.Line( geo, new THREE.LineBasicMaterial( { color: 0xdfe8ea, transparent: true, opacity: 0.55, depthWrite: false } ) );
			this.line.frustumCulled = false;
			this.line.layers.set( 1 );
		}
		g.scene.add( this.obj, this.line );
	}

	_hide() {
		if ( this.obj ) this.game.scene.remove( this.obj, this.line );
	}

	update( dt ) {
		const g = this.game;
		if ( ! this.state ) return;
		// walked off, dropped the rod, got in a car or into the water: the line comes in
		const moved = g.player.pos.distanceTo( this.castFrom ) > 2.2;
		if ( moved || g.player.vehicle || g.player.swimming || g.dead || ( this.rod && ! this.inv.findUid( this.rod.uid ) ) ) {
			if ( this.state === 'reel' ) g.actions.cancel();
			this.stop( moved ? 'You reel in the line' : null );
			return;
		}
		if ( this.state === 'cast' ) return;
		this.t += dt;
		const b = this.bobberPos;
		const base = g.physics.waterLevel( b.x, b.z );
		let y = base + Math.sin( this.t * 2.1 ) * 0.02;
		if ( this.state === 'wait' ) {
			this.waitT -= dt;
			// nibbles before the real bite
			if ( this.waitT < 3 && Math.random() < dt * 0.8 ) y -= 0.03;
			if ( this.waitT <= 0 ) {
				this.state = 'bite';
				this.biteT = 1.5;
				playItemSound( g, 'reel', { vol: 0.25, rate: 1.6 } );
				g.audio?.play( 'plop', { pos: b, vol: 0.7, rate: 0.8 } );
				g.player.shake = Math.max( g.player.shake, 0.15 );
			}
		} else if ( this.state === 'bite' ) {
			y -= 0.07 + Math.abs( Math.sin( this.t * 17 ) ) * 0.05;
			this.biteT -= dt;
			if ( this.biteT <= 0 ) {
				// missed it: the fish may steal the bait
				if ( Math.random() < 0.5 && this.inv.count( 'fishing_bait' ) > 0 ) { this.inv.consume( 'fishing_bait', 1 ); g.toast( 'Missed it — and it took the bait', 'info' ); } else g.toast( 'Missed it', 'info' );
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
		// the line from the rod tip (ahead and to the right of the eyes) sagging to the bobber
		const cam = g.camera;
		const tip = this._v.set( 0.35, - 0.05, - 1.6 ).applyQuaternion( cam.quaternion ).add( cam.position );
		const arr = this.line.geometry.attributes.position.array;
		const sag = this.state === 'bite' || this.state === 'reel' ? 0.05 : 0.6;
		for ( let i = 0; i <= 12; i ++ ) {
			const t = i / 12;
			arr[ i * 3 ] = tip.x + ( b.x - tip.x ) * t;
			arr[ i * 3 + 1 ] = tip.y + ( y + 0.03 - tip.y ) * t - Math.sin( t * Math.PI ) * sag;
			arr[ i * 3 + 2 ] = tip.z + ( b.z - tip.z ) * t;
		}
		this.line.geometry.attributes.position.needsUpdate = true;
	}

	dispose() {
		this.offProvider?.();
		this._hide();
		this.obj?.traverse( o => o.geometry?.dispose() );
		this.line?.geometry.dispose(); this.line?.material.dispose();
	}
}
