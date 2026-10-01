// A small pool of world workers. Jobs are promises; each job can carry a priority (lower first).
export class WorkerPool {
	constructor( count ) {
		this.workers = [];
		this.idle = [];
		this.queue = [];
		this.pending = new Map();
		this.nextId = 1;
		for ( let i = 0; i < count; i ++ ) {
			const w = new Worker( new URL( '../workers/world.worker.js', import.meta.url ), { type: 'module' } );
			w.onmessage = ( e ) => this._done( w, e.data );
			w.onerror = ( e ) => console.error( 'world worker error', e.message || e );
			this.workers.push( w );
			this.idle.push( w );
		}
	}

	// send the same message to every worker (init) with its own copy of `buffer`, or the buffer itself when it is
	// shared memory
	broadcast( msg, buffer ) {
		return Promise.all( this.workers.map( ( w ) => new Promise( ( resolve, reject ) => {
			const id = this.nextId ++;
			this.pending.set( id, { resolve, reject, worker: w } );
			const m = { ...msg, id };
			const copy = buffer instanceof ArrayBuffer;
			if ( buffer ) m.buffer = copy ? buffer.slice( 0 ) : buffer;
			w.postMessage( m, copy ? [ m.buffer ] : [] );
			this.idle.splice( this.idle.indexOf( w ), 1 );
		} ) ) );
	}

	run( msg, priority = 0, transfer = [] ) {
		return new Promise( ( resolve, reject ) => {
			const job = { msg, priority, transfer, resolve, reject, cancelled: false };
			this.queue.push( job );
			this._pump();
			return job;
		} );
	}

	// like run() but returns a handle that can be cancelled while still queued
	submit( msg, priority = 0, transfer = [] ) {
		const job = { msg, priority, transfer, cancelled: false };
		job.promise = new Promise( ( resolve, reject ) => { job.resolve = resolve; job.reject = reject; } );
		this.queue.push( job );
		this._pump();
		return job;
	}

	reprioritize( fn ) {
		for ( const j of this.queue ) j.priority = fn( j.msg, j.priority );
	}

	get busy() { return this.queue.length + ( this.workers.length - this.idle.length ); }

	_pump() {
		while ( this.idle.length && this.queue.length ) {
			let bi = 0;
			for ( let i = 1; i < this.queue.length; i ++ ) if ( this.queue[ i ].priority < this.queue[ bi ].priority ) bi = i;
			const job = this.queue.splice( bi, 1 )[ 0 ];
			if ( job.cancelled ) { job.resolve( null ); continue; }
			const w = this.idle.pop();
			const id = this.nextId ++;
			this.pending.set( id, { resolve: job.resolve, reject: job.reject, worker: w } );
			w.postMessage( { ...job.msg, id }, job.transfer );
		}
	}

	_done( w, data ) {
		const p = this.pending.get( data.id );
		this.pending.delete( data.id );
		this.idle.push( w );
		if ( p ) {
			if ( data.error ) { console.error( data.error ); p.reject( new Error( data.error ) ); } else p.resolve( data.result );
		}
		this._pump();
	}
}
