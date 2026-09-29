// Foraging the ground (DayZ style): look down at open ground outside towns and hold F to search it — dry sticks
// and the odd long pole under trees and in grass, driftwood and stones on the beach, stones on bare lava.
// Each 12 m patch yields once per game day.
import * as THREE from 'three';
import { getItem, makeStack } from './ItemDB.js';

const PATCH = 12;
const REGROW = 24; // game hours

export class Gathering {
	constructor( game ) {
		this.game = game;
		this.searched = new Map(); // patch key -> game hour searched
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
		this._s4 = [ 0, 0, 0, 0 ];
		this._n = new THREE.Vector3();
	}

	key( x, z ) { return Math.floor( x / PATCH ) + ',' + Math.floor( z / PATCH ); }

	// what this spot offers: { label, loot: [ [ id, min, max, chance ] ] } or null
	kind( x, z, y ) {
		const g = this.game, hf = g.hf;
		if ( y < g.physics.waterLevel( x, z ) + 0.05 ) return null;
		if ( hf.flagsNear( x, z ) & ( 1 | 4 | 8 | 16 | 32 ) ) return null; // roads, streets, runways, buildings, towns
		if ( y < 3 && g.world.isBeach?.( x, z ) ) return { label: 'Search the beach', sub: 'Driftwood, stones', loot: [ [ 'stick', 1, 3, 0.8 ], [ 'stone', 1, 2, 0.6 ], [ 'firewood', 1, 1, 0.15 ], [ 'rope', 1, 1, 0.04 ], [ 'empty_bottle', 1, 1, 0.08 ] ] };
		const s = hf.surfaceAt( x, z, this._s4 );
		if ( s[ 1 ] > 0.45 ) return { label: 'Search the rocks', sub: 'Loose stones', loot: [ [ 'stone', 1, 3, 0.9 ] ] };
		if ( hf.normalAt( x, z, this._n, 1 ).y < 0.75 ) return null;
		const lush = s[ 0 ] > 0.35;
		return { label: 'Search for sticks', sub: lush ? 'Dry branches under the trees' : 'Dry brush', loot: [ [ 'stick', 1, lush ? 4 : 2, 0.9 ], [ 'long_stick', 1, 1, lush ? 0.3 : 0.12 ], [ 'stone', 1, 1, 0.25 ], [ 'guava', 1, 2, lush ? 0.12 : 0 ], [ 'lilikoi', 1, 2, lush ? 0.08 : 0 ] ] };
	}

	provide( ray, maxDist ) {
		const g = this.game;
		// only when looking steeply down on foot, so the prompt does not follow you everywhere
		if ( g.player.vehicle || g.player.swimming || ray.dir.y > - 0.72 || g.world.isIndoors?.( g.player.pos ) ) return null;
		const hit = g.physics.raycast( ray.origin, ray.dir, maxDist, { water: true } );
		if ( ! hit || hit.kind !== 'ground' ) return null;
		const x = hit.point.x, z = hit.point.z;
		const k = this.key( x, z );
		const last = this.searched.get( k );
		if ( last !== undefined && g.time.hours - last < REGROW ) return null;
		const kind = this.kind( x, z, hit.point.y );
		if ( ! kind ) return null;
		return [ { t: hit.t, id: 'gather:' + k, label: kind.label, sub: kind.sub, hold: 1.3, action: () => this.gather( k, kind ) } ];
	}

	gather( k, kind ) {
		const g = this.game, inv = g.player.inventory;
		this.searched.set( k, g.time.hours );
		const got = [];
		for ( const [ id, a, b, chance ] of kind.loot ) {
			if ( ! getItem( id ) || Math.random() > chance ) continue;
			const n = a + Math.floor( Math.random() * ( b - a + 1 ) );
			const s = makeStack( id, n );
			if ( ! s ) continue;
			if ( inv.add( s ) > 0 ) g.dropStack( s );
			g.events.emit( 'item:pick', { stack: { ...s, qty: n } } );
			got.push( id );
		}
		g.audio?.play( 'pickup', { vol: 0.4 } );
		if ( ! got.length ) g.toast( 'Nothing useful here', 'info' );
		inv.changed();
	}

	update() {}

	serialize( save ) {
		save.world = save.world || {};
		const h = this.game.time.hours, o = {};
		for ( const [ k, v ] of this.searched ) if ( h - v < REGROW ) o[ k ] = Math.round( v * 10 ) / 10;
		save.world.gathered = o;
	}
	load( save ) {
		this.searched.clear();
		for ( const [ k, v ] of Object.entries( save.world?.gathered || {} ) ) this.searched.set( k, v );
	}
	dispose() { this.offProvider?.(); }
}
