// Vegetation placement checks (Node, no browser): runs the worker-side scatter on the real terrain
// at the test spots and checks the ecology rules (species by place, nothing on pavement / in the sea),
// and the ground layer's flora masks (grass field and beach pebbles: meadows, backshore, no grass on the
// town blocks, streets and sidewalks).
//   node test/vegetation.mjs [x,z ...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { HeightField, FLAG } from '../src/world/HeightField.js';
import { scatterCell, citiesNear } from '../src/world/scatter.js';
import { SP, NSP, STRIDE, SPECIES, LAYER, LAYER_CELL } from '../src/world/vegetation/species.js';

const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// obstacles like Vegetation._obstaclesFor (buildings + roads / streets near a cell)
const B = [], S = [];
{
	const bd = meta.buildings.data;
	for ( let k = 0; k < bd.length; k += 11 ) B.push( [ bd[ k ], bd[ k + 1 ], bd[ k + 2 ] / 2, bd[ k + 3 ] / 2, bd[ k + 4 ], ( bd[ k + 8 ] || 1 ) * 3.2 ] );
	for ( const rw of meta.runways || [] ) B.push( [ rw.x, rw.z, rw.len / 2 + 30, rw.w / 2 + 12, rw.angle, 0 ] );
	const KINDS = { metro: 1, town: 2, village: 3, resort: 4, military: 5, airport: 5, observatory: 5 };
	for ( const st of meta.streets ) S.push( [ st[ 1 ], st[ 2 ], st[ 4 ], st[ 5 ], st[ 7 ] / 2 + ( st[ 8 ] || 0 ), KINDS[ meta.cities[ st[ 0 ] ]?.kind ] || 2 ] );
	for ( const rd of meta.roads ) { const p = rd.pts; for ( let k = 0; k + 5 < p.length; k += 3 ) S.push( [ p[ k ], p[ k + 1 ], p[ k + 3 ], p[ k + 4 ], rd.w / 2 + 1, 0 ] ); }
}
function obstacles( x0, z0, size ) {
	const m = 60;
	const bld = B.filter( b => b[ 0 ] > x0 - m - b[ 2 ] - b[ 3 ] && b[ 0 ] < x0 + size + m + b[ 2 ] + b[ 3 ] && b[ 1 ] > z0 - m - b[ 2 ] - b[ 3 ] && b[ 1 ] < z0 + size + m + b[ 2 ] + b[ 3 ] );
	const seg = S.filter( s => Math.max( s[ 0 ], s[ 2 ] ) > x0 - m && Math.min( s[ 0 ], s[ 2 ] ) < x0 + size + m && Math.max( s[ 1 ], s[ 3 ] ) > z0 - m && Math.min( s[ 1 ], s[ 3 ] ) < z0 + size + m );
	return { bld: bld.length ? new Float32Array( bld.flat() ) : null, seg: seg.length ? new Float32Array( seg.flat() ) : null, cty: citiesNear( meta.cities, x0, z0, size ) };
}

