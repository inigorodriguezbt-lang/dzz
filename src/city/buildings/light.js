// Baked interior light (worker side): after a storey is built, every interior vertex gets
//   daylight  how much of the sky reaches it through the room's windows and glazed doors (distance, the angle
//             to the pane, curtains, boards), plus light bounced in from the rooms it opens onto
//   occlusion corners and edges of its room (walls, floor, ceiling) and the floor under furniture
// stored in geo.lt (u8x2, see geo.js) and applied to the sky light by the interior shader (materials.js).
// Decals take the same factor in their vertex colour (they use a plain lit material).
import { winState, winHash, winKey } from './data.js';
import { slabT } from './plan.js';

const T = 0.25; // exterior wall thickness
const AO_R = 0.42, AO_WALL = 0.42, AO_FLOOR = 0.5, AO_CEIL = 0.3;
// through a link between two rooms: how much of the other room's light comes over
const LINK_K = { open: 0.5, arch: 0.4, door: 0.28 };

// room geometry the bake needs: the inner faces of its walls, its openings to the sky
function roomsOf( P, st, barred ) {
	const top = st.y + st.h - slabT( P );
	const list = st.rooms.map( rm => {
		const inset = [ 0.03, 0.03, 0.03, 0.03 ];
		for ( const f of st.facades ) if ( f.inside === rm ) inset[ f.side ] = T;
		for ( const w of st.walls ) {
			if ( w.A === rm ) inset[ w.axis === 'x' ? 2 : 1 ] = Math.max( inset[ w.axis === 'x' ? 2 : 1 ], w.t / 2 );
			else if ( w.B === rm ) inset[ w.axis === 'x' ? 0 : 3 ] = Math.max( inset[ w.axis === 'x' ? 0 : 3 ], w.t / 2 );
		}
		return {
			rm, x0: rm.x0 + inset[ 3 ], x1: rm.x1 - inset[ 1 ], z0: rm.z0 + inset[ 0 ], z1: rm.z1 - inset[ 2 ],
			y0: st.y, y1: rm.k === 'stair' ? st.y + st.h * 2 : top, open: [ 0, 0, 0, 0 ], wins: [], direct: 0, bounce: 0,
			outside: !! rm.open,
		};
	} );
	const byRoom = new Map( list.map( q => [ q.rm, q ] ) );
	// open-plan edges have no wall to darken
	for ( const l of st.links ) {
		if ( l.kind !== 'open' && l.kind !== 'arch' ) continue;
		for ( const [ a, b ] of [ [ l.a, l.b ], [ l.b, l.a ] ] ) {
			const q = byRoom.get( a );
			if ( ! q ) continue;
			if ( l.kind === 'arch' ) continue; // an arch is a door-sized hole in a real wall
			if ( Math.abs( b.z1 - a.z0 ) < 0.05 ) q.open[ 0 ] = 1;
			if ( Math.abs( b.x0 - a.x1 ) < 0.05 ) q.open[ 1 ] = 1;
			if ( Math.abs( b.z0 - a.z1 ) < 0.05 ) q.open[ 2 ] = 1;
			if ( Math.abs( b.x1 - a.x0 ) < 0.05 ) q.open[ 3 ] = 1;
		}
	}
	// the sky through windows and doors: { x, y, z (pane centre), nx, nz (into the room), a (area), t (transmission) }
	for ( const f of st.facades ) {
		const q = byRoom.get( f.inside );
		if ( ! q ) continue;
		const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
		const nx = - f.nx, nz = - f.nz;
		const at = ( u ) => [ f.ax + tx * u + nx * T * 0.5, f.az + tz * u + nz * T * 0.5 ];
		const base = ( u ) => [ f.ax + tx * u, f.az + tz * u ];
		for ( const p of f.pieces ) {
			if ( p.door ) {
				const o = p.door;
				if ( o.kind === 'hangar' ) { const [ x, z ] = at( o.u ); q.wins.push( { x, z, y: st.y + o.h / 2, nx, nz, a: o.w * o.h, t: 0.5 } ); continue; }
				const glass = /glass|slide|shop|auto/.test( o.kind || '' );
				const [ x, z ] = at( o.u );
				q.wins.push( { x, z, y: st.y + o.h / 2, nx, nz, a: o.w * o.h, t: glass ? 0.75 : o.kind === 'roll' ? 0.05 : 0.12 } );
				continue;
			}
			const w = p.win;
			if ( ! w ) continue;
			const style = w.style & 31;
			const n = Math.max( 1, Math.round( ( p.a1 - p.a0 ) / w.bay ) );
			const h = Math.min( w.h, st.h - 0.12 - w.sill );
			if ( h <= 0.1 ) continue;
			for ( let bi = 0; bi < n; bi ++ ) {
				const u = p.a0 + ( bi + 0.5 ) * w.bay;
				const state = style === 6 || style === 11 || style === 13 ? 0 : winState( w.seed, bi );
				let t = state === 1 ? 0.05 : state === 2 ? 1.0 : 0.85;
				if ( style === 6 || style === 11 ) t = 0.55;
				else if ( style === 13 ) t = 0.35;
				else if ( style === 3 ) t *= 0.7; // tinted curtain wall
				// the curtains and blinds the facade shader shows (interior.js hangs the same)
				const dress = ( winHash( w.seed, bi ) >>> 28 ) & 7;
				if ( ( style === 1 || style === 2 || style === 5 ) && state !== 1 ) t *= dress === 0 ? 0.7 : dress === 1 ? 0.4 : dress === 2 ? 0.65 : 1;
				else if ( ( style === 3 || style === 12 ) && state !== 1 && dress <= 2 ) t *= 0.7; // office blinds
				const [ x, z ] = at( u ), [ bx, bz ] = base( u );
				// boarded up from inside (furniture.js)
				if ( barred && barred.has( winKey( bx, bz, st.y + w.sill + h / 2 ) ) ) t *= 0.15;
				q.wins.push( { x, z, y: st.y + w.sill + h / 2, nx, nz, a: w.w * h, t } );
			}
		}
	}
	return { list, byRoom, top };
}

