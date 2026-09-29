// Map markers: placed on the map, from /locate, and the last death location. Saved with the world.
export class Markers {
	constructor( game ) {
		this.game = game;
		this.items = [];
		this.nextId = 1;
	}
	list() { return this.items; }
	add( m ) {
		// replace an existing marker of the same label from /locate
		if ( m.kind === 'locate' ) this.items = this.items.filter( o => ! ( o.kind === 'locate' && o.label === m.label ) );
		if ( m.kind === 'death' ) this.items = this.items.filter( o => o.kind !== 'death' );
		const o = { id: this.nextId ++, x: m.x, z: m.z, label: m.label || 'Marker', kind: m.kind || 'user', color: m.color || null };
		this.items.push( o );
		if ( this.items.length > 40 ) this.items.shift();
		return o;
	}
	remove( id ) { this.items = this.items.filter( o => o.id !== id ); }
	clear() { this.items = this.items.filter( o => o.kind === 'death' ); }
	serialize( save ) { save.world.markers = this.items; }
	load( save ) { this.items = save.world?.markers || []; this.nextId = this.items.reduce( ( a, o ) => Math.max( a, o.id + 1 ), 1 ); }
}