function scatterArea( cx, cz, R, layer ) {
	const size = LAYER_CELL[ layer ];
	const counts = new Array( NSP ).fill( 0 );
	const all = [];
	const ground = []; // grass layer: mask texels [ x, z, dune, meadow, oats, creeper, pebbles, cobbles, grit ]
	let ms = 0, cells = 0;
	for ( let j = Math.floor( ( cz - R ) / size ); j <= Math.floor( ( cz + R ) / size ); j ++ ) for ( let i = Math.floor( ( cx - R ) / size ); i <= Math.floor( ( cx + R ) / size ); i ++ ) {
		const o = obstacles( i * size, j * size, size );
		const t0 = performance.now();
		const r = scatterCell( hf, { layer, i, j, bld: o.bld, seg: o.seg, cty: o.cty } );
		ms += performance.now() - t0; cells ++;
		ok( r.transfer && r.transfer.length === ( r.ground ? 6 : 2 ), 'scatter returns transfer buffers' );
		if ( layer === LAYER.GRASS && r.ground ) {
			const g = r.ground;
			ok( g.h.length === 16 * 16 * 4 && g.gm.length === 32 * 32 * 4 && g.pm.length === 32 * 32 * 4 && g.cells.length === 8 * 8 * 4, 'ground data sizes' );
			for ( let t = 0; t < 32 * 32; t ++ ) {
				const o = t * 4;
				if ( g.gm[ o ] | g.gm[ o + 1 ] | g.gm[ o + 2 ] | g.gm[ o + 3 ] | g.pm[ o ] | g.pm[ o + 1 ] | g.pm[ o + 2 ] ) ground.push( [ i * size + ( t % 32 ) + 0.5, j * size + Math.floor( t / 32 ) + 0.5, g.gm[ o ], g.gm[ o + 1 ], g.gm[ o + 2 ], g.gm[ o + 3 ], g.pm[ o ], g.pm[ o + 1 ], g.pm[ o + 2 ] ] );
			}
			// heights at the terrain's 2 m vertices
			let bad = 0;
			for ( let q = 0; q < 256; q += 37 ) if ( Math.abs( g.h[ q * 4 ] - hf.heightAt( i * size + ( q % 16 ) * 2, j * size + Math.floor( q / 16 ) * 2 ) ) > 1e-3 ) bad ++;
			ok( bad === 0, 'ground heights at the terrain vertices' );
		}
		for ( let s = 0; s < NSP; s ++ ) for ( let n = r.off[ s ]; n < r.off[ s + 1 ]; n ++ ) {
			counts[ s ] ++;
			all.push( [ s, ...r.data.subarray( n * STRIDE, n * STRIDE + STRIDE ) ] );
		}
	}
	return { counts, all, ground, ms, cells };
}

const fmt = ( counts ) => counts.map( ( c, s ) => c ? `${SPECIES[ s ].name} ${c}` : null ).filter( Boolean ).join( ', ' );

// test spots: [ name, x, z, expectations: species that must be there (canopy + detail) ]
const SPOTS = [
	[ 'Waikiki beach', - 3973, - 9770, [ SP.PALM ] ],
	[ 'North Shore beach', - 6840, - 15220, [ SP.PALM, SP.NAUPAKA ] ],
	[ 'Kaneohe bay shore', - 2800, - 11840, [ SP.PALM ] ],
	[ 'Koolau windward forest', - 4300, - 11800, [ SP.OHIA, SP.TREEFERN, SP.FERN ] ],
	[ 'Hilo', 31920, 11860, [ SP.PALM ] ],
	[ 'Kona coast', 19440, 12360, [ SP.KIAWE ] ],
	[ 'Wahiawa pineapple', - 6384, - 13584, [ SP.PINEAPPLE ] ],
	[ 'Maui sugar cane', 14224, - 3728, [ SP.CANE ] ],
];
const extra = process.argv.slice( 2 ).map( a => { const [ x, z ] = a.split( ',' ).map( Number ); return [ 'arg', x, z, [] ]; } );
// distance from (x, z) to the nearest road / street edge (m, negative inside)
const roadGap = ( x, z ) => {
	let best = 1e9;
	for ( const s of S ) {
		const ex = s[ 2 ] - s[ 0 ], ez = s[ 3 ] - s[ 1 ], L2 = ex * ex + ez * ez;
		let t = L2 > 0 ? ( ( x - s[ 0 ] ) * ex + ( z - s[ 1 ] ) * ez ) / L2 : 0;
		t = Math.max( 0, Math.min( 1, t ) );
		best = Math.min( best, Math.hypot( x - s[ 0 ] - ex * t, z - s[ 1 ] - ez * t ) - s[ 4 ] );
	}
	return best;
};
for ( const [ name, x, z, want ] of extra.length ? extra : SPOTS ) {
	const h = hf.heightAt( x, z ), s = hf.surfaceAt( x, z );
	console.log( `\n${name} (${x}, ${z}) h ${h.toFixed( 1 )} moist ${s[ 0 ].toFixed( 2 )} lava ${s[ 1 ].toFixed( 2 )} red ${s[ 2 ].toFixed( 2 )} use ${s[ 3 ]} flags ${hf.flagsNear( x, z )}` );
	const seen = new Set();
	for ( const [ layer, R ] of [ [ LAYER.CANOPY, 150 ], [ LAYER.DETAIL, 100 ], [ LAYER.GRASS, 40 ] ] ) {
		const r = scatterArea( x, z, R, layer );
		console.log( `  layer ${layer}: ${r.cells} cells ${( r.ms / r.cells ).toFixed( 2 )} ms/cell: ${fmt( r.counts )}` );
		r.counts.forEach( ( c, sp ) => c && seen.add( sp ) );
		// rules: never on pavement (street trees stand in the verge beside it), building pads or in the sea
		let paved = 0, sea = 0, building = 0;
		for ( const [ sp, px, , pz ] of r.all ) {
			const fl = hf.flagsNear( px, pz );
			if ( ( fl & ( FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY ) ) && roadGap( px, pz ) < 0.5 ) paved ++;
			if ( ( fl & FLAG.BUILDING ) && sp !== SP.GRASS ) building ++;
			if ( hf.baseHeight( px, pz ) < 0.2 ) sea ++;
		}
		ok( paved === 0, `${name} layer ${layer}: ${paved} plants on pavement` );
		ok( building === 0, `${name} layer ${layer}: ${building} plants on building pads` );
		ok( sea === 0, `${name} layer ${layer}: ${sea} plants in the sea` );
	}
	for ( const sp of want ) ok( seen.has( sp ), `${name}: expected ${SPECIES[ sp ].name}` );
	const gr = scatterArea( x, z, 40, LAYER.GRASS ).ground;
	const avg = ( c ) => gr.reduce( ( a, t ) => a + t[ c ], 0 ) / Math.max( 1, gr.length ) / 255;
	console.log( `  ground flora: ${gr.length} texels, dune ${avg( 2 ).toFixed( 2 )} meadow ${avg( 3 ).toFixed( 2 )} oats ${avg( 4 ).toFixed( 2 )} creeper ${avg( 5 ).toFixed( 2 )} pebbles ${avg( 6 ).toFixed( 2 )} grit ${avg( 8 ).toFixed( 2 )}` );
	for ( const [ gx, gz, ...m ] of gr ) if ( hf.baseHeight( gx, gz ) < - 1 && m.some( v => v > 20 ) ) { ok( false, `${name}: flora in the sea at ${gx}, ${gz}` ); break; }
}

