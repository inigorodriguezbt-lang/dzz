// The CPU twin of the FFT ocean off the main thread (see oceanSpectrum.js OceanCPU): the displacement
// grids the physics height queries sample, recomputed on request for a given time.
import { OceanCPU } from './oceanSpectrum.js';

let cpu = null, version = 0;

self.onmessage = ( e ) => {
	const m = e.data;
	if ( m.type === 'spectrum' ) {
		cpu = new OceanCPU( m.layout );
		cpu.setSpectrum( m.P );
		version = m.version;
		return;
	}
	if ( m.type === 'compute' && cpu ) {
		const grids = cpu.compute( m.t, m.chop, m.grids && m.grids.length === cpu.spec.length ? m.grids : null );
		self.postMessage( { type: 'grids', t: m.t, chop: m.chop, version, grids }, grids.map( ( g ) => g.buffer ) );
	}
};
