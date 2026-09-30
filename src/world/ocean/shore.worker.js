// Water-owned worker: the fine ground heights of a tile around the camera for the sea (depth under the
// waves, the swash on the sand), from its own copy of the baked terrain (world/HeightField.js, read only).
import { HeightField } from '../HeightField.js';

let hf = null;

const handlers = {
	init( m ) {
		hf = new HeightField( m.buffer, m.meta );
		return { ok: true };
	},
	// heights at the texel centres x0 + ( i + 0.5 ) * step (the terrain mesh's vertices when x0 + step / 2
	// lies on its 2 m lattice)
	tile( { x0, z0, n, step } ) {
		const h = new Float32Array( n * n );
		for ( let j = 0; j < n; j ++ ) {
			const z = z0 + ( j + 0.5 ) * step;
			for ( let i = 0; i < n; i ++ ) h[ j * n + i ] = hf.heightAt( x0 + ( i + 0.5 ) * step, z );
		}
		return { result: { x0, z0, n, step, h }, transfer: [ h.buffer ] };
	},
};

self.onmessage = ( e ) => {
	const m = e.data;
	try {
		const r = handlers[ m.type ]( m );
		const res = r && r.result !== undefined ? r.result : r;
		self.postMessage( { id: m.id, result: res }, ( r && r.transfer ) || [] );
	} catch ( err ) {
		self.postMessage( { id: m.id, error: String( err && err.stack || err ) } );
	}
};