// ---- towns: lawns, yard and street trees only; no wild understory, no meadow grass off the lawns, the
// streets and their sidewalks clear (trunks in the verge beside them) ------------------------------------------
for ( const [ name, x, z ] of [ [ 'Waikiki city', - 3880, - 9660 ], [ 'Waikiki hotels', - 3850, - 9640 ], [ 'Honolulu downtown', - 4390, - 10255 ], [ 'Hilo town', 31722, 11967 ], [ 'Kailua-Kona', 19997, 13038 ], [ 'Haleiwa', - 7530, - 14151 ] ] ) {
	const can = scatterArea( x, z, 120, LAYER.CANOPY ), det = scatterArea( x, z, 120, LAYER.DETAIL ), gr = scatterArea( x, z, 40, LAYER.GRASS );
	const area = Math.PI * 120 * 120;
	console.log( `\n${name}: canopy ${fmt( can.counts )} | detail ${fmt( det.counts )} | ground flora texels ${gr.ground.length}` );
	const inCity = ( a ) => hf.flagsNear( a[ 1 ], a[ 3 ] ) & FLAG.CITY;
	ok( det.all.filter( a => inCity( a ) && a[ 0 ] !== SP.ROCK ).length === 0, `${name}: no wild understory on the town blocks (${fmt( det.counts )})` );
	const trees = can.all.filter( a => Math.hypot( a[ 1 ] - x, a[ 3 ] - z ) < 120 && inCity( a ) ).length;
	ok( trees < area / 250, `${name}: sparse town trees (${trees} in ${( area / 1e4 ).toFixed( 1 )} ha)` );
	// pavement: street (incl. sidewalk) and road surfaces stay clear
	const onWalk = ( list, gap ) => list.filter( a => roadGap( a[ 1 ], a[ 3 ] ) < gap ).length;
	// the grass field's mask: nothing on the streets and sidewalks, nor on the town blocks
	const grassT = gr.ground.filter( t => t[ 2 ] > 8 || t[ 3 ] > 8 || t[ 4 ] > 8 || t[ 5 ] > 8 );
	const walkG = grassT.filter( t => roadGap( t[ 0 ], t[ 1 ] ) < 0.2 ).length;
	ok( walkG === 0, `${name}: grass on streets or sidewalks (${walkG})` );
	ok( onWalk( det.all, 0.5 ) === 0, `${name}: understory on streets or sidewalks (${onWalk( det.all, 0.5 )})` );
	ok( onWalk( can.all, 0.5 ) === 0, `${name}: trunks on streets or sidewalks (${onWalk( can.all, 0.5 )})` );
	// the town blocks are mown lawns the terrain paints: no grass on them
	const lawn = grassT.filter( t => hf.flagsNear( t[ 0 ], t[ 1 ] ) & FLAG.CITY ).length;
	ok( lawn === 0, `${name}: no grass on the town blocks (${lawn})` );
}

