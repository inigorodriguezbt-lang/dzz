// Node check of the street worker: builds the road network and a few street cells (no browser).
//   node test/roads.mjs [x,z ...]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HeightField } from '../src/world/HeightField.js';
import { buildStreetCell } from '../src/world/streetgen.js';
import { buildNetwork, CELL } from '../src/city/roads/network.js';

const meta = JSON.parse( readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
let buf = readFileSync( new URL( '../public/data/terrain.bin.gz', import.meta.url ) );
buf = gunzipSync( buf );
const ab = buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength );
const hf = new HeightField( ab, meta );
const world = { cities: meta.cities, roads: meta.roads, streets: meta.streets, runways: meta.runways, buildings: meta.buildings };

let t = performance.now();
const net = buildNetwork( world, hf );
console.log( 'network', ( performance.now() - t ).toFixed( 0 ), 'ms', 'streets', net.streets.length, 'nodes', net.nodes.size,
	'runs', net.roads.reduce( ( a, r ) => a + r.runs.length, 0 ), 'fences', net.fences.length, 'events', net.events.length, 'signs', net.signs.length, 'markers', net.markers.length );
const ev = {};
for ( const e of net.events ) ev[ e.type ] = ( ev[ e.type ] || 0 ) + 1;
console.log( 'events', ev );

const spots = process.argv.slice( 2 ).length ? process.argv.slice( 2 ).map( s => s.split( ',' ).map( Number ) ) : [
	[ - 5000, - 9900 ], [ - 4390, - 10255 ], [ 31722, 11967 ], [ - 6000, - 11420 ], [ 14239, - 4494 ], [ - 5471, - 10812 ], [ 19307, 11647 ],
];
for ( const [ x, z ] of spots ) {
	for ( const lod of [ 0, 1 ] ) {
		const ci = Math.floor( x / CELL ), cj = Math.floor( z / CELL );
		t = performance.now();
		const r = buildStreetCell( hf, world, { ci, cj, lod } );
		const ms = performance.now() - t;
		const g = ( k ) => r[ k ] ? `${r[ k ].pos.length / 3}v/${r[ k ].idx.length / 3}t` : '-';
		console.log( `${x},${z} lod${lod} ${ms.toFixed( 0 )}ms road ${g( 'road' )} walk ${g( 'walk' )} kit ${g( 'kit' )} fence ${g( 'fence' )} props ${r.props.length / 8} signs ${r.signs.length / 10} cars ${r.cars.length / 12} decals ${r.decals.length / 8} boxes ${r.boxes.length / 8} wires ${r.wires.length / 6}` );
		for ( const k of [ 'road', 'walk', 'kit', 'fence' ] ) {
			const m = r[ k ];
			if ( ! m ) continue;
			for ( let i = 0; i < m.pos.length; i ++ ) if ( ! Number.isFinite( m.pos[ i ] ) ) { console.log( 'NaN in', k, i ); break; }
			const n = m.pos.length / 3;
			for ( let i = 0; i < m.idx.length; i ++ ) if ( m.idx[ i ] >= n ) { console.log( 'bad index', k ); break; }
		}
		for ( const k of [ 'props', 'signs', 'cars', 'decals', 'boxes', 'wires' ] ) for ( let i = 0; i < r[ k ].length; i ++ ) if ( ! Number.isFinite( r[ k ][ i ] ) ) { console.log( 'NaN in', k, i ); break; }
	}
}