// sky reaching point p (normal n, or none: omni) from a room's openings
function direct( q, px, py, pz, nx, ny, nz ) {
	let D = 0;
	for ( const w of q.wins ) {
		const vx = px - w.x, vy = py - w.y, vz = pz - w.z;
		const d2 = vx * vx + vy * vy + vz * vz, d = Math.sqrt( d2 ) || 1e-3;
		const cw = ( vx * w.nx + vz * w.nz ) / d;
		if ( cw <= 0 ) continue;
		// receivers facing the pane catch more of it (softened: the light scatters off everything)
		const cr = n3( nx, ny, nz ) ? 0.55 + 0.45 * Math.max( - 1, Math.min( 1, - ( vx * nx + vy * ny + vz * nz ) / d ) ) : 1;
		D += w.t * w.a * cw * cr / ( Math.PI * ( d2 + w.a * 0.6 ) );
	}
	return D;
}
const n3 = ( x, y, z ) => x !== 0 || y !== 0 || z !== 0;

// daylight -> the sky-light multiplier the shader applies (0.12 deep inside .. ~1.9 at a window), tabulated over
// sqrt( D ) (the bake calls it for every vertex)
export function lightCurve( D ) { return Math.min( 1.95, 0.12 + 3.1 * Math.pow( D, 0.65 ) ); }
const CURVE = new Float32Array( 1025 );
for ( let i = 0; i <= 1024; i ++ ) CURVE[ i ] = lightCurve( ( i / 512 ) ** 2 );
const curve = ( D ) => { const f = Math.min( 1024, Math.sqrt( D ) * 512 ), i = f | 0; return i >= 1024 ? CURVE[ 1024 ] : CURVE[ i ] + ( CURVE[ i + 1 ] - CURVE[ i ] ) * ( f - i ); };
// occlusion by one face of the room at distance d, facing along dot (1: the same way as the surface)
const occ = ( d, dot, k ) => { const w = 1 - dot; return w > 0 && d < 1.4 ? 1 - k * ( w > 1 ? 1 : w ) * Math.exp( - ( d > 0 ? d : 0 ) / AO_R ) : 1; };

