// Node check of the street worker: builds the road network and a few street cells (no browser).
//   node test/roads.mjs [x,z ...]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HeightField } from '../src/world/HeightField.js';
import { buildStreetCell } from '../src/world/streetgen.js';
import { buildNetwork, CELL, nearestOnNetwork, roadsideSpots, segDist, lotAt, inBuilding, highwayEdgeDist } from '../src/city/roads/network.js';

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
check( net.regs.length > 20 && net.regs.every( g => Number.isFinite( g.x + g.z ) ), 'speed limit signs (' + net.regs.length + ')' );
check( net.fences.length > 0 && net.fences.every( f => Math.abs( Math.hypot( f.ox, f.oz ) - 1 ) < 1e-6 ), 'fence outward normals' );
// the outward normal points away from the base: the fence midpoint moved outward is farther from the city centre
check( net.fences.every( f => { const c = meta.cities[ f.city ], mx = ( f.ax + f.bx ) / 2, mz = ( f.az + f.bz ) / 2; return Math.hypot( mx + f.ox * 5 - c.x, mz + f.oz * 5 - c.z ) > Math.hypot( mx - c.x, mz - c.z ); } ), 'fences face outward' );
// the lamp flicker's CPU twin (drives the real lights) stays in range
{
	const { flickerAt } = await import( '../src/city/roads/materials.js' ).catch( () => ( {} ) );
	if ( flickerAt ) {
		let on = 0;
		for ( let t = 0; t < 600; t += 0.37 ) { const f = flickerAt( 0.42, t ); check( f >= 0 && f <= 1, 'flicker range' ); if ( f > 0.5 ) on ++; }
		console.log( 'flicker duty', ( on / ( 600 / 0.37 ) ).toFixed( 2 ) );
	}
}
const spotsN = roadsideSpots( net, - 4390, - 10255, 150 );
check( spotsN.length > 50 && spotsN.every( ( [ x, z, yaw ] ) => Number.isFinite( x + z + yaw ) && Math.hypot( x + 4390, z + 10255 ) <= 150 ), 'roadside spots downtown' );
console.log( 'roadside spots downtown', spotsN.length );
// the city frames fitted to the baked street ends (the stored angles are rounded to 0.01 rad)
{
	let mx = 0, sum = 0, n = 0;
	for ( const s of meta.streets ) {
		const c = meta.cities[ s[ 0 ] ], F = net.frames[ s[ 0 ] ];
		for ( const [ x, z ] of [ [ s[ 1 ], s[ 2 ] ], [ s[ 4 ], s[ 5 ] ] ] ) {
			const [ u, v ] = F.toG( x, z ), [ px, pz ] = F.toW( Math.round( u / c.pu ) * c.pu, Math.round( v / c.pv ) * c.pv );
			const e = Math.hypot( px - x, pz - z ); mx = Math.max( mx, e ); sum += e; n ++;
		}
	}
	console.log( 'grid fit residual mean', ( sum / n ).toFixed( 3 ), 'max', mx.toFixed( 2 ) );
	check( sum / n < 0.1 && mx < 1, 'city grids fit the baked streets' );
}
// parking lots: off the buildings, the streets and the highways, each with a driveway on its street
{
	let bad = 0, area = 0;
	for ( const L of net.lots ) {
		area += L.la * L.lb;
		for ( let i = 0; i <= 8; i ++ ) for ( let j = 0; j <= 8; j ++ ) {
			const a = ( i / 8 - 0.5 ) * ( L.la - 0.4 ), b = ( j / 8 - 0.5 ) * ( L.lb - 0.4 );
			const x = L.x + L.ax * a + L.bx * b, z = L.z + L.az * a + L.bz * b;
			let onSt = false;
			net.shash.query( x, z, 24, ( st ) => { if ( segDist( st, x, z ) < st.w / 2 + st.walk - 0.05 ) { onSt = true; return false; } } );
			if ( inBuilding( net, x, z, 0.5 ) || onSt || highwayEdgeDist( net, x, z, 20 )[ 0 ] < 1 || lotAt( net, x, z ) !== L ) { bad ++; break; }
		}
		const st = L.street;
		if ( ! ( L.drive[ 0 ] > st.w / 2 + st.walk && L.drive[ 1 ] < st.len - st.w / 2 - st.walk && st.drives.some( d => d[ 0 ] === L.side && d[ 1 ] === L.drive[ 0 ] ) ) ) bad ++;
	}
	console.log( 'parking lots', net.lots.length, ( area / 1e4 ).toFixed( 1 ), 'ha' );
	check( net.lots.length > 100 && bad === 0, 'parking lots clear of buildings / streets / highways (' + bad + ' bad)' );
	check( lotAt( net, 0, 0 ) === null, 'no lot in the channel' );
}
// deterministic: a second build (as every worker does) gives the same lots
{
	const net2 = buildNetwork( world, hf );
	check( net2.lots.length === net.lots.length && net2.lots.every( ( L, i ) => L.x === net.lots[ i ].x && L.z === net.lots[ i ].z && L.la === net.lots[ i ].la && L.driveA === net.lots[ i ].driveA ), 'network deterministic' );
}
// nothing of the street furniture, the wrecks or the power lines inside a building (baked or infill)
{
	let bad = 0;
	for ( const [ x0, z0 ] of [ [ - 4390, - 10255 ], [ - 4021, - 10090 ], [ - 3960, - 9824 ], [ 31722, 11967 ], [ 13744, - 4314 ], [ - 2827, - 11438 ] ] ) {
		const r = buildStreetCell( hf, world, { ci: Math.floor( x0 / CELL ), cj: Math.floor( z0 / CELL ), lod: 0 } );
		for ( const [ arr, stride, ix, iz ] of [ [ r.props, 8, 1, 3 ], [ r.cars, 12, 1, 3 ], [ r.signs, 10, 2, 4 ], [ r.wires, 3, 0, 2 ] ] ) {
			for ( let i = 0; i < arr.length; i += stride ) if ( inBuilding( net, arr[ i + ix ] + r.ox, arr[ i + iz ] + r.oz, 0.1 ) ) bad ++;
		}
	}
	check( bad === 0, 'street furniture outside the buildings (' + bad + ' inside)' );
}
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
		// every single-sided triangle is wound to face along its vertex normal (else it is culled: holes)
		for ( const k of [ 'road', 'walk', 'kit' ] ) {
			const m = r[ k ];
			if ( ! m ) continue;
			const P = m.pos, N = m.nor, I = m.idx;
			let rev = 0;
			for ( let t = 0; t < I.length; t += 3 ) {
				const a = I[ t ] * 3, b = I[ t + 1 ] * 3, c = I[ t + 2 ] * 3;
				const ux = P[ b ] - P[ a ], uy = P[ b + 1 ] - P[ a + 1 ], uz = P[ b + 2 ] - P[ a + 2 ], vx = P[ c ] - P[ a ], vy = P[ c + 1 ] - P[ a + 1 ], vz = P[ c + 2 ] - P[ a + 2 ];
				if ( ( uy * vz - uz * vy ) * N[ a ] + ( uz * vx - ux * vz ) * N[ a + 1 ] + ( ux * vy - uy * vx ) * N[ a + 2 ] < 0 ) rev ++;
			}
			check( rev === 0, `${x},${z} lod${lod} ${k}: ${rev} triangles wound against their normals` );
		}
	}
}

console.log( fails ? fails + ' check(s) FAILED' : 'all checks passed' );
process.exitCode = fails ? 1 : 0;
