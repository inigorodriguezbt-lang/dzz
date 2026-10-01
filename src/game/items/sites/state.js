// What the player has done to the outdoor sites: items taken (by stable key, with the game hour), one-off
// interactions used (salvage, cut a parachute, open a cash box), stashes dug up. Taken items come back after the
// kind's respawn time, rolled anew (the generation is part of the roll's seed, as in the buildings' loot spots).
// Node-safe; saved as save.world.sites.
export class SiteState {
	constructor() {
		this.taken = new Map(); // item key -> game hours when taken
		this.used = new Map(); // interaction key -> game hours
		this.dug = new Map(); // stash key -> game hours
	}

	take( key, hours ) { this.taken.set( key, hours ); }

	// the roll generation for an item key at `hours`: 0 untouched, -1 still gone, else a new generation per respawn period
	gen( key, hours, respawnH ) {
		const t = this.taken.get( key );
		if ( t === undefined ) return 0;
		if ( ! ( hours - t >= respawnH ) ) return - 1;
		return 1 + Math.floor( hours / respawnH );
	}

	use( key, hours ) { this.used.set( key, hours ); }
	// an interaction is available again after `againH` hours (Infinity: once)
	usable( key, hours, againH = Infinity ) {
		const t = this.used.get( key );
		return t === undefined || hours - t >= againH;
	}

	dig( key, hours ) { this.dug.set( key, hours ); }
	isDug( key ) { return this.dug.has( key ); }

	// forget takes that have respawned anyway (gen 0 rolls the same item a respawn would); a take that never
	// respawns (stashes, supply drops) is kept
	prune( hours, maxH = 240 ) {
		for ( const [ k, t ] of this.taken ) if ( hours - t > maxH && ! /^(stash|drop):/.test( k ) ) this.taken.delete( k );
		// a body searched long ago has been restocked anyway (its key ends in :b<n>)
		for ( const [ k, t ] of this.used ) if ( hours - t > maxH && /:b\d+$/.test( k ) ) this.used.delete( k );
	}

	serialize( hours ) {
		this.prune( hours );
		const r = ( v ) => Math.round( v * 100 ) / 100;
		return {
			taken: Object.fromEntries( [ ...this.taken ].map( ( [ k, v ] ) => [ k, r( v ) ] ) ),
			used: Object.fromEntries( [ ...this.used ].map( ( [ k, v ] ) => [ k, r( v ) ] ) ),
			dug: Object.fromEntries( [ ...this.dug ].map( ( [ k, v ] ) => [ k, r( v ) ] ) ),
		};
	}

	load( o ) {
		this.taken = new Map( Object.entries( o?.taken || {} ).filter( ( [ , v ] ) => Number.isFinite( v ) ) );
		this.used = new Map( Object.entries( o?.used || {} ).filter( ( [ , v ] ) => Number.isFinite( v ) ) );
		this.dug = new Map( Object.entries( o?.dug || {} ).filter( ( [ , v ] ) => Number.isFinite( v ) ) );
	}
}
