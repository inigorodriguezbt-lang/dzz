// Tiny event bus. Game-wide events used across systems:
//   'noise'     { pos: Vector3, radius, source }     (gunshots, sprinting, doors, engines; zombies listen)
//   'damage'    { target, amount, source, zone }
//   'kill'      { target, source, weapon }
//   'item:pick' { stack }, 'item:drop' { stack }
//   'toast'     { text, kind, icon }
//   'save'      {}
export class Events {
	constructor() { this.map = new Map(); }
	on( name, fn ) {
		if ( ! this.map.has( name ) ) this.map.set( name, new Set() );
		this.map.get( name ).add( fn );
		return () => this.map.get( name ).delete( fn );
	}
	emit( name, data ) {
		const s = this.map.get( name );
		if ( s ) for ( const fn of [ ...s ] ) { try { fn( data ); } catch ( e ) { console.error( 'event', name, e ); } }
	}
}