// ---- ground flora: meadows carry the grass field, the North Shore's backshore dune grass, sea oats and
// creeper and a wrack line of pebbles and shell grit, the Kona lava coast basalt cobbles, forests little grass
{
	const texels = ( x, z, R ) => scatterArea( x, z, R, LAYER.GRASS ).ground;
	const share = ( list, c, v = 40 ) => list.filter( t => t[ c ] > v ).length;
	const meadow = texels( - 7008, - 12128, 30 );
	ok( share( meadow, 3 ) > 2000, `meadow: tall grass on the open ground (${share( meadow, 3 )} texels)` );
	const ns = texels( - 6760, - 15260, 60 );
	ok( share( ns, 2 ) > 50, `North Shore: dune grass on the backshore (${share( ns, 2 )})` );
	ok( share( ns, 5 ) > 20, `North Shore: beach creeper (${share( ns, 5 )})` );
	ok( share( ns, 6, 20 ) + share( ns, 8, 20 ) > 50, `North Shore: pebbles and grit on the beach (${share( ns, 6, 20 )}, ${share( ns, 8, 20 )})` );
	const forest = texels( - 8928, - 13792, 30 );
	ok( share( forest, 3, 120 ) < forest.length * 0.3 + 1, `rain forest: little meadow grass (${share( forest, 3, 120 )} of ${forest.length})` );
}

// ---- altitude: the summits are bare, no trees above the tree line, palms stay low ------------------
{
	const mk = meta.labels.find( l => l.name === 'Mauna Kea' );
	const r = scatterArea( mk.x, mk.z, 400, LAYER.CANOPY );
	ok( r.all.length === 0, `Mauna Kea summit bare of trees (${r.all.length} trees: ${fmt( r.counts )})` );
	const d = scatterArea( mk.x, mk.z, 200, LAYER.DETAIL );
	ok( d.all.filter( a => a[ 0 ] !== SP.ROCK ).length === 0, `Mauna Kea summit: only rocks (${fmt( d.counts )})` );
	// a transect down the flank: count trees by altitude band
	let high = 0, palmsHigh = 0, total = 0;
	for ( const L of [ 'Mauna Kea', 'Mauna Loa', 'Haleakalā', 'Hualālai' ] ) {
		const p = meta.labels.find( l => l.name === L );
		if ( ! p ) continue;
		for ( let k = 0; k < 24; k ++ ) {
			const a = k / 24 * Math.PI * 2, rr = 800 + k * 260;
			const c = scatterArea( p.x + Math.cos( a ) * rr, p.z + Math.sin( a ) * rr, 60, LAYER.CANOPY );
			for ( const [ sp, , py ] of c.all ) { total ++; if ( py > 530 ) high ++; if ( sp === SP.PALM && py > 250 ) palmsHigh ++; }
		}
	}
	ok( high === 0, `no trees above the tree line (${high} of ${total})` );
	ok( palmsHigh === 0, `no palms in the uplands (${palmsHigh})` );
}

// determinism: the same cell twice gives the same data
{
	const o = obstacles( - 3973, - 9770, 64 );
	const a = scatterCell( hf, { layer: 0, i: - 63, j: - 153, bld: o.bld, seg: o.seg } ), b = scatterCell( hf, { layer: 0, i: - 63, j: - 153, bld: o.bld, seg: o.seg } );
	ok( a.data.length === b.data.length && a.data.every( ( v, k ) => v === b.data[ k ] ), 'scatter is deterministic' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