export function bakeLight( P, st, geos, dec, barred = null, doors = null ) {
	const R = roomsOf( P, st, barred );
	const rooms = R.list;
	// each room's own light (averaged over its floor at table height), then what the rooms pass on to each other
	for ( const q of rooms ) {
		if ( q.outside ) { q.direct = 0.3; continue; }
		let s = 0, n = 0;
		const nx = Math.max( 1, Math.round( ( q.x1 - q.x0 ) / 1.2 ) ), nz = Math.max( 1, Math.round( ( q.z1 - q.z0 ) / 1.2 ) );
		for ( let i = 0; i < nx; i ++ ) for ( let j = 0; j < nz; j ++ ) {
			s += direct( q, q.x0 + ( q.x1 - q.x0 ) * ( i + 0.5 ) / nx, q.y0 + 0.9, q.z0 + ( q.z1 - q.z0 ) * ( j + 0.5 ) / nz, 0, 0, 0 );
			n ++;
		}
		q.direct = s / n;
	}
	const lit = rooms.map( q => q.direct );
	for ( let it = 0; it < 3; it ++ ) {
		const next = rooms.map( ( q, i ) => q.outside ? lit[ i ] : q.direct * 1.25 );
		for ( const l of st.links ) {
			const k = LINK_K[ l.kind ];
			if ( ! k ) continue;
			const a = R.byRoom.get( l.a ), b = R.byRoom.get( l.b );
			if ( ! a || ! b ) continue;
			const ia = rooms.indexOf( a ), ib = rooms.indexOf( b );
			// a small room is flooded by a big bright neighbour; a big one barely notices a small one
			const areaA = ( a.x1 - a.x0 ) * ( a.z1 - a.z0 ), areaB = ( b.x1 - b.x0 ) * ( b.z1 - b.z0 );
			next[ ia ] += k * lit[ ib ] * Math.min( 1.5, Math.sqrt( areaB / Math.max( 1, areaA ) ) );
			next[ ib ] += k * lit[ ia ] * Math.min( 1.5, Math.sqrt( areaA / Math.max( 1, areaB ) ) );
		}
		for ( let i = 0; i < rooms.length; i ++ ) lit[ i ] = next[ i ];
	}
	rooms.forEach( ( q, i ) => { q.bounce = lit[ i ] * 0.35; } );

	// a coarse index of the rooms by position
	const rect = P.rect, CS = 2;
	const gx = Math.max( 1, Math.ceil( ( rect.x1 - rect.x0 ) / CS ) + 2 ), gz = Math.max( 1, Math.ceil( ( rect.z1 - rect.z0 ) / CS ) + 2 );
	const grid = Array.from( { length: gx * gz }, () => [] );
	for ( const q of rooms ) {
		const i0 = Math.max( 0, Math.floor( ( q.rm.x0 - rect.x0 ) / CS ) + 1 ), i1 = Math.min( gx - 1, Math.floor( ( q.rm.x1 - rect.x0 ) / CS ) + 1 );
		const j0 = Math.max( 0, Math.floor( ( q.rm.z0 - rect.z0 ) / CS ) + 1 ), j1 = Math.min( gz - 1, Math.floor( ( q.rm.z1 - rect.z0 ) / CS ) + 1 );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) grid[ j * gx + i ].push( q );
	}
	const find = ( x, z ) => {
		const i = Math.floor( ( x - rect.x0 ) / CS ) + 1, j = Math.floor( ( z - rect.z0 ) / CS ) + 1;
		if ( i < 0 || j < 0 || i >= gx || j >= gz ) return null;
		for ( const q of grid[ j * gx + i ] ) if ( x >= q.rm.x0 - 0.01 && x <= q.rm.x1 + 0.01 && z >= q.rm.z0 - 0.01 && z <= q.rm.z1 + 0.01 ) return q;
		return null;
	};
	const y0 = st.y, yTop = st.y + st.h + 0.2;
	const out = [ 0, 0 ];
	const shade = ( px, py, pz, nx, ny, nz ) => {
		const q = py > y0 - 0.35 && py < yTop ? find( px + nx * 0.06, pz + nz * 0.06 ) : null;
		if ( ! q ) { out[ 0 ] = 1.7; out[ 1 ] = 1; return out; }
		if ( q.outside ) { out[ 0 ] = 1.5; out[ 1 ] = 1 - AO_FLOOR * 0.6 * ( 1 - Math.max( 0, ny ) ) * Math.exp( - Math.max( 0, py - y0 ) / AO_R ); return out; }
		const D = direct( q, px, py, pz, nx, ny, nz ) + q.bounce;
		out[ 0 ] = curve( D );
		// occlusion from the room's six faces (a face doesn't occlude what lies on it or faces the same way)
		let ao = occ( py - q.y0, ny, AO_FLOOR ) * occ( q.y1 - py, - ny, AO_CEIL );
		if ( ! q.open[ 3 ] ) ao *= occ( px - q.x0, nx, AO_WALL );
		if ( ! q.open[ 1 ] ) ao *= occ( q.x1 - px, - nx, AO_WALL );
		if ( ! q.open[ 0 ] ) ao *= occ( pz - q.z0, nz, AO_WALL );
		if ( ! q.open[ 2 ] ) ao *= occ( q.z1 - pz, - nz, AO_WALL );
		out[ 1 ] = ao;
		return out;
	};
	for ( const g of geos ) {
		if ( ! g || g.empty ) continue;
		const pos = g.pos, nor = g.nor, lt = g.lt, mat = g.mat;
		for ( let i = 0; i < g.n; i ++ ) {
			if ( ! ( mat[ i ] & 64 ) ) { lt[ i * 2 ] = 255; lt[ i * 2 + 1 ] = 255; continue; }
			const r = shade( pos[ i * 3 ], pos[ i * 3 + 1 ], pos[ i * 3 + 2 ], nor[ i * 3 ] / 127, nor[ i * 3 + 1 ] / 127, nor[ i * 3 + 2 ] / 127 );
			lt[ i * 2 ] = Math.min( 255, Math.round( r[ 0 ] * 127.5 ) );
			lt[ i * 2 + 1 ] = Math.round( Math.max( 0, Math.min( 1, r[ 1 ] ) ) * 255 );
		}
	}
	// door leaves are instanced (doors.js): the light on each side of the doorway, [ -normal, +normal ]
	if ( doors ) for ( const d of doors ) {
		const nx = d.axis === 'x' ? 0 : 0.45, nz = d.axis === 'x' ? 0.45 : 0;
		d.lt = [ shade( d.x - nx, st.y + 1.1, d.z - nz, 0, 0, 0 )[ 0 ], shade( d.x + nx, st.y + 1.1, d.z + nz, 0, 0, 0 )[ 0 ] ];
	}
	// decals are lit by the sky at full strength: darken them to match the surface they lie on, and warm them as
	// the interior shader warms the sky light indoors
	if ( dec && ! dec.empty ) {
		const pos = dec.pos, nor = dec.nor, col = dec.col;
		const warm = [ 1.08, 1.0, 0.86 ];
		for ( let i = 0; i < dec.n; i ++ ) {
			const r = shade( pos[ i * 3 ], pos[ i * 3 + 1 ], pos[ i * 3 + 2 ], nor[ i * 3 ] / 127, nor[ i * 3 + 1 ] / 127, nor[ i * 3 + 2 ] / 127 );
			const k = Math.min( 1, 0.62 * r[ 0 ] * r[ 1 ] );
			for ( let c = 0; c < 3; c ++ ) col[ i * 3 + c ] = Math.min( 255, Math.round( col[ i * 3 + c ] * k * warm[ c ] ) );
		}
	}
}
