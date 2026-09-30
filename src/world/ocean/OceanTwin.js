// CPU height queries of the FFT ocean for swimming, boats and splashes. The displacement grids of the
// three largest cascades (oceanSpectrum.js OceanCPU) are computed in a worker for the latest ocean time;
// queries sample the newest grids and extrapolate the height by dDy/dt over their age (a frame or two).
// Without a worker (Node tests) or before its first answer, the grids are computed here.
import { OceanCPU, CPU_LAYOUT, sampleGrids } from './oceanSpectrum.js';

export class OceanTwin {
	constructor() {
		this.layout = CPU_LAYOUT;
		this.P = null;
		this.version = 0;
		this.grids = null; // newest grids
		this.gridT = 0; // their time
		this.gridChop = 0.9;
		this.spare = null; // buffers handed back to the worker
		this.fromWorker = false;
		this.busy = false;
		this.local = null;
		this.worker = null;
		if ( typeof Worker !== 'undefined' ) {
			try {
				this.worker = new Worker( new URL( './ocean.worker.js', import.meta.url ), { type: 'module' } );
				this.worker.onmessage = ( e ) => this._onGrids( e.data );
				this.worker.onerror = ( e ) => { console.warn( 'ocean worker failed, heights on the main thread', e.message || e ); this.worker = null; };
			} catch ( e ) { this.worker = null; }
		}
		this._o = [ 0, 0, 0 ];
	}

	setSpectrum( P ) {
		this.P = P;
		this.version ++;
		this.grids = null;
		this.spare = null;
		this.local = null;
		if ( this.worker ) this.worker.postMessage( { type: 'spectrum', layout: this.layout, P, version: this.version } );
	}

	_onGrids( m ) {
		this.busy = false;
		if ( m.version !== this.version ) return;
		// the previous worker grids go back to it with the next request (no allocation per frame)
		if ( this.grids && this.fromWorker ) this.spare = this.grids;
		this.grids = m.grids;
		this.fromWorker = true;
		this.gridT = m.t;
		this.gridChop = m.chop;
	}

	// once per frame: ask for the grids at time t (the next frame's queries extrapolate from them)
	request( t, chop ) {
		if ( ! this.P ) return;
		if ( this.worker ) {
			if ( this.busy ) return;
			this.busy = true;
			const give = this.spare;
			this.spare = null;
			this.worker.postMessage( { type: 'compute', t, chop, grids: give }, give ? give.map( ( g ) => g.buffer ) : [] );
		}
		this._want = t; this._wantChop = chop;
	}

	// grids to sample and their age at time t: computed here when there is nothing recent enough
	_gridsFor( t ) {
		if ( this.grids && Math.abs( t - this.gridT ) < 0.4 && this.gridChop === ( this._wantChop ?? this.gridChop ) ) return this.grids;
		if ( ! this.P ) return null;
		this.local ??= new OceanCPU( this.layout );
		if ( ! this.local.spec ) this.local.setSpectrum( this.P );
		// (on the main thread only until the worker catches up, or without a worker)
		const chop = this._wantChop ?? 0.9;
		this._localGrids = this.local.compute( t, chop, this._localGrids );
		this.grids = this._localGrids; this.gridT = t; this.gridChop = chop; this.fromWorker = false;
		return this.grids;
	}

	// displacement ( Dx, Dy, Dz ) of the CPU cascades at Lagrangian point x, z; att[ c ] per-cascade weights
	disp( x, z, t, att, sizes, gpuN, out = this._o ) {
		const g = this._gridsFor( t );
		if ( ! g ) { out[ 0 ] = out[ 1 ] = out[ 2 ] = 0; return out; }
		return sampleGrids( this.layout, sizes, g, x, z, att, t - this.gridT, out, gpuN );
	}

	dispose() { if ( this.worker ) this.worker.terminate(); this.worker = null; }
}
