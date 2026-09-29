// Worlds are saved in the browser (IndexedDB) and can be exported to / imported from a file.
// A save is one JSON object:
//   { version, id, name, seed, mode: 'survival'|'creative', difficulty: 'easy'|'normal'|'hard', hardcore,
//     created, lastPlayed, playTime (s), thumb (data URL),
//     time: { hours (since day 0, 00:00), dayMinutes (real minutes per game day) },
//     weather: {...}, player: {...}, survival: {...}, stats: {...},
//     world: { looted: { buildingId: [spawn indices] }, containers: { key: [stacks] }, doors: { key: state },
//              items: [ world items ], vehicles: [ ... ], placed: [ ... ], killed: { cell: [count, hour] }, markers: [ ... ] } }
const DB = 'deadtide';
const STORE = 'worlds';
export const SAVE_VERSION = 1;

function openDB() {
	return new Promise( ( resolve, reject ) => {
		const r = indexedDB.open( DB, 1 );
		r.onupgradeneeded = () => { r.result.createObjectStore( STORE, { keyPath: 'id' } ); };
		r.onsuccess = () => resolve( r.result );
		r.onerror = () => reject( r.error );
	} );
}

function tx( db, mode, fn ) {
	return new Promise( ( resolve, reject ) => {
		const t = db.transaction( STORE, mode );
		const s = t.objectStore( STORE );
		const r = fn( s );
		t.oncomplete = () => resolve( r?.result );
		t.onerror = () => reject( t.error );
	} );
}

export class SaveSystem {
	constructor() { this.db = null; this.memory = new Map(); }

	async open() {
		try { this.db = await openDB(); } catch ( e ) { console.warn( 'IndexedDB unavailable, saves are kept in memory', e ); this.db = null; }
	}

	async list() {
		let all;
		if ( this.db ) all = await tx( this.db, 'readonly', s => s.getAll() );
		else all = [ ...this.memory.values() ];
		return ( all || [] ).map( w => ( {
			id: w.id, name: w.name, mode: w.mode, difficulty: w.difficulty, hardcore: w.hardcore, created: w.created, lastPlayed: w.lastPlayed,
			playTime: w.playTime, thumb: w.thumb, days: Math.floor( ( w.time?.hours || 0 ) / 24 ) + 1, seed: w.seed, dead: w.dead,
		} ) ).sort( ( a, b ) => ( b.lastPlayed || 0 ) - ( a.lastPlayed || 0 ) );
	}

	async load( id ) {
		if ( this.db ) return tx( this.db, 'readonly', s => s.get( id ) );
		return structuredClone( this.memory.get( id ) );
	}

	async save( w ) {
		w.lastPlayed = Date.now();
		if ( this.db ) { const copy = JSON.parse( JSON.stringify( w ) ); await tx( this.db, 'readwrite', s => s.put( copy ) ); } else this.memory.set( w.id, structuredClone( w ) );
	}

	async delete( id ) {
		if ( this.db ) await tx( this.db, 'readwrite', s => s.delete( id ) ); else this.memory.delete( id );
	}

	async rename( id, name ) {
		const w = await this.load( id );
		if ( ! w ) return;
		w.name = name;
		await this.save( w );
	}

	async duplicate( id ) {
		const w = await this.load( id );
		if ( ! w ) return null;
		w.id = newId(); w.name = w.name + ' (copy)'; w.created = Date.now();
		await this.save( w );
		return w;
	}

	exportWorld( w ) {
		const blob = new Blob( [ JSON.stringify( { format: 'deadtide-world', ...w } ) ], { type: 'application/json' } );
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = ( w.name || 'world' ).replace( /[^\w\- ]+/g, '' ).trim().replace( /\s+/g, '_' ) + '.deadtide.json';
		document.body.appendChild( a ); a.click(); a.remove();
		setTimeout( () => URL.revokeObjectURL( a.href ), 5000 );
	}

	async importWorld( file ) {
		const text = await file.text();
		let w;
		try { w = JSON.parse( text ); } catch ( e ) { throw new Error( 'That file is not a Deadtide world (bad JSON).' ); }
		if ( w.format !== 'deadtide-world' || ! w.player || ! w.time ) throw new Error( 'That file is not a Deadtide world.' );
		if ( ( w.version || 0 ) > SAVE_VERSION ) throw new Error( 'This world was saved by a newer version of the game.' );
		delete w.format;
		const existing = await this.load( w.id );
		if ( existing ) { w.id = newId(); w.name += ' (imported)'; }
		await this.save( w );
		return w;
	}

	static newWorld( { name, seed, mode = 'survival', difficulty = 'normal', hardcore = false, dayMinutes = 48, startHour = 7.5, spawn = 'random' } ) {
		const s = seed === '' || seed == null ? Math.floor( Math.random() * 2 ** 31 ) : ( /^\d+$/.test( String( seed ) ) ? + seed : hashSeed( String( seed ) ) );
		return {
			version: SAVE_VERSION, id: newId(), name: name || 'New World', seed: s, mode, difficulty, hardcore, spawn,
			created: Date.now(), lastPlayed: Date.now(), playTime: 0, thumb: null,
			time: { hours: startHour, dayMinutes },
			weather: null, player: null, survival: null, stats: { kills: 0, zombies: 0, animals: 0, deaths: 0, distance: 0, shots: 0, looted: 0, lives: 1, lifeStart: 0 },
			world: { looted: {}, containers: {}, doors: {}, items: [], vehicles: null, placed: [], killed: {}, markers: [] },
		};
	}
}

export function newId() { return Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 8 ); }
export function hashSeed( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }
