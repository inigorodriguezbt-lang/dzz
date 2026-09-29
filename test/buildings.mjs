// Node checks for the buildings module: every building's plan and shell build without errors, sizes stay sane.
// node test/buildings.mjs [count]
import fs from 'fs';
import { readBuilding, NF } from '../src/city/buildings/data.js';
import { makePlan } from '../src/city/buildings/plan.js';
import { buildShell } from '../src/city/buildings/exterior.js';
import { Geo } from '../src/city/buildings/geo.js';

const W = JSON.parse( fs.readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
const B = W.buildings.data, N = B.length / NF;
const lim = + ( process.argv[ 2 ] || N );
let fails = 0, t0 = performance.now();
const stats = { v0: 0, v1: 0, max0: [ 0, - 1 ], max1: [ 0, - 1 ], rooms: 0, doors: 0 };
const byArch = {};
for ( let i = 0; i < Math.min( N, lim ); i ++ ) {
	const r = readBuilding( B, i );
	try {
		const P = makePlan( r, W.cities );
		for ( const lod of [ 0, 1 ] ) {
			const g = new Geo( 1024 );
			g.frame( r.x, 0, r.z, r.angle );
			buildShell( g, P, lod, null );
			const n = g.n;
			if ( lod === 0 ) { stats.v0 += n; if ( n > stats.max0[ 0 ] ) stats.max0 = [ n, i, P.S.arch, P.S.n ]; } else { stats.v1 += n; if ( n > stats.max1[ 0 ] ) stats.max1 = [ n, i, P.S.arch, P.S.n ]; }
			for ( let k = 0; k < n * 3; k ++ ) if ( ! Number.isFinite( g.pos[ k ] ) ) throw new Error( 'NaN vertex lod ' + lod );
		}
		const a = byArch[ P.S.arch ] = byArch[ P.S.arch ] || { n: 0, noext: 0, unreached: 0 };
		a.n ++;
		for ( const st of P.storeys ) { stats.rooms += st.rooms.length; stats.doors += st.doors.length; }
		if ( ! P.storeys[ 0 ].doors.some( d => d.ext ) ) a.noext ++;
	} catch ( e ) {
		fails ++;
		if ( fails < 8 ) console.log( 'building', i, r.type, e.stack.split( '\n' ).slice( 0, 3 ).join( ' | ' ) );
	}
}
console.log( 'buildings', Math.min( N, lim ), 'fails', fails, 'ms', ( performance.now() - t0 ).toFixed( 0 ) );
console.log( stats );
console.log( byArch );
process.exit( fails ? 1 : 0 );
