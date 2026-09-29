// Vehicle model worker: builds one vehicle type's geometries off the main thread (see models/index.js).
import { buildModel, packModel } from './index.js';

self.onmessage = ( e ) => {
	const { name } = e.data;
	try {
		const { data, transfer } = packModel( buildModel( name ) );
		self.postMessage( { name, data }, transfer );
	} catch ( err ) {
		self.postMessage( { name, error: String( err && err.stack || err ) } );
	}
};
