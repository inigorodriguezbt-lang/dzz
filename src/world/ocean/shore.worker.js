// Water-owned worker: for a tile around the camera, the fine ground heights under the sea (the depth under
// the waves, the swash on the sand) and the shoreline waves' travel-time field (ShoreField.js), from its own
// copy of the baked terrain (world/HeightField.js, read only).
import { HeightField } from '../HeightField.js';
import { computeShoreField, pickSwellDir } from './ShoreField.js';
import { laceData } from './SurfFoam.js';
import { buildStations } from './breakerStations.js';

let hf = null;

const handlers = {
	init( m ) {
		hf = new HeightField( m.buffer, m.meta );
		return { ok: true };
	},
	// the surf lace texture (Tidewater SurfFoam.js makeLaceTexture), RGBA8 size^2
	lace( { size } ) {
		const data = laceData( size );
		return { result: { size, data }, transfer: [ data.buffer ] };
	},
	// heights at the texel centres x0 + ( i + 0.5 ) * step (the terrain mesh's vertices when x0 + step / 2
	// lies on its 2 m lattice); the shore field at fieldRes over the same square
	tile( { x0, z0, n, step, fieldRes } ) {
		const h = new Float32Array( n * n );
		for ( let j = 0; j < n; j ++ ) {
			const z = z0 + ( j + 0.5 ) * step;
			for ( let i = 0; i < n; i ++ ) h[ j * n + i ] = hf.heightAt( x0 + ( i + 0.5 ) * step, z );
		}
		const size = n * step;
		// bilinear on the tile, the coarse heights outside
		const heightAt = ( x, z ) => {
			const fx = ( x - x0 ) / step - 0.5, fz = ( z - z0 ) / step - 0.5;
			if ( fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1 ) return hf.coarseBilinear( x, z );
			const i = Math.min( Math.floor( fx ), n - 2 ), j = Math.min( Math.floor( fz ), n - 2 ), tx = fx - i, tz = fz - j;
			const a = h[ j * n + i ] * ( 1 - tx ) + h[ j * n + i + 1 ] * tx;
			const b = h[ ( j + 1 ) * n + i ] * ( 1 - tx ) + h[ ( j + 1 ) * n + i + 1 ] * tx;
			return a * ( 1 - tz ) + b * tz;
		};
		const cx = x0 + size / 2, cz = z0 + size / 2;
		const swellDir = pickSwellDir( ( x, z ) => - heightAt( x, z ), cx, cz, size * 0.5 );
		let field = null;
		if ( swellDir ) field = computeShoreField( heightAt, { x0, z0, size, res: fieldRes, swellDir } );
		// the breakers' shoreline stations near the centre (they need the travel-time field)
		const stations = field ? buildStations( h, n, step, x0, z0, { cx, cz } ) : null;
		const transfer = [ h.buffer ];
		if ( field ) transfer.push( field.data.buffer, stations.data.buffer );
		return { result: { x0, z0, n, step, h, field, stations }, transfer };
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
