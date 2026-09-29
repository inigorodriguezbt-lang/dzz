// Your own bodies: when you die, everything you wore and carried stays where you fell, in a body you can
// come back to and search (it's marked on the map). Saved with the world; old bodies rot after a few days.
import * as THREE from 'three';
import { itemsOf } from './Inventory.js';
import { patchMaterial } from '../render/Materials.js';

const ROT_DAYS = 4;

export class Bodies {
	constructor( game ) {
		this.game = game;
		this.list = []; // { id, x, y, z, yaw, hour, items: [stacks], mesh }
		this.nextId = 1;
		game.events.on( 'playerDeath', ( e ) => this.create( e.pos, e.inventory ) );
		game.interact.addProvider( ( ray ) => this.provide( ray ) );
		this.mat = patchMaterial( new THREE.MeshStandardMaterial( { color: 0x6b5a4c, roughness: 0.9 } ), 'body-std' );
		this.skin = patchMaterial( new THREE.MeshStandardMaterial( { color: 0xb08a70, roughness: 0.8 } ), 'body-skin' );
	}

	create( pos, inv ) {
		const items = [];
		// everything goes in: worn clothes (with their contents), weapons, pockets
		for ( const s of Object.values( inv.equip ) ) if ( s ) items.push( s );
		for ( const s of Object.values( inv.weapons ) ) if ( s ) items.push( s );
		for ( const s of inv.pockets ) items.push( s );
		if ( ! items.length ) return;
		const b = { id: this.nextId ++, x: pos.x, y: pos.y, z: pos.z, yaw: this.game.player.yaw, hour: this.game.time.hours, items };
		this.list.push( b );
		this._mesh( b );
	}

	_mesh( b ) {
		// a crumpled figure lying face down
		const g = new THREE.Group();
		const add = ( geo, mat, x, y, z, rx = 0, ry = 0, rz = 0 ) => { const m = new THREE.Mesh( geo, mat ); m.position.set( x, y, z ); m.rotation.set( rx, ry, rz ); m.castShadow = m.receiveShadow = true; g.add( m ); };
		const cap = ( r, l ) => new THREE.CapsuleGeometry( r, l, 4, 8 );
		add( cap( 0.17, 0.45 ), this.mat, 0, 0.17, 0, Math.PI / 2 ); // torso
		add( new THREE.SphereGeometry( 0.12, 12, 10 ), this.skin, 0, 0.14, - 0.52 ); // head
		add( cap( 0.07, 0.55 ), this.mat, 0.12, 0.08, 0.62, Math.PI / 2, 0.1 ); // legs
		add( cap( 0.07, 0.55 ), this.mat, - 0.13, 0.08, 0.6, Math.PI / 2, - 0.2 );
		add( cap( 0.055, 0.45 ), this.skin, 0.32, 0.07, - 0.2, Math.PI / 2, 0.9 ); // arms
		add( cap( 0.055, 0.45 ), this.skin, - 0.3, 0.07, - 0.05, Math.PI / 2, - 0.4 );
		g.position.set( b.x, this.game.physics.ground( b.x, b.z, b.y + 0.5 ).y, b.z );
		g.rotation.y = b.yaw;
		this.game.scene.add( g );
		b.mesh = g;
	}

	provide( ray ) {
		const out = [];
		for ( const b of this.list ) {
			const c = new THREE.Vector3( b.x, b.mesh ? b.mesh.position.y + 0.2 : b.y, b.z );
			const t = rayPoint( ray, c, 0.7 );
			if ( t === null ) continue;
			out.push( {
				id: 'body' + b.id, t, label: 'Search your body', sub: `${b.items.length} items`,
				action: () => {
					const g = this.game;
					g.actions.start( { label: 'Searching', time: 1.2, onDone: () => g.app.ui.openContainer( { key: 'body' + b.id, label: 'Your body', capacity: 999, items: b.items, kind: 'body', pos: c } ) } );
				},
			} );
		}
		return out;
	}

	update() {
		const now = this.game.time.hours;
		for ( const b of [ ...this.list ] ) {
			if ( ! b.items.length || now - b.hour > ROT_DAYS * 24 ) {
				if ( b.mesh ) b.mesh.removeFromParent();
				this.list.splice( this.list.indexOf( b ), 1 );
			}
		}
	}

	serialize( save ) { save.world.bodies = this.list.map( b => ( { id: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw, hour: b.hour, items: b.items } ) ); }
	load( save ) {
		for ( const b of this.list ) b.mesh?.removeFromParent();
		this.list = ( save.world?.bodies || [] ).map( b => ( { ...b } ) );
		for ( const b of this.list ) this._mesh( b );
		this.nextId = this.list.reduce( ( a, b ) => Math.max( a, b.id + 1 ), 1 );
	}
	dispose() { for ( const b of this.list ) b.mesh?.removeFromParent(); }
}

// distance along the ray to the closest approach of a sphere, or null
function rayPoint( ray, c, r ) {
	const o = ray.origin, d = ray.dir;
	const t = ( c.x - o.x ) * d.x + ( c.y - o.y ) * d.y + ( c.z - o.z ) * d.z;
	if ( t < 0 ) return null;
	const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y, pz = o.z + d.z * t - c.z;
	return px * px + py * py + pz * pz <= r * r ? t : null;
}

export { itemsOf };
