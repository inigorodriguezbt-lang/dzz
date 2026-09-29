// Node check of the street worker: builds the road network and a few street cells (no browser).
//   node test/roads.mjs [x,z ...]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HeightField } from '../src/world/HeightField.js';
import { buildStreetCell } from '../src/world/streetgen.js';
import { buildNetwork, CELL, nearestOnNetwork, roadsideSpots } from '../src/city/roads/network.js';

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

// queries used by game.roads.nearestRoad / spawnPoints
let fails = 0;
const check = ( ok, msg ) => { if ( ! ok ) { fails ++; console.log( 'FAIL', msg ); } };
for ( const [ x, z, want ] of [ [ - 4390, - 10255, 'street' ], [ - 6682, - 10946, 'freeway' ], [ 31722, 11967, 'street' ] ] ) {
	const r = nearestOnNetwork( net, x, z, 80 );
	console.log( 'nearest', x, z, r && { kind: r.kind, name: r.name, dist: + r.dist.toFixed( 2 ), lanes: r.lanes, width: r.width } );
	check( r && r.kind === want && r.dist < 80 && Math.abs( Math.hypot( r.dx, r.dz ) - 1 ) < 1e-6, 'nearest road at ' + x + ',' + z );
}
check( nearestOnNetwork( net, 0, 0, 50 ) === null, 'no road in the channel' );
const spotsN = roadsideSpots( net, - 4390, - 10255, 150 );
check( spotsN.length > 50 && spotsN.every( ( [ x, z, yaw ] ) => Number.isFinite( x + z + yaw ) && Math.hypot( x + 4390, z + 10255 ) <= 150 ), 'roadside spots downtown' );
console.log( 'roadside spots downtown', spotsN.length );
// every sidewalk collider is a sane box
{
	const r = buildStreetCell( hf, world, { ci: Math.floor( - 4390 / CELL ), cj: Math.floor( - 10255 / CELL ), lod: 0 } );
	const B = r.boxes;
	let bad = 0;
	for ( let i = 0; i < B.length; i += 8 ) if ( ! ( B[ i + 3 ] > 0 && B[ i + 4 ] > 0 && B[ i + 5 ] > 0 && B[ i + 4 ] < 3 ) ) bad ++;
	check( B.length > 0 && bad === 0, 'collider boxes (' + bad + ' bad of ' + B.length / 8 + ')' );
}

// every prop model and car shell builds, with finite vertices, sane sizes and the attributes the shaders expect
{
	const { MODELS, expandProp } = await import( '../src/city/roads/models.js' );
	const { carGeometries, carPanels } = await import( '../src/city/roads/cars.js' );
	const { PROP, PROP_COUNT, CAR_DIMS } = await import( '../src/city/roads/kinds.js' );
	const finite = ( g ) => g.attributes.position.array.every( Number.isFinite ) && g.attributes.normal.array.every( Number.isFinite );
	let tris = 0;
	for ( const k in MODELS ) {
		const g = MODELS[ k ].build();
		const bb = g.boundingBox, sz = [ bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z ];
		check( finite( g ) && g.attributes.pbr && g.attributes.color && sz.every( v => v > 0.01 && v < 12 ) && bb.min.y > - 0.05, 'prop model ' + k + ' ' + sz.map( v => v.toFixed( 2 ) ) );
		tris += g.attributes.position.count / 3;
	}
	for ( let t = 0; t < PROP_COUNT; t ++ ) for ( const part of expandProp( t, 0, 0.5 ) ) check( MODELS[ part.key ], 'prop type ' + t + ' -> ' + part.key );
	const cg = carGeometries();
	for ( const lod of [ 'near', 'far', 'low' ] ) cg[ lod ].forEach( ( g, t ) => {
		const bb = g.boundingBox, D = CAR_DIMS[ t ];
		check( finite( g ) && g.attributes.cpart && Math.abs( ( bb.max.z - bb.min.z ) - D.L ) < 0.5 && Math.abs( bb.max.y - D.H ) < 0.35 && bb.min.y > - 0.02, `car ${t} ${lod} L ${( bb.max.z - bb.min.z ).toFixed( 2 )} H ${bb.max.y.toFixed( 2 )}` );
	} );
	for ( let t = 0; t < CAR_DIMS.length; t ++ ) check( carPanels( t, 63, 12345, [] ).every( p => p.m.elements.every( Number.isFinite ) ), 'car panels ' + t );
	console.log( 'models ok, prop tris total', tris, 'car tris near/far/low', [ 'near', 'far', 'low' ].map( l => cg[ l ].reduce( ( a, g ) => a + g.attributes.position.count / 3, 0 ) / 9 | 0 ).join( '/' ) );
	void PROP;
}

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

console.log( fails ? fails + ' check(s) FAILED' : 'all checks passed' );
process.exitCode = fails ? 1 : 0;
