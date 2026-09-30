// A worker thread running the buildings module's worker jobs (as src/workers/world.worker.js does in the browser),
// for Node tests that want the main-thread costs measured without the jobs' allocations and GC.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { HeightField } from '../../src/world/HeightField.js';
import { buildingJob } from '../../src/city/buildings/worker.js';

const meta = JSON.parse( fs.readFileSync( workerData.world, 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( workerData.terrain ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
const world = { cities: meta.cities, roads: meta.roads, streets: meta.streets, runways: meta.runways, buildings: meta.buildings };
parentPort.on( 'message', ( { id, msg } ) => {
	try {
		const { result, transfer } = buildingJob( hf, world, msg );
		parentPort.postMessage( { id, result }, transfer );
	} catch ( e ) { parentPort.postMessage( { id, error: e.stack } ); }
} );
parentPort.postMessage( { ready: true } );
