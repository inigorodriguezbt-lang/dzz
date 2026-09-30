// Exterior shells: facades (windows drawn by the facade shader), roofs, plinths, porches, galleries,
// awnings, signs, canopies and rooftop clutter. Everything a storey owns is tagged with that storey so
// the shell can hide it while the real interior of that storey is loaded (the interior rebuilds it).
import { L, hash32, rng, pumpsOf } from './data.js';
import { M, slabT, SIDE_N, extOf } from './plan.js';
import { signFor, signUV, signIndex, SIGNS } from './names.js';

const WHITE = [ 255, 255, 255 ];

// per-storey outside parts shared with the interior builder: open-room slabs, railings, posts, loggia walls
export function storeyOutside( g, P, st, lod, opts = {} ) {
	const S = P.S, mat = P.mat;
	const y0 = st.y, top = st.y + st.h;
	const sT = slabT( P );
	for ( const rm of st.rooms ) {
		if ( ! rm.open ) continue;
		// deck / slab
		const deckM = rm.k === 'porch' ? M( L.planks, [ 170, 150, 120 ], 1.5, 0, { r: 1 } ) : rm.k === 'loggia' ? M( L.tiles, [ 210, 205, 196 ], 1.2 ) : M( L.concrete, [ 200, 198, 192 ], 3 );
		if ( st.i === 0 ) {
			if ( rm.k === 'porch' ) g.box( rm.x0, y0 - 0.06, rm.z0, rm.x1, y0, rm.z1, { py: deckM, pz: deckM, nz: deckM, px: deckM, nx: deckM } );
		} else {
			const under = M( L.plaster, [ 225, 222, 215 ], 3 );
			const edge = P.look?.edge || mat.ext;
			g.box( rm.x0, y0 - sT, rm.z0, rm.x1, y0, rm.z1, { py: deckM, ny: under, px: edge, nx: edge, pz: edge, nz: edge } );
		}
		// posts under the roof for porches; columns along galleries
		if ( lod === 0 && ( rm.k === 'porch' || rm.k === 'gallery' ) ) {
			const postM = rm.k === 'porch' ? mat.trim : mat.ext;
			const ps = rm.k === 'porch' ? 0.1 : 0.15;
			for ( const rl of st.rails ) {
				if ( rl.room !== rm ) continue;
				const len = Math.hypot( rl.x1 - rl.x0, rl.z1 - rl.z0 );
				const n = Math.max( 1, Math.round( len / ( rm.k === 'porch' ? 2.6 : 4.2 ) ) );
				for ( let k = 0; k <= n; k ++ ) {
					const t = k / n;
					let px = rl.x0 + ( rl.x1 - rl.x0 ) * t, pz = rl.z0 + ( rl.z1 - rl.z0 ) * t;
					// keep posts inside the deck
					px = Math.min( rm.x1 - ps, Math.max( rm.x0 + ps, px ) ); pz = Math.min( rm.z1 - ps, Math.max( rm.z0 + ps, pz ) );
					g.box( px - ps, y0, pz - ps, px + ps, top - ( st.i === P.S.n - 1 ? 0 : sT ), pz + ps, postM, 12 );
				}
			}
		}
	}
	// railings on open edges (not at grade unless the porch is raised)
	const raised = st.i > 0 || S.raise > 0.45;
	if ( raised ) {
		for ( const rl of st.rails ) {
			const rm = rl.room;
			if ( rm.k === 'stair' ) continue;
			let a = [ rl.x0, rl.z0 ], b = [ rl.x1, rl.z1 ];
			// the porch steps leave a gap in front of the front door
			const gaps = [];
			if ( st.i === 0 && rm.k === 'porch' && P.feats.steps ) for ( const s of P.feats.steps ) if ( s.side === rl.side ) gaps.push( s );
			railing( g, P, a, b, y0, gaps, opts.interior ? 0 : lod + 0.5, rm.k );
		}
	}
	// open stairs of walk-ups: a sloped slab per flight on the shell (the interior builds the real steps)
	if ( lod === 0 && ! opts.interior ) {
		for ( const rm of st.rooms ) if ( rm.k === 'stair' && rm.open && st.i < S.n - 1 ) openStairShell( g, P, rm, y0, st.h );
	}
	// walls between neighbouring loggias
	if ( lod === 0 || opts.interior ) {
		for ( const w of st.walls ) {
			if ( ! w.solid ) continue;
			const t = w.t / 2;
			if ( w.axis === 'x' ) g.box( w.x0, y0, w.z0 - t, w.x1, top - sT, w.z0 + t, mat.ext, 12 );
			else g.box( w.x0 - t, y0, w.z0, w.x0 + t, top - sT, w.z1, mat.ext, 12 );
		}
	}
}

// lod: 0 real balusters (interiors), 0.5 near shell (rails, posts and a painted bar panel), >= 1 far (solid panel)
function railing( g, P, a, b, y, gaps, lod, kind ) {
	const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
	if ( len < 0.1 ) return;
	const tx = ( b[ 0 ] - a[ 0 ] ) / len, tz = ( b[ 1 ] - a[ 1 ] ) / len;
	const rm = P.mat.rail;
	const h = 1.0;
	// pieces between gaps
	const cuts = [ [ 0, len ] ];
	for ( const gp of gaps ) {
		const c = ( gp.x - a[ 0 ] ) * tx + ( gp.z - a[ 1 ] ) * tz;
		const g0 = c - gp.w / 2, g1 = c + gp.w / 2;
		for ( let i = cuts.length - 1; i >= 0; i -- ) {
			const [ p, q ] = cuts[ i ];
			if ( g1 <= p || g0 >= q ) continue;
			cuts.splice( i, 1, ...[ [ p, g0 ], [ g1, q ] ].filter( ( [ s, e ] ) => e - s > 0.1 ) );
		}
	}
	const inset = 0.06;
	for ( const [ p, q ] of cuts ) {
		const x0 = a[ 0 ] + tx * p, z0 = a[ 1 ] + tz * p, x1 = a[ 0 ] + tx * q, z1 = a[ 1 ] + tz * q;
		const bx = ( ax, az, bx2, bz2, y0, y1, th, M = rm ) => {
			const minx = Math.min( ax, bx2 ) - ( Math.abs( tz ) > 0.5 ? th : 0 ), maxx = Math.max( ax, bx2 ) + ( Math.abs( tz ) > 0.5 ? th : 0 );
			const minz = Math.min( az, bz2 ) - ( Math.abs( tx ) > 0.5 ? th : 0 ), maxz = Math.max( az, bz2 ) + ( Math.abs( tx ) > 0.5 ? th : 0 );
			g.box( minx, y0, minz, maxx, y1, maxz, M );
		};
		// move the rail a little inside the edge
		const ix = - tz * inset, iz = tx * inset;
		if ( kind === 'loggia' || ( kind === 'gallery' && lod >= 1 ) ) {
			// solid parapet panel
			bx( x0 + ix, z0 + iz, x1 + ix, z1 + iz, y, y + h, 0.05, kind === 'loggia' ? P.mat.ext : rm );
			continue;
		}
		bx( x0 + ix, z0 + iz, x1 + ix, z1 + iz, y + h - 0.06, y + h, 0.04 );
		if ( lod >= 1 ) continue;
		bx( x0 + ix, z0 + iz, x1 + ix, z1 + iz, y + 0.08, y + 0.14, 0.03 );
		if ( lod > 0 ) {
			// near shell: posts every ~1.6 m and the balusters painted on a thin panel by the facade shader
			const n = Math.max( 1, Math.round( ( q - p ) / 1.6 ) );
			for ( let k = 0; k <= n; k ++ ) {
				const t = k / n;
				const px = x0 + ( x1 - x0 ) * t + ix, pz = z0 + ( z1 - z0 ) * t + iz;
				g.box( px - 0.035, y + 0.14, pz - 0.035, px + 0.035, y + h - 0.06, pz + 0.035, rm, 12 );
			}
			const fr = railFrame( P );
			const win = { bay: q - p, w: q - p, h: h - 0.2, sill: 0, style: 15 | ( fr << 5 ), seed: 1, v0: 0 };
			// both faces: outward along the right-hand normal of a->b, then the reverse
			g.facade( x0 + ix, z0 + iz, x1 + ix, z1 + iz, y + 0.14, y + h - 0.06, rm, win );
			g.facade( x1 + ix, z1 + iz, x0 + ix, z0 + iz, y + 0.14, y + h - 0.06, rm, win );
			continue;
		}
		const n = Math.max( 1, Math.round( ( q - p ) / 0.14 ) );
		for ( let k = 0; k <= n; k ++ ) {
			const t = k / n;
			const px = x0 + ( x1 - x0 ) * t + ix, pz = z0 + ( z1 - z0 ) * t + iz;
			g.box( px - 0.02, y + 0.14, pz - 0.02, px + 0.02, y + h - 0.06, pz + 0.02, rm, 12 );
		}
	}
}

// the facade shader's frame colour closest to the rail paint
function railFrame( P ) {
	const c = P.mat.rail.c;
	const l = c[ 0 ] + c[ 1 ] + c[ 2 ];
	if ( l > 600 ) return 0;
	if ( l < 200 ) return 3;
	if ( c[ 1 ] > c[ 0 ] + 15 ) return 4;
	if ( c[ 0 ] > c[ 2 ] + 15 ) return 5;
	return 2;
}

// a walk-up's open stair seen from outside: the two flights as sloped slabs and the half landing
function openStairShell( g, P, rm, y0, H ) {
	const s = P.stair;
	if ( ! s ) return;
	const along = s.e === 0 || s.e === 2 ? 'z' : 'x';
	const len = along === 'z' ? rm.z1 - rm.z0 : rm.x1 - rm.x0, sw = along === 'z' ? rm.x1 - rm.x0 : rm.z1 - rm.z0;
	const run = Math.max( 0.5, len - 2.2 );
	const cm = M( L.concrete, [ 196, 192, 184 ], 2 );
	const pt = ( a, b ) => {
		if ( s.e === 0 ) return [ rm.x0 + b, rm.z0 + a ];
		if ( s.e === 2 ) return [ rm.x0 + b, rm.z1 - a ];
		if ( s.e === 3 ) return [ rm.x0 + a, rm.z0 + b ];
		return [ rm.x1 - a, rm.z0 + b ];
	};
	const slope = ( a0, a1, ya, yb, b0, b1 ) => {
		const p00 = pt( a0, b0 ), p01 = pt( a0, b1 ), p10 = pt( a1, b0 ), p11 = pt( a1, b1 );
		// top and underside
		const q = [ [ p00[ 0 ], ya, p00[ 1 ] ], [ p01[ 0 ], ya, p01[ 1 ] ], [ p11[ 0 ], yb, p11[ 1 ] ], [ p10[ 0 ], yb, p10[ 1 ] ] ];
		const n = [ ( q[ 1 ][ 1 ] - q[ 0 ][ 1 ] ), 0 ];
		void n;
		g.quad( q[ 0 ], q[ 1 ], q[ 2 ], q[ 3 ], cm );
		g.quad( q[ 3 ], q[ 2 ], q[ 1 ], q[ 0 ], cm );
		const d = [ [ p00[ 0 ], ya - 0.25, p00[ 1 ] ], [ p01[ 0 ], ya - 0.25, p01[ 1 ] ], [ p11[ 0 ], yb - 0.25, p11[ 1 ] ], [ p10[ 0 ], yb - 0.25, p10[ 1 ] ] ];
		g.quad( d[ 3 ], d[ 2 ], d[ 1 ], d[ 0 ], cm );
		g.quad( d[ 0 ], d[ 1 ], d[ 2 ], d[ 3 ], cm );
	};
	slope( 1.2, 1.2 + run, y0, y0 + H / 2, 0, sw / 2 - 0.05 );
	slope( 1.2 + run, 1.2, y0 + H / 2, y0 + H, sw / 2 + 0.05, sw );
	const a = pt( 1.2 + run, 0 ), b = pt( len, sw );
	g.box( Math.min( a[ 0 ], b[ 0 ] ), y0 + H / 2 - 0.2, Math.min( a[ 1 ], b[ 1 ] ), Math.max( a[ 0 ], b[ 0 ] ), y0 + H / 2, Math.max( a[ 1 ], b[ 1 ] ), cm );
}

// the whole shell of one building. g's frame must be set to the building (local -> output).
// lod 0 = near (full detail), 1 = far (massing, facades, roof). gh = ground height grid (or null)
export function buildShell( g, P, lod, gh ) {
	const { S, mat, rect, r } = P;
	const bid = r.i + 1;
	const sT = slabT( P );
	P.feats.steps = frontSteps( P, gh );
	// plinth down to the lowest ground (with a lattice skirt under raised plantation houses). Every vertex carries
	// the building id (the far shell hides by it); storey 255 = never hidden with the interior.
	g.setTag( bid, 255 );
	const lo = r.lo - 0.8;
	if ( S.arch === 'dome' ) {
		g.cyl( ( rect.x0 + rect.x1 ) / 2, lo, ( rect.z0 + rect.z1 ) / 2, S.bw / 2 + 0.3, S.fy - lo, 28, mat.plinth, 1 );
	} else if ( S.arch !== 'tent' ) {
		g.box( rect.x0, lo, rect.z0, rect.x1, S.fy - ( S.raise > 0.45 ? 0.2 : 0 ), rect.z1, mat.plinth, 8 );
		if ( S.raise > 0.45 ) g.box( rect.x0 + 0.05, S.fy - 0.2, rect.z0 + 0.05, rect.x1 - 0.05, S.fy, rect.z1 - 0.05, M( L.wood, [ 150, 130, 105 ], 1 ), 8 );
	}
	// paved lot around commercial buildings
	if ( S.pave && gh ) pavedLot( g, P, gh, lod );
	for ( const st of P.storeys ) {
		g.setTag( bid, st.i );
		shellStorey( g, P, st, lod );
		storeyOutside( g, P, st, lod );
	}
	g.setTag( bid, 255 );
	roof( g, P, lod );
	features( g, P, lod, gh );
	void sT;
}

function shellStorey( g, P, st, lod ) {
	const { mat, S } = P;
	const y0 = st.y, y1 = st.y + st.h;
	if ( P.feats.round ) {
		// round observatory base: a cylinder with a door drawn on
		const cx = ( P.rect.x0 + P.rect.x1 ) / 2, cz = ( P.rect.z0 + P.rect.z1 ) / 2, rr = S.bw / 2;
		g.cyl( cx, y0, cz, rr, st.h, 28, mat.ext, 0 );
		// door slab
		g.box( cx - 0.55, y0, cz - rr - 0.06, cx + 0.55, y0 + 2.1, cz - rr + 0.1, M( L.spandrel, [ 150, 150, 150 ], 1 ) );
		return;
	}
	for ( const f of st.facades ) {
		// far away: skip recessed walls behind loggias (the flat facade in front stands in for them)
		if ( lod > 0 && f.out && f.out.k === 'loggia' ) continue;
		const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
		const em = extOf( P, st, f );
		for ( const p of f.pieces ) {
			const x0 = f.ax + tx * p.a0, z0 = f.az + tz * p.a0, x1 = f.ax + tx * p.a1, z1 = f.az + tz * p.a1;
			g.facade( x0, z0, x1, z1, y0, y1, em, p.win, f.u0 + p.a0 );
		}
		// window sills and AC units on the near shell
		if ( lod === 0 ) facadeDetails( g, P, st, f );
	}
	if ( lod > 0 ) {
		// loggias flattened: a balcony facade at the building line
		for ( const rl of st.rails ) {
			if ( rl.room.k !== 'loggia' ) continue;
			const f = { x0: rl.x0, z0: rl.z0, x1: rl.x1, z1: rl.z1 };
			// orient so the outward normal points away from the room
			const rm = rl.room;
			const cx = ( rm.x0 + rm.x1 ) / 2, cz = ( rm.z0 + rm.z1 ) / 2;
			let ax = f.x0, az = f.z0, bx = f.x1, bz = f.z1;
			const nx = - ( bz - az ), nz = bx - ax; // right-hand normal of a->b
			if ( ( ( ax + bx ) / 2 - cx ) * nx + ( ( az + bz ) / 2 - cz ) * nz < 0 ) { [ ax, bx ] = [ bx, ax ]; [ az, bz ] = [ bz, az ]; }
			const len = Math.hypot( bx - ax, bz - az );
			g.facade( ax, az, bx, bz, y0, y1, mat.ext, { bay: len, w: Math.min( 2.6, len - 0.6 ), h: 2.2, sill: 0, style: 14 | ( P.frame << 5 ), seed: hash32( P.bid, st.i, Math.round( ax * 10 + bz * 7 ) ) & 0xffff }, ( ax * - ( bz - az ) / len ) );
		}
	}
	// the slab edge band between storeys on towers (reads as floor lines)
	if ( S.arch === 'tower' && st.i > 0 && lod === 0 && P.winStyle === 3 ) {
		const r = P.rect;
		const b = M( L.plain, [ 60, 64, 70 ], 1 );
		g.box( r.x0 - 0.03, y0 - 0.12, r.z0 - 0.03, r.x1 + 0.03, y0 + 0.02, r.z1 + 0.03, b, 12 );
	}
}

function facadeDetails( g, P, st, f ) {
	const { mat, S } = P;
	const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
	const R = rng( hash32( P.bid, st.i, f.idx ) );
	for ( const p of f.pieces ) {
		const w = p.win;
		if ( ! w || p.door ) continue;
		const style = w.style & 31;
		if ( style !== 1 && style !== 2 && style !== 11 ) continue;
		const n = Math.round( ( p.a1 - p.a0 ) / w.bay );
		for ( let i = 0; i < n; i ++ ) {
			const c = p.a0 + ( i + 0.5 ) * w.bay;
			const cx = f.ax + tx * c, cz = f.az + tz * c;
			// sill: a little ledge under the window
			const hw = w.w / 2 + 0.06;
			const sy = st.y + w.sill;
			const sx0 = cx - tx * hw, sz0 = cz - tz * hw, sx1 = cx + tx * hw, sz1 = cz + tz * hw;
			const ox = f.nx * 0.07, oz = f.nz * 0.07;
			g.box( Math.min( sx0, sx1 + ox, sx0 + ox, sx1 ), sy - 0.06, Math.min( sz0, sz1 + oz, sz0 + oz, sz1 ), Math.max( sx0, sx1 + ox, sx0 + ox, sx1 ), sy, Math.max( sz0, sz1 + oz, sz0 + oz, sz1 ), mat.trim, 8 );
			// window AC units on walk-ups and houses (Honolulu staple)
			if ( ( S.arch === 'walkup' || S.arch === 'house' ) && style !== 11 && R() < 0.22 ) {
				const ax = cx + f.nx * 0.28, az = cz + f.nz * 0.28;
				const ac = M( L.plain, [ 214, 212, 204 ], 1 );
				g.box( ax - 0.3, sy + 0.02, az - 0.3, ax + 0.3, sy + 0.4, az + 0.3, ac );
			}
		}
	}
}

// ---- roofs ------------------------------------------------------------------------------------------------

function roof( g, P, lod ) {
	const { S, mat, rect } = P;
	const top = S.top;
	const x0 = rect.x0, x1 = rect.x1, z0 = rect.z0, z1 = rect.z1;
	switch ( S.roof ) {
		case 'hip': hipRoof( g, P, x0, z0, x1, z1, top, S.pitch, S.overhang, mat.roof, lod ); break;
		case 'gable': gableRoof( g, P, x0, z0, x1, z1, top, S.pitch, S.overhang, mat.roof, lod ); break;
		case 'arch': archRoof( g, P, x0, z0, x1, z1, top, lod ); break;
		case 'dome': domeRoof( g, P, top, lod ); break;
		case 'tent': tentRoof( g, P, lod ); break;
		default: flatRoof( g, P, x0, z0, x1, z1, top, lod );
	}
	// the island terminal: a row of steep hip-roofed pavilions over the hall (Kona's open-air look)
	if ( S.arch === 'terminal' ) {
		const n = Math.max( 2, Math.round( ( x1 - x0 ) / 13 ) ), w = ( x1 - x0 ) / n;
		const tm = M( L.roof, [ 150, 110, 90 ], 2.2 );
		for ( let k = 0; k < n; k ++ ) hipRoof( g, P, x0 + k * w + 0.4, z0, x0 + ( k + 1 ) * w - 0.4, z1, top + 0.9, 0.55, 1.2, tm, lod );
	}
}

function flatRoof( g, P, x0, z0, x1, z1, top, lod ) {
	const { mat, S } = P;
	const deck = M( L.bitumen, [ 170, 168, 162 ], 4 );
	// with a roof stair, the deck belongs to the top storey: its interior rebuilds it with the stair opening
	if ( P.stair && P.stair.roof && S.n > 1 ) g.setTag( P.r.i + 1, S.n - 1 );
	g.box( x0, top - 0.02, z0, x1, top + 0.08, z1, { py: deck, px: mat.ext, nx: mat.ext, pz: mat.ext, nz: mat.ext } );
	g.setTag( P.r.i + 1, 255 );
	if ( S.arch === 'ctower' ) return; // the cab's roof: towerCab
	// parapet (the collider height is the same everywhere: interior.js roofTop)
	const ph = S.arch === 'tower' ? 1.1 : S.arch === 'house' ? 0.35 : 0.8;
	const t = 0.22;
	const cap = M( L.concrete, [ 210, 206, 198 ], 2 );
	const look = P.look || {};
	// a tower's crown: a taller painted band, a cornice, a glass screen round the plant, or a tiled hip roof
	const crown = S.arch === 'tower' || ( look.crown && S.n > 1 ) ? look.crown : null;
	const pmExt = crown === 'band' && look.accent ? look.accent : mat.ext;
	const pm = { px: pmExt, nx: pmExt, pz: pmExt, nz: pmExt, py: cap };
	const pH = crown === 'band' ? ph + ( S.arch === 'tower' ? 0.9 : 0.4 ) : ph;
	if ( S.arch === 'house' ) {
		// a modern house: a thin flat roof slab overhanging the walls, dark fascia, pale soffit
		const fm = M( L.plain, [ 60, 58, 56 ], 1 ), so = M( L.plain, [ 236, 234, 228 ], 1 );
		g.box( x0 - 0.8, top - 0.02, z0 - 0.8, x1 + 0.8, top + 0.28, z1 + 0.8, { px: fm, nx: fm, pz: fm, nz: fm, py: deck, ny: so } );
		return;
	}
	g.box( x0, top, z0, x1, top + pH, z0 + t, pm, 8 );
	g.box( x0, top, z1 - t, x1, top + pH, z1, pm, 8 );
	g.box( x0, top, z0 + t, x0 + t, top + pH, z1 - t, pm, 8 + 16 + 32 );
	g.box( x1 - t, top, z0 + t, x1, top + pH, z1 - t, pm, 8 + 16 + 32 );
	if ( crown ) towerCrown( g, P, crown, x0, z0, x1, z1, top, pH, lod );
	// the front of shops: a taller false front where the sign goes, capped with a cornice
	if ( S.arch === 'shop' || S.arch === 'food' ) {
		g.box( x0, top + ph, z0, x1, top + ph + 0.9, z0 + t, pm, 8 );
		if ( look.cornice ) {
			const cm = look.accent || cap;
			g.box( x0 - 0.15, top + ph + 0.9, z0 - 0.3, x1 + 0.15, top + ph + 1.12, z0 + t + 0.05, { px: cm, nx: cm, pz: cm, nz: cm, py: cap, ny: cm } );
		}
	}
	// a big box: the brand stripe round the top of the walls
	if ( S.arch === 'bigbox' && look.brand ) {
		const bm = M( L.plain, look.brand, 1 );
		g.box( x0 - 0.05, top - 0.9, z0 - 0.05, x1 + 0.05, top - 0.3, z1 + 0.05, { px: bm, nx: bm, pz: bm, nz: bm }, 4 + 8 );
	}
	// towers: a mechanical penthouse on the half of the roof away from the stair (the roof door stays in the open)
	const R = rng( hash32( P.bid, 0x700f ) );
	if ( S.arch === 'tower' && crown !== 'hip' ) {
		const pr = penthouseOf( P, x0, z0, x1, z1 );
		const band = M( L.concrete, [ 190, 188, 182 ], 3 );
		g.box( pr.x0, top, pr.z0, pr.x1, top + 3.6, pr.z1, { px: band, nx: band, pz: band, nz: band, py: deck } );
		if ( lod === 0 ) {
			// louvres, cooling towers, an antenna mast
			const lv = M( L.spandrel, [ 150, 150, 150 ], 1 );
			const cz = ( pr.z0 + pr.z1 ) / 2, cx = ( pr.x0 + pr.x1 ) / 2;
			g.box( pr.x0 - 0.05, top + 1.2, cz - 1.5, pr.x0, top + 3.0, cz + 1.5, lv );
			g.box( pr.x1, top + 1.2, cz - 1.5, pr.x1 + 0.05, top + 3.0, cz + 1.5, lv );
			const ct = M( L.spandrel, [ 196, 198, 196 ], 1.5 ), fan = M( L.plain, [ 50, 52, 54 ], 1 );
			for ( let k = 0; k < 2; k ++ ) {
				const fx = cx + ( k - 0.5 ) * Math.min( 3.2, ( pr.x1 - pr.x0 ) * 0.45 );
				g.box( fx - 1.2, top + 3.6, cz - 1.2, fx + 1.2, top + 5.0, cz + 1.2, ct );
				g.cyl( fx, top + 5.0, cz, 0.9, 0.05, 12, fan, 1 );
			}
			g.cyl( pr.x1 - 0.8, top + 3.6, pr.z1 - 0.8, 0.08, 6 + R() * 8, 6, M( L.plain, [ 180, 60, 50 ], 1 ), 1 );
		}
	}
	if ( lod > 0 ) return;
	// stair bulkhead with an open doorway to the roof
	if ( P.stair && P.stair.roof && S.n > 1 ) bulkhead( g, P, P.stair, top );
	// rooftop clutter: AC condensers, vents, a water tank on older buildings
	const n = Math.floor( ( x1 - x0 ) * ( z1 - z0 ) / 90 );
	const ac = M( L.plain, [ 200, 200, 196 ], 1 );
	const vent = M( L.spandrel, [ 170, 170, 170 ], 1 );
	for ( let i = 0; i < Math.min( 8, n ); i ++ ) {
		const px = x0 + 1.2 + R() * ( x1 - x0 - 2.4 ), pz = z0 + 1.2 + R() * ( z1 - z0 - 2.4 );
		if ( P.stair && px > P.stair.x0 - 1 && px < P.stair.x1 + 1 && pz > P.stair.z0 - 1 && pz < P.stair.z1 + 1 ) continue;
		if ( R() < 0.6 ) g.box( px - 0.5, top + 0.08, pz - 0.4, px + 0.5, top + 0.9, pz + 0.4, ac );
		else g.cyl( px, top + 0.08, pz, 0.18, 0.7, 8, vent, 1 );
	}
	if ( ( S.arch === 'walkup' || S.arch === 'office' ) && R() < 0.5 ) {
		const px = x1 - 2.5, pz = z1 - 2.5;
		const tank = M( L.rust, [ 200, 190, 170 ], 2 );
		for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) g.box( px + dx * 0.8 - 0.06, top, pz + dz * 0.8 - 0.06, px + dx * 0.8 + 0.06, top + 1.6, pz + dz * 0.8 + 0.06, vent );
		g.cyl( px, top + 1.6, pz, 1.15, 1.8, 12, tank, 1 );
	}
}

// the plant room on a tower's roof, on the half of the long axis away from the stair
export function penthouseOf( P, x0, z0, x1, z1 ) {
	const W = x1 - x0, D = z1 - z0, s = P.stair;
	const cw = W * 0.45, cd = D * 0.4;
	let cx = ( x0 + x1 ) / 2, cz = ( z0 + z1 ) / 2;
	if ( s ) {
		const sx = ( s.x0 + s.x1 ) / 2, sz = ( s.z0 + s.z1 ) / 2;
		if ( D >= W ) cz = sz < cz ? Math.min( z1 - cd / 2 - 1.5, s.z1 + 1.2 + cd / 2 ) : Math.max( z0 + cd / 2 + 1.5, s.z0 - 1.2 - cd / 2 );
		else cx = sx < cx ? Math.min( x1 - cw / 2 - 1.5, s.x1 + 1.2 + cw / 2 ) : Math.max( x0 + cw / 2 + 1.5, s.x0 - 1.2 - cw / 2 );
	}
	return { x0: cx - cw / 2, x1: cx + cw / 2, z0: cz - cd / 2, z1: cz + cd / 2 };
}

// the top of a high-rise (see plan.js towerLook)
function towerCrown( g, P, crown, x0, z0, x1, z1, top, pH, lod ) {
	const { mat, S } = P;
	const look = P.look;
	const acc = look.accent || mat.ext;
	const cap = M( L.concrete, [ 214, 210, 202 ], 2 ), soffit = M( L.plain, [ 226, 224, 218 ], 1 );
	const dark = M( L.plain, [ 58, 58, 60 ], 1 );
	// a shadow reveal where the crown meets the body
	g.box( x0 - 0.04, top - 0.12, z0 - 0.04, x1 + 0.04, top + 0.02, z1 + 0.04, { px: dark, nx: dark, pz: dark, nz: dark }, 4 + 8 );
	if ( crown === 'cornice' ) {
		// a projecting slab lid, and a thinner one at the top storey's floor
		const o = S.arch === 'tower' ? 0.7 : 0.4;
		g.box( x0 - o, top + pH - 0.05, z0 - o, x1 + o, top + pH + 0.32, z1 + o, { px: acc, nx: acc, pz: acc, nz: acc, py: cap, ny: soffit } );
		if ( S.n > 3 ) {
			const y = S.ys[ S.n - 1 ];
			g.box( x0 - 0.25, y - 0.2, z0 - 0.25, x1 + 0.25, y + 0.05, z1 + 0.25, { px: acc, nx: acc, pz: acc, nz: acc, py: cap, ny: soffit } );
		}
	} else if ( crown === 'band' ) {
		const o = 0.12;
		g.box( x0 - o, top + pH - 0.02, z0 - o, x1 + o, top + pH + 0.14, z1 + o, { px: cap, nx: cap, pz: cap, nz: cap, py: cap, ny: soffit } );
	} else if ( crown === 'glass' ) {
		// a glazed screen round the plant, flush with the curtain wall
		const h = 4.2, y0 = top, y1 = top + h;
		const win = { bay: 1.5, w: 1.44, h: h - 0.5, sill: 0.25, style: 3 | ( P.frame << 5 ), seed: hash32( P.bid, 0x9c ) & 0x0fff };
		const sides = [ [ x1, z0, x0, z0 ], [ x1, z1, x1, z0 ], [ x0, z1, x1, z1 ], [ x0, z0, x0, z1 ] ];
		for ( const [ ax, az, bx, bz ] of sides ) {
			const len = Math.hypot( bx - ax, bz - az ), n = Math.max( 1, Math.round( len / 1.5 ) );
			g.facade( ax, az, bx, bz, y0, y1, mat.ext, { ...win, bay: len / n } );
			g.facade( bx, bz, ax, az, y0, y1, M( L.plain, [ 70, 72, 76 ], 1 ), null );
		}
		g.box( x0 - 0.1, y1, z0 - 0.1, x1 + 0.1, y1 + 0.25, z1 + 0.1, { px: acc, nx: acc, pz: acc, nz: acc, py: cap } );
	} else if ( crown === 'hip' ) {
		// a tiled hip roof over the whole top (a Waikīkī hotel classic)
		hipRoof( g, P, x0, z0, x1, z1, top + pH, 0.3, 0.9, look.roofTile || mat.roof, lod );
	}
}

// high-rise and civic dressing: a canopy over the street front, fins on curtain walls, a paved plaza
function towerDress( g, P, lod ) {
	const { S, rect } = P;
	const look = P.look;
	const acc = look.accent || P.mat.ext;
	const soffit = M( L.plain, [ 232, 230, 224 ], 1 ), top = M( L.spandrel, [ 170, 172, 174 ], 2 );
	if ( look.canopy ) {
		// cantilevered over the pavement above the shop windows; civic buildings only over the entrance
		const y = S.fy + Math.min( 3.3, S.Hs[ 0 ] - 0.9 );
		let a = rect.x0 + 0.3, b = rect.x1 - 0.3;
		if ( S.arch !== 'tower' ) {
			const f = P.storeys[ 0 ].facades.find( f => f.side === 0 && f.ops.some( o => o.ext ) );
			if ( ! f ) a = b;
			else { const o = f.ops.find( o => o.ext ), c = f.ax + ( f.bx - f.ax ) / f.len * o.u; a = Math.max( rect.x0 + 0.2, c - 3 ); b = Math.min( rect.x1 - 0.2, c + 3 ); }
		}
		if ( b - a > 2 ) {
			const d = S.arch === 'tower' ? 2.6 : 2.2;
			g.box( a, y, rect.z0 - d, b, y + 0.32, rect.z0, { px: acc, nx: acc, nz: acc, py: top, ny: soffit } );
		}
	}
	// vertical fins on the mullions, above the base, every `fins` bays
	if ( look.fins && S.n > 2 ) {
		const st = P.storeys[ 1 ];
		const y0 = S.ys[ 1 ], y1 = S.top + 0.9;
		const fm = look.finM || acc, dep = 0.32, hw = 0.06;
		for ( const f of st.facades ) {
			const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
			for ( const p of f.pieces ) {
				const w = p.win;
				if ( ! w ) continue;
				const n = Math.round( ( p.a1 - p.a0 ) / w.bay );
				for ( let k = 1; k < n; k ++ ) {
					if ( k % look.fins ) continue;
					const u = p.a0 + k * w.bay;
					const cx = f.ax + tx * u, cz = f.az + tz * u;
					const ex = Math.abs( tx ) * hw + Math.abs( f.nx ) * dep / 2, ez = Math.abs( tz ) * hw + Math.abs( f.nz ) * dep / 2;
					const ox = f.nx * dep / 2, oz = f.nz * dep / 2;
					g.box( cx + ox - ex, y0, cz + oz - ez, cx + ox + ex, y1, cz + oz + ez, fm, 8 );
				}
			}
		}
	}
	void lod;
}

// a condo tower's balconies: a slab and a railing along each run of flats on every floor, outside the walls (never
// hidden: the interiors look out onto them)
const BALC_ROOM = { living: 1, bedroom: 1, hotelroom: 1, dining: 1 };
function balconies( g, P, lod ) {
	const { S, rect, look } = P;
	const D = look.balcD || 1.4;
	const deck = M( L.concrete, [ 196, 192, 184 ], 3 ), soffit = M( L.plain, [ 232, 230, 224 ], 1 );
	const edge = look.accent && look.accent.c[ 0 ] + look.accent.c[ 1 ] + look.accent.c[ 2 ] > 600 ? look.accent : P.mat.ext;
	const SM = { py: deck, ny: soffit, px: edge, nx: edge, pz: edge, nz: edge };
	const glass = look.railGlass ? M( L.plain, [ 120, 150, 154 ], 1 ) : null;
	for ( const st of P.storeys ) {
		if ( st.i === 0 ) continue;
		for ( let side = 0; side < 4; side ++ ) {
			const along = side === 0 || side === 2;
			const runs = [];
			for ( const f of st.facades ) {
				if ( f.side !== side || f.out || ! BALC_ROOM[ f.inside.k ] ) continue;
				runs.push( along ? [ Math.min( f.ax, f.bx ), Math.max( f.ax, f.bx ) ] : [ Math.min( f.az, f.bz ), Math.max( f.az, f.bz ) ] );
			}
			runs.sort( ( p, q ) => p[ 0 ] - q[ 0 ] );
			const merged = [];
			for ( const r of runs ) { const l = merged[ merged.length - 1 ]; if ( l && r[ 0 ] - l[ 1 ] < 0.6 ) l[ 1 ] = Math.max( l[ 1 ], r[ 1 ] ); else merged.push( [ ...r ] ); }
			for ( let [ a, b ] of merged ) {
				a += 0.25; b -= 0.25;
				if ( b - a < 2.4 ) continue;
				const y = st.y;
				// the slab, then the railing round its outer edges
				let p0, p1, p2, p3;
				if ( side === 0 ) { g.box( a, y - 0.2, rect.z0 - D, b, y + 0.02, rect.z0, SM, 16 ); p0 = [ a, rect.z0 ]; p1 = [ a, rect.z0 - D ]; p2 = [ b, rect.z0 - D ]; p3 = [ b, rect.z0 ]; }
				else if ( side === 2 ) { g.box( a, y - 0.2, rect.z1, b, y + 0.02, rect.z1 + D, SM, 32 ); p0 = [ b, rect.z1 ]; p1 = [ b, rect.z1 + D ]; p2 = [ a, rect.z1 + D ]; p3 = [ a, rect.z1 ]; }
				else if ( side === 1 ) { g.box( rect.x1, y - 0.2, a, rect.x1 + D, y + 0.02, b, SM, 2 ); p0 = [ rect.x1, a ]; p1 = [ rect.x1 + D, a ]; p2 = [ rect.x1 + D, b ]; p3 = [ rect.x1, b ]; }
				else { g.box( rect.x0 - D, y - 0.2, a, rect.x0, y + 0.02, b, SM, 1 ); p0 = [ rect.x0, b ]; p1 = [ rect.x0 - D, b ]; p2 = [ rect.x0 - D, a ]; p3 = [ rect.x0, a ]; }
				if ( glass ) {
					// glass balustrade: a tinted panel under a slim top rail
					for ( const [ u, v ] of [ [ p0, p1 ], [ p1, p2 ], [ p2, p3 ] ] ) {
						g.box( Math.min( u[ 0 ], v[ 0 ] ) - 0.02, y + 0.02, Math.min( u[ 1 ], v[ 1 ] ) - 0.02, Math.max( u[ 0 ], v[ 0 ] ) + 0.02, y + 0.95, Math.max( u[ 1 ], v[ 1 ] ) + 0.02, glass );
						g.box( Math.min( u[ 0 ], v[ 0 ] ) - 0.03, y + 0.95, Math.min( u[ 1 ], v[ 1 ] ) - 0.03, Math.max( u[ 0 ], v[ 0 ] ) + 0.03, y + 1.02, Math.max( u[ 1 ], v[ 1 ] ) + 0.03, P.mat.rail );
					}
				} else {
					railing( g, P, p0, p1, y + 0.02, [], lod > 0 ? 1.5 : 0.5, lod > 0 ? 'gallery' : 'balcony' );
					railing( g, P, p1, p2, y + 0.02, [], lod > 0 ? 1.5 : 0.5, lod > 0 ? 'gallery' : 'balcony' );
					railing( g, P, p2, p3, y + 0.02, [], lod > 0 ? 1.5 : 0.5, lod > 0 ? 'gallery' : 'balcony' );
				}
			}
		}
	}
}

export function bulkhead( g, P, s, top ) {
	const { mat } = P;
	const h = 2.6;
	const t = 0.2;
	const deck = M( L.bitumen, [ 170, 168, 162 ], 4 );
	const x0 = s.x0, x1 = s.x1, z0 = s.z0, z1 = s.z1;
	// walls on all sides, a doorway on the entry side
	const door = 1.0;
	const sides = [
		[ x0, z0, x1, z0 + t, 0 ], [ x1 - t, z0, x1, z1, 1 ], [ x0, z1 - t, x1, z1, 2 ], [ x0, z0, x0 + t, z1, 3 ],
	];
	for ( const [ a, b, c, d, side ] of sides ) {
		if ( side === s.e ) {
			// split around the doorway (centred on the landing)
			if ( side === 0 || side === 2 ) {
				const mx = ( a + c ) / 2;
				g.box( a, top, b, mx - door / 2, top + h, d, mat.ext );
				g.box( mx + door / 2, top, b, c, top + h, d, mat.ext );
				g.box( mx - door / 2, top + 2.1, b, mx + door / 2, top + h, d, mat.ext );
			} else {
				const mz = ( b + d ) / 2;
				g.box( a, top, b, c, top + h, mz - door / 2, mat.ext );
				g.box( a, top, mz + door / 2, c, top + h, d, mat.ext );
				g.box( a, top + 2.1, mz - door / 2, c, top + h, mz + door / 2, mat.ext );
			}
		} else g.box( a, top, b, c, top + h, d, mat.ext );
	}
	g.box( x0 - 0.1, top + h, z0 - 0.1, x1 + 0.1, top + h + 0.15, z1 + 0.1, { py: deck, px: mat.ext, nx: mat.ext, pz: mat.ext, nz: mat.ext, ny: mat.ext } );
}

// hip roof over the rect grown by the overhang: ridge along the long axis
function hipRoof( g, P, x0, z0, x1, z1, top, pitch, o, rm, lod ) {
	const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o;
	const W = X1 - X0, D = Z1 - Z0;
	const ey = top - o * pitch; // eave height at the overhang edge
	const alongX = W >= D;
	const half = ( alongX ? D : W ) / 2;
	const ry = ey + half * pitch;
	const rl = Math.abs( W - D ) / 2;
	const cx = ( X0 + X1 ) / 2, cz = ( Z0 + Z1 ) / 2;
	if ( alongX ) {
		const ra = [ cx - rl, ry, cz ], rb = [ cx + rl, ry, cz ];
		g.quad( [ X1, ey, Z0 ], [ X0, ey, Z0 ], ra, rb, rm ); // front slope (-z)
		g.quad( [ X0, ey, Z1 ], [ X1, ey, Z1 ], rb, ra, rm ); // back slope
		g.tri( [ X0, ey, Z0 ], [ X0, ey, Z1 ], ra, rm );
		g.tri( [ X1, ey, Z1 ], [ X1, ey, Z0 ], rb, rm );
	} else {
		const ra = [ cx, ry, cz - rl ], rb = [ cx, ry, cz + rl ];
		g.quad( [ X0, ey, Z0 ], [ X0, ey, Z1 ], rb, ra, rm );
		g.quad( [ X1, ey, Z1 ], [ X1, ey, Z0 ], ra, rb, rm );
		g.tri( [ X1, ey, Z0 ], [ X0, ey, Z0 ], ra, rm );
		g.tri( [ X0, ey, Z1 ], [ X1, ey, Z1 ], rb, rm );
	}
	eaves( g, P, X0, Z0, X1, Z1, x0, z0, x1, z1, ey, top, lod );
	if ( lod === 0 ) solar( g, P, X0, Z0, X1, Z1, ey, ry, alongX, pitch );
}

// soffits under the overhang and a fascia board around the edge
function eaves( g, P, X0, Z0, X1, Z1, x0, z0, x1, z1, ey, top, lod ) {
	const tm = P.mat.trim;
	const fh = 0.2;
	// fascia (vertical board at the roof edge)
	g.box( X0, ey - fh, Z0, X1, ey + 0.02, Z0 + 0.04, tm, 4 );
	g.box( X0, ey - fh, Z1 - 0.04, X1, ey + 0.02, Z1, tm, 4 );
	g.box( X0, ey - fh, Z0 + 0.04, X0 + 0.04, ey + 0.02, Z1 - 0.04, tm, 4 + 16 + 32 );
	g.box( X1 - 0.04, ey - fh, Z0 + 0.04, X1, ey + 0.02, Z1 - 0.04, tm, 4 + 16 + 32 );
	if ( lod > 0 ) return;
	// soffit: flat underside from the fascia back to the wall
	const sm = M( L.plain, [ 236, 234, 228 ], 1 );
	const y = ey - fh;
	g.quad( [ X0, y, Z0 ], [ X1, y, Z0 ], [ x1, y, z0 ], [ x0, y, z0 ], sm );
	g.quad( [ X1, y, Z1 ], [ X0, y, Z1 ], [ x0, y, z1 ], [ x1, y, z1 ], sm );
	g.quad( [ X0, y, Z1 ], [ X0, y, Z0 ], [ x0, y, z0 ], [ x0, y, z1 ], sm );
	g.quad( [ X1, y, Z0 ], [ X1, y, Z1 ], [ x1, y, z1 ], [ x1, y, z0 ], sm );
	// the gap between the soffit and the top of the wall
	if ( top - y > 0.02 ) {
		const bm = P.mat.ext;
		g.box( x0, y, z0, x1, top, z0 + 0.01, bm, 4 + 8 );
		g.box( x0, y, z1 - 0.01, x1, top, z1, bm, 4 + 8 );
		g.box( x0, y, z0, x0 + 0.01, top, z1, bm, 4 + 8 );
		g.box( x1 - 0.01, y, z0, x1, top, z1, bm, 4 + 8 );
	}
}

function solar( g, P, X0, Z0, X1, Z1, ey, ry, alongX, pitch ) {
	const R = rng( hash32( P.bid, 0x5012 ) );
	if ( R() > 0.3 || P.S.arch !== 'house' ) return;
	// a few panels on the back slope, lifted off the roofing
	const pm = M( L.plain, [ 40, 50, 70 ], 1 );
	const a = Math.atan( pitch );
	const n = 2 + Math.floor( R() * 3 );
	for ( let i = 0; i < n; i ++ ) {
		g.push();
		if ( alongX ) {
			const x = ( X0 + X1 ) / 2 + ( i - ( n - 1 ) / 2 ) * 1.1;
			const zm = ( Z1 + ( Z0 + Z1 ) / 2 ) / 2;
			const y = ey + ( Z1 - zm ) * pitch + 0.08;
			g.translate( x, y, zm ).rotX( a );
		} else {
			const z = ( Z0 + Z1 ) / 2 + ( i - ( n - 1 ) / 2 ) * 1.1;
			const xm = ( X1 + ( X0 + X1 ) / 2 ) / 2;
			const y = ey + ( X1 - xm ) * pitch + 0.08;
			g.translate( xm, y, z ).rotZ( - a );
		}
		g.box( - 0.5, 0, - 0.8, 0.5, 0.05, 0.8, pm );
		g.pop();
	}
	void ry;
}

function gableRoof( g, P, x0, z0, x1, z1, top, pitch, o, rm, lod ) {
	const { S, mat } = P;
	// ridge along the long axis; houses keep the ridge parallel to the street
	const alongX = S.arch === 'house' || S.arch === 'barracks' ? true : ( x1 - x0 ) <= ( z1 - z0 ) ? false : true;
	const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o;
	if ( alongX ) {
		const half = ( z1 - z0 ) / 2;
		const ey = top - o * pitch;
		const ry = top + half * pitch;
		const cz = ( z0 + z1 ) / 2;
		g.quad( [ X1, ey, Z0 ], [ X0, ey, Z0 ], [ X0, ry, cz ], [ X1, ry, cz ], rm );
		g.quad( [ X0, ey, Z1 ], [ X1, ey, Z1 ], [ X1, ry, cz ], [ X0, ry, cz ], rm );
		// undersides of the rakes (visible from the ground)
		const sm = M( L.plain, [ 230, 228, 222 ], 1 );
		g.quad( [ X0, ey - 0.02, Z0 ], [ X1, ey - 0.02, Z0 ], [ X1, ry - 0.02, cz ], [ X0, ry - 0.02, cz ], sm );
		g.quad( [ X1, ey - 0.02, Z1 ], [ X0, ey - 0.02, Z1 ], [ X0, ry - 0.02, cz ], [ X1, ry - 0.02, cz ], sm );
		// gable end walls
		g.tri( [ x0, top, z1 ], [ x0, top, z0 ], [ x0, ry, cz ], mat.ext );
		g.tri( [ x1, top, z0 ], [ x1, top, z1 ], [ x1, ry, cz ], mat.ext );
		// fascia along the eaves, barge boards along the rakes
		const tm = mat.trim;
		g.box( X0, ey - 0.2, Z0, X1, ey, Z0 + 0.04, tm );
		g.box( X0, ey - 0.2, Z1 - 0.04, X1, ey, Z1, tm );
		if ( lod === 0 ) {
			for ( const x of [ X0, X1 - 0.04 ] ) {
				g.quad( [ x + ( x === X0 ? 0 : 0.04 ), ey - 0.2, Z0 ], [ x + ( x === X0 ? 0 : 0.04 ), ey - 0.2, cz ], [ x + ( x === X0 ? 0 : 0.04 ), ry, cz ], [ x + ( x === X0 ? 0 : 0.04 ), ey, Z0 ], tm );
			}
			if ( S.arch === 'house' ) solar( g, P, X0, Z0, X1, Z1, ey, ry, true, pitch );
		}
		if ( P.feats.steeple ) steeple( g, P, ( x0 + x1 ) / 2, z0 + 1.6, ry );
	} else {
		const half = ( x1 - x0 ) / 2;
		const ey = top - o * pitch;
		const ry = top + half * pitch;
		const cx = ( x0 + x1 ) / 2;
		g.quad( [ X0, ey, Z0 ], [ X0, ey, Z1 ], [ cx, ry, Z1 ], [ cx, ry, Z0 ], rm );
		g.quad( [ X1, ey, Z1 ], [ X1, ey, Z0 ], [ cx, ry, Z0 ], [ cx, ry, Z1 ], rm );
		const sm = M( L.plain, [ 230, 228, 222 ], 1 );
		g.quad( [ X0, ey - 0.02, Z1 ], [ X0, ey - 0.02, Z0 ], [ cx, ry - 0.02, Z0 ], [ cx, ry - 0.02, Z1 ], sm );
		g.quad( [ X1, ey - 0.02, Z0 ], [ X1, ey - 0.02, Z1 ], [ cx, ry - 0.02, Z1 ], [ cx, ry - 0.02, Z0 ], sm );
		g.tri( [ x0, top, z0 ], [ x1, top, z0 ], [ cx, ry, z0 ], mat.ext );
		g.tri( [ x1, top, z1 ], [ x0, top, z1 ], [ cx, ry, z1 ], mat.ext );
		const tm = mat.trim;
		g.box( X0, ey - 0.2, Z0, X0 + 0.04, ey, Z1, tm );
		g.box( X1 - 0.04, ey - 0.2, Z0, X1, ey, Z1, tm );
		if ( P.feats.steeple ) steeple( g, P, cx, z0 + 1.6, ry );
	}
}

function steeple( g, P, x, z, ry ) {
	const wm = M( L.planks, [ 244, 242, 236 ], 2 );
	const rm = P.mat.roof;
	const s = 1.2;
	g.box( x - s, ry - 1.5, z - s, x + s, ry + 3.2, z + s, wm, 8 );
	// open belfry arches suggested with dark insets
	const dark = M( L.plain, [ 30, 28, 26 ], 1 );
	g.box( x - 0.5, ry + 1.4, z - s - 0.02, x + 0.5, ry + 2.7, z + s + 0.02, dark, 1 + 2 + 4 + 8 );
	g.box( x - s - 0.02, ry + 1.4, z - 0.5, x + s + 0.02, ry + 2.7, z + 0.5, dark, 4 + 8 + 16 + 32 );
	// spire
	const t = ry + 3.2, p = ry + 8;
	g.tri( [ x + s + 0.15, t, z - s - 0.15 ], [ x - s - 0.15, t, z - s - 0.15 ], [ x, p, z ], rm );
	g.tri( [ x + s + 0.15, t, z + s + 0.15 ], [ x + s + 0.15, t, z - s - 0.15 ], [ x, p, z ], rm );
	g.tri( [ x - s - 0.15, t, z + s + 0.15 ], [ x + s + 0.15, t, z + s + 0.15 ], [ x, p, z ], rm );
	g.tri( [ x - s - 0.15, t, z - s - 0.15 ], [ x - s - 0.15, t, z + s + 0.15 ], [ x, p, z ], rm );
	// cross
	const cm = M( L.plain, [ 240, 236, 220 ], 1 );
	g.box( x - 0.04, p, z - 0.04, x + 0.04, p + 1.1, z + 0.04, cm );
	g.box( x - 0.3, p + 0.65, z - 0.04, x + 0.3, p + 0.73, z + 0.04, cm );
}

// quonset / hangar vault spanning x, running along z
function archRoof( g, P, x0, z0, x1, z1, top, lod ) {
	const { mat } = P;
	const seg = lod > 0 ? 8 : 16;
	const W = x1 - x0, rise = W * 0.28;
	// circular segment through (x0, top), (x1, top) and (cx, top + rise)
	const cx = ( x0 + x1 ) / 2;
	const R = ( ( W / 2 ) * ( W / 2 ) + rise * rise ) / ( 2 * rise );
	const cy = top + rise - R;
	const a0 = Math.atan2( top - cy, x0 - cx ), a1 = Math.atan2( top - cy, x1 - cx );
	const pts = [];
	for ( let i = 0; i <= seg; i ++ ) {
		const a = a0 + ( a1 - a0 ) * i / seg;
		pts.push( [ cx + Math.cos( a ) * R, cy + Math.sin( a ) * R ] );
	}
	const o = 0.4;
	for ( let i = 0; i < seg; i ++ ) {
		const [ ax, ay ] = pts[ i ], [ bx, by ] = pts[ i + 1 ];
		g.quad( [ ax, ay, z0 - o ], [ ax, ay, z1 + o ], [ bx, by, z1 + o ], [ bx, by, z0 - o ], mat.roof );
		// underside
		g.quad( [ bx, by - 0.05, z0 - o ], [ bx, by - 0.05, z1 + o ], [ ax, ay - 0.05, z1 + o ], [ ax, ay - 0.05, z0 - o ], M( L.tinroof, [ 150, 152, 150 ], 1.6, 0, { r: 1 } ) );
		// end walls (fan to the wall top)
		g.tri( [ ax, ay, z0 ], [ bx, by, z0 ], [ cx, top, z0 ], mat.ext );
		g.tri( [ bx, by, z1 ], [ ax, ay, z1 ], [ cx, top, z1 ], mat.ext );
	}
}

function domeRoof( g, P, top, lod ) {
	const { S, rect, mat } = P;
	const cx = ( rect.x0 + rect.x1 ) / 2, cz = ( rect.z0 + rect.z1 ) / 2, rr = S.bw / 2 + 0.15;
	const prof = [];
	const n = lod > 0 ? 6 : 12;
	for ( let i = 0; i <= n; i ++ ) { const a = i / n * Math.PI / 2 * 0.98; prof.push( [ Math.cos( a ) * rr, top + Math.sin( a ) * rr ] ); }
	g.lathe( cx, cz, prof, lod > 0 ? 16 : 32, mat.roof );
	// the observing slit
	if ( lod === 0 ) {
		const sm = M( L.plain, [ 40, 40, 44 ], 1 );
		const R = rng( hash32( P.bid, 0xd0e ) );
		const a = R() * Math.PI * 2;
		g.push().translate( cx, top, cz ).rotY( a );
		for ( let i = 0; i < n; i ++ ) {
			const t0 = i / n * Math.PI / 2 * 0.98, t1 = ( i + 1 ) / n * Math.PI / 2 * 0.98;
			const p0 = [ 0, Math.sin( t0 ) * ( rr + 0.02 ), Math.cos( t0 ) * ( rr + 0.02 ) ], p1 = [ 0, Math.sin( t1 ) * ( rr + 0.02 ), Math.cos( t1 ) * ( rr + 0.02 ) ];
			g.quad( [ - 0.9, p0[ 1 ], p0[ 2 ] ], [ 0.9, p0[ 1 ], p0[ 2 ] ], [ 0.9, p1[ 1 ], p1[ 2 ] ], [ - 0.9, p1[ 1 ], p1[ 2 ] ], sm );
		}
		g.pop();
		// ring beam
		g.cyl( cx, top - 0.3, cz, rr + 0.25, 0.3, 32, M( L.spandrel, [ 200, 200, 200 ], 2 ), 0 );
	}
}

function tentRoof( g, P, lod ) {
	const { rect, S, mat } = P;
	const y0 = S.fy, wall = 1.2, ridge = 2.8;
	const x0 = rect.x0, x1 = rect.x1, z0 = rect.z0, z1 = rect.z1;
	const cz = ( z0 + z1 ) / 2;
	const cm = mat.ext;
	g.setTag( P.r.i + 1, 0 );
	// side walls (hidden with the interior, which rebuilds the tent from the inside)
	g.quad( [ x1, y0, z0 ], [ x0, y0, z0 ], [ x0, y0 + wall, z0 ], [ x1, y0 + wall, z0 ], cm );
	g.quad( [ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y0 + wall, z1 ], [ x0, y0 + wall, z1 ], cm );
	// end walls (pentagons) with the door flaps
	for ( const [ x, s ] of [ [ x0, - 1 ], [ x1, 1 ] ] ) {
		const pts = [ [ x, y0, z0 ], [ x, y0, z1 ], [ x, y0 + wall, z1 ], [ x, y0 + ridge, cz ], [ x, y0 + wall, z0 ] ];
		if ( s < 0 ) { g.quad( pts[ 0 ], pts[ 1 ], pts[ 2 ], pts[ 4 ], cm ); g.tri( pts[ 4 ], pts[ 2 ], pts[ 3 ], cm ); } else { g.quad( pts[ 1 ], pts[ 0 ], pts[ 4 ], pts[ 2 ], cm ); g.tri( pts[ 2 ], pts[ 4 ], pts[ 3 ], cm ); }
		const fm = M( L.fabric, [ 90, 88, 60 ], 1.5 );
		g.box( x + s * 0.01 - 0.01, y0, cz - 0.7, x + s * 0.01 + 0.01, y0 + 1.9, cz + 0.7, fm );
	}
	g.setTag( P.r.i + 1, 255 );
	g.quad( [ x1 + 0.2, y0 + wall - 0.1, z0 - 0.2 ], [ x0 - 0.2, y0 + wall - 0.1, z0 - 0.2 ], [ x0 - 0.2, y0 + ridge, cz ], [ x1 + 0.2, y0 + ridge, cz ], cm );
	g.quad( [ x0 - 0.2, y0 + wall - 0.1, z1 + 0.2 ], [ x1 + 0.2, y0 + wall - 0.1, z1 + 0.2 ], [ x1 + 0.2, y0 + ridge, cz ], [ x0 - 0.2, y0 + ridge, cz ], cm );
	// inside of the canvas roof
	const im = M( L.fabric, [ 100, 98, 70 ], 1.5, 64 );
	g.quad( [ x0 - 0.2, y0 + wall - 0.12, z0 - 0.2 ], [ x1 + 0.2, y0 + wall - 0.12, z0 - 0.2 ], [ x1 + 0.2, y0 + ridge - 0.02, cz ], [ x0 - 0.2, y0 + ridge - 0.02, cz ], im );
	g.quad( [ x1 + 0.2, y0 + wall - 0.12, z1 + 0.2 ], [ x0 - 0.2, y0 + wall - 0.12, z1 + 0.2 ], [ x0 - 0.2, y0 + ridge - 0.02, cz ], [ x1 + 0.2, y0 + ridge - 0.02, cz ], im );
	if ( lod === 0 ) {
		// guy ropes' stakes and the ridge pole ends
		const pm = M( L.wood, [ 120, 100, 70 ], 1 );
		g.box( x0 - 0.05, y0, cz - 0.05, x0 + 0.05, y0 + ridge + 0.2, cz + 0.05, pm );
		g.box( x1 - 0.05, y0, cz - 0.05, x1 + 0.05, y0 + ridge + 0.2, cz + 0.05, pm );
	}
	void S;
}

// ---- steps, lots, awnings, signs, canopies -------------------------------------------------------------

// steps from raised floors (porches, front doors) down to the ground
export function frontSteps( P, gh ) {
	const out = [];
	const { S, rect } = P;
	const st = P.storeys[ 0 ];
	const fy = S.fy;
	for ( const f of st.facades ) {
		for ( const op of f.ops ) {
			if ( ! op.ext ) continue;
			// the door opens onto a porch: the steps go at the porch's outer edge in line with the door
			const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
			let x = f.ax + tx * op.u, z = f.az + tz * op.u;
			let side = f.side;
			if ( f.out && f.out.k === 'porch' ) {
				const pr = f.out;
				if ( side === 0 ) z = pr.z0; else if ( side === 2 ) z = pr.z1; else if ( side === 1 ) x = pr.x1; else x = pr.x0;
			} else if ( f.out ) continue;
			const gy = groundAt( P, gh, x + f.nx * 1.5, z + f.nz * 1.5 );
			const rise = fy - gy;
			if ( rise < 0.25 ) continue;
			// garage and hangar doors get a driveway ramp instead of steps
			const ramp = op.kind === 'roll' || op.kind === 'hangar';
			out.push( { x, z, nx: f.nx, nz: f.nz, side, w: ramp ? op.w + 0.8 : Math.max( 1.2, op.w + 0.4 ), rise, gy, kind: op.kind, ramp, len: ramp ? Math.min( 14, Math.max( 2, rise / 0.14 ) ) : 0 } );
		}
	}
	// a walk-up's ground-floor gallery stands on the plinth: a flight up from the ground in the middle of
	// each of its outer edges
	for ( const rl of st.rails ) {
		if ( rl.room.k !== 'gallery' ) continue;
		const len = Math.hypot( rl.x1 - rl.x0, rl.z1 - rl.z0 );
		if ( len < 1.6 ) continue;
		const [ nx, nz ] = SIDE_N[ rl.side ];
		const x = ( rl.x0 + rl.x1 ) / 2, z = ( rl.z0 + rl.z1 ) / 2;
		const gy = groundAt( P, gh, x + nx * 1.5, z + nz * 1.5 );
		const rise = fy - gy;
		if ( rise < 0.25 ) continue;
		out.push( { x, z, nx, nz, side: rl.side, w: Math.min( 2.4, len - 0.4 ), rise, gy, kind: 'walk', ramp: false, len: 0 } );
	}
	void rect;
	return out;
}

export function groundAt( P, gh, lx, lz ) {
	if ( ! gh ) return P.r.base;
	// gh: { n, x0, z0, step, h: Float32Array } in building-local coords (bilinear)
	const fx = Math.max( 0, Math.min( gh.n - 1.001, ( lx - gh.x0 ) / gh.step ) ), fz = Math.max( 0, Math.min( gh.n - 1.001, ( lz - gh.z0 ) / gh.step ) );
	const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
	const h = gh.h, n = gh.n;
	const a = h[ j * n + i ] * ( 1 - tx ) + h[ j * n + i + 1 ] * tx;
	const b = h[ ( j + 1 ) * n + i ] * ( 1 - tx ) + h[ ( j + 1 ) * n + i + 1 ] * tx;
	return a * ( 1 - tz ) + b * tz;
}

// a sloped concrete driveway from a raised roll-up door down to the ground
function rampOf( g, P, s ) {
	const cm = M( L.concrete, [ 200, 196, 188 ], 3 );
	const tx = - s.nz, tz = s.nx, hw = s.w / 2, fy = P.S.fy;
	const p = ( a, d, y ) => [ s.x + tx * a + s.nx * d, y, s.z + tz * a + s.nz * d ];
	const top0 = p( - hw, 0, fy ), top1 = p( hw, 0, fy ), end0 = p( - hw, s.len, s.gy + 0.02 ), end1 = p( hw, s.len, s.gy + 0.02 );
	// the slope (with t = ( -nz, nx ) this winding faces up)
	g.quad( top1, end1, end0, top0, cm );
	// side walls down to below the ground
	const b0 = p( - hw, 0, s.gy - 0.5 ), b1 = p( hw, 0, s.gy - 0.5 ), e0 = p( - hw, s.len, s.gy - 0.5 ), e1 = p( hw, s.len, s.gy - 0.5 );
	g.quad( b0, e0, end0, top0, cm ); g.quad( top0, end0, e0, b0, cm );
	g.quad( e1, b1, top1, end1, cm ); g.quad( end1, top1, b1, e1, cm );
}

export function stepBoxes( P, s ) {
	// boxes (local coords) for a flight of steps: [x0,y0,z0,x1,y1,z1]
	const n = Math.max( 1, Math.ceil( s.rise / ( s.ramp ? 0.1 : 0.18 ) ) );
	const rh = s.rise / n, run = s.ramp ? s.len / n : 0.3;
	const out = [];
	const tx = - s.nz, tz = s.nx; // along the edge
	for ( let k = 0; k < n; k ++ ) {
		const top = P.S.fy - rh * ( k + 1 ) + rh; // tread height of step k (k = 0 at the top)
		const d0 = k * run, d1 = ( k + 1 ) * run;
		const cx = s.x + s.nx * ( d0 + d1 ) / 2, cz = s.z + s.nz * ( d0 + d1 ) / 2;
		const hw = s.w / 2, hd = run / 2;
		const ex = Math.abs( tx ) * hw + Math.abs( s.nx ) * hd, ez = Math.abs( tz ) * hw + Math.abs( s.nz ) * hd;
		out.push( [ cx - ex, s.gy - 0.6, cz - ez, cx + ex, top - rh, cz + ez ] );
	}
	return out;
}

function pavedLot( g, P, gh, lod ) {
	const { r, rect } = P;
	// the whole lot footprint, draped over the ground samples, in front of and around the building
	const n = gh.n;
	// towers and civic buildings stand on a paved plaza, the rest on a car park
	const plaza = !! P.look?.plaza;
	const pm = plaza ? M( L.sidewalk, [ 236, 232, 224 ], 1 ) : M( L.parking, [ 255, 255, 255 ], 1 );
	const x0 = - r.w / 2, z0 = - r.d / 2, x1 = r.w / 2, z1 = r.d / 2;
	const nx = lod > 0 ? 2 : Math.max( 2, Math.min( 8, Math.round( r.w / 6 ) ) ), nz = lod > 0 ? 2 : Math.max( 2, Math.min( 10, Math.round( r.d / 6 ) ) );
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {
		const ax = x0 + ( x1 - x0 ) * i / nx, bx = x0 + ( x1 - x0 ) * ( i + 1 ) / nx;
		const az = z0 + ( z1 - z0 ) * j / nz, bz = z0 + ( z1 - z0 ) * ( j + 1 ) / nz;
		// skip cells fully under the building
		if ( ax >= rect.x0 - 0.01 && bx <= rect.x1 + 0.01 && az >= rect.z0 - 0.01 && bz <= rect.z1 + 0.01 ) continue;
		const y = ( x, z ) => groundAt( P, gh, x, z ) + 0.05;
		const s = plaza ? 1 / 3 : 1 / 5.2; // one parking stall (2.6 m) per half texture
		g.quadUV( [ ax, y( ax, bz ), bz ], [ bx, y( bx, bz ), bz ], [ bx, y( bx, az ), az ], [ ax, y( ax, az ), az ],
			[ ax * s, - bz * s, bx * s, - bz * s, bx * s, - az * s, ax * s, - az * s ], pm, [ 0, 1, 0 ] );
	}
	void n;
}

function features( g, P, lod, gh ) {
	const { S, mat, rect, r } = P;
	const st = P.storeys[ 0 ];
	// steps
	for ( const s of P.feats.steps || [] ) {
		if ( s.ramp ) { rampOf( g, P, s ); continue; }
		const sm = S.arch === 'house' && S.variant.startsWith( 'plantation' ) ? M( L.planks, [ 170, 150, 120 ], 1.5 ) : M( L.concrete, [ 205, 200, 190 ], 2 );
		for ( const b of stepBoxes( P, s ) ) g.box( b[ 0 ], b[ 1 ], b[ 2 ], b[ 3 ], b[ 4 ], b[ 5 ], sm, 8 );
	}
	// awnings and signs over storefronts
	if ( S.arch === 'shop' || S.arch === 'food' || S.arch === 'bigbox' || S.arch === 'gas' || ( S.arch === 'tower' && S.shop ) ) storefronts( g, P, lod );
	else if ( [ 'police', 'fire', 'hospital', 'clinic', 'school', 'church', 'hq', 'armory', 'office', 'tower', 'walkup' ].includes( S.arch ) ) nameSign( g, P, lod );
	if ( P.look && ( P.look.canopy || P.look.fins ) ) towerDress( g, P, lod );
	if ( P.look?.balc === 'band' ) balconies( g, P, lod );
	if ( P.feats.canopy ) gasCanopy( g, P, lod, gh );
	if ( S.arch === 'terminal' ) terminalCanopy( g, P, lod, gh );
	if ( S.arch === 'ctower' ) towerCab( g, P, lod );
	if ( S.arch === 'fire' && lod === 0 ) {
		// the hose-drying tower
		// behind the building (the stairwell fills the back corner inside)
		const tm = M( L.cmu, [ 210, 200, 186 ], 2.4 );
		const [ x0, z0, x1, z1 ] = hoseTower( P );
		g.box( x0, P.r.lo - 0.5, z0, x1, S.top + 5, z1, tm, 8 );
		flatCap( g, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, S.top + 5 );
	}
	void st; void mat; void r; void gh;
}

// ---- the airport ---------------------------------------------------------------------------------------------

// the drop-off canopy along the terminal's landside front: its extent and its columns (local coords)
export function terminalCanopyOf( P ) {
	const { rect, S } = P;
	const c = { x0: rect.x0 + 1.5, x1: rect.x1 - 1.5, z0: rect.z0 - 6, z1: rect.z0, y: S.fy + 4.9, cols: [] };
	const n = Math.max( 2, Math.round( ( c.x1 - c.x0 ) / 8 ) );
	for ( let i = 0; i <= n; i ++ ) c.cols.push( [ c.x0 + 0.4 + ( c.x1 - c.x0 - 0.8 ) * i / n, c.z0 + 0.5 ] );
	return c;
}

function terminalCanopy( g, P, lod, gh ) {
	const c = terminalCanopyOf( P );
	const white = M( L.spandrel, [ 236, 236, 232 ], 2 ), under = M( L.plain, [ 226, 226, 222 ], 1 );
	g.box( c.x0, c.y, c.z0, c.x1, c.y + 0.55, c.z1, { px: white, nx: white, nz: white, py: M( L.bitumen, [ 176, 176, 176 ], 4 ), ny: under } );
	const colM = M( L.spandrel, [ 200, 202, 206 ], 1 );
	for ( const [ x, z ] of c.cols ) {
		const y = gh ? groundAt( P, gh, x, z ) : P.S.fy;
		g.cyl( x, y - 0.3, z, 0.18, c.y - y + 0.3, lod > 0 ? 6 : 12, colM, 0 );
	}
	// the curb along the drop-off lane
	if ( lod === 0 ) {
		const cm = M( L.concrete, [ 214, 210, 202 ], 2 );
		const y = gh ? groundAt( P, gh, ( c.x0 + c.x1 ) / 2, c.z0 ) : P.S.fy;
		g.box( c.x0, y - 0.3, c.z0 - 0.02, c.x1, y + 0.15, c.z0 + 0.25, cm );
	}
	// Departures over the left door, Arrivals over the right one
	const st = P.storeys[ 0 ];
	const f = st.facades.find( f => f.side === 0 && f.ops.some( o => o.ext ) );
	if ( ! f ) return;
	// (u runs to the right of someone facing the building)
	const doors = f.ops.filter( o => o.ext ).sort( ( a, b ) => a.u - b.u ).map( o => f.ax + ( f.bx - f.ax ) / f.len * o.u );
	const names = [ signIndex( 'Departures' ), signIndex( 'Arrivals' ) ];
	doors.forEach( ( x, k ) => {
		const idx = names[ Math.min( k, 1 ) ];
		if ( idx < 0 ) return;
		const sg = { idx, board: SIGNS[ idx ].bg };
		signBoard( g, x - 2.6, x + 2.6, c.y + 0.05, c.y + 0.5, c.z0 - 0.12, sg );
	} );
}

// the control tower's cab: a catwalk round it, the overhanging roof, antennas and the radar
export function towerCatwalkOf( P ) {
	const { rect, S } = P;
	return { x0: rect.x0 - 1.1, x1: rect.x1 + 1.1, z0: rect.z0 - 1.1, z1: rect.z1 + 1.1, y: S.ys[ S.n - 1 ] };
}

function towerCab( g, P, lod ) {
	const { rect, S, mat } = P;
	const cw = towerCatwalkOf( P ), y = cw.y;
	const deck = M( L.concrete, [ 206, 204, 198 ], 2 ), under = M( L.plain, [ 214, 212, 206 ], 1 );
	const DM = { py: deck, ny: under, px: mat.ext, nx: mat.ext, pz: mat.ext, nz: mat.ext };
	g.box( cw.x0, y - 0.3, cw.z0, cw.x1, y, rect.z0, DM );
	g.box( cw.x0, y - 0.3, rect.z1, cw.x1, y, cw.z1, DM );
	g.box( cw.x0, y - 0.3, rect.z0, rect.x0, y, rect.z1, DM );
	g.box( rect.x1, y - 0.3, rect.z0, cw.x1, y, rect.z1, DM );
	const corners = [ [ cw.x0, cw.z0 ], [ cw.x1, cw.z0 ], [ cw.x1, cw.z1 ], [ cw.x0, cw.z1 ] ];
	for ( let k = 0; k < 4; k ++ ) railing( g, P, corners[ k ], corners[ ( k + 1 ) % 4 ], y, [], lod > 0 ? 1.5 : 0.5, 'catwalk' );
	// the roof slab overhangs the slanted-looking glass
	const top = S.top;
	const roofM = { py: M( L.bitumen, [ 176, 176, 176 ], 4 ), ny: under, px: mat.ext, nx: mat.ext, pz: mat.ext, nz: mat.ext };
	g.box( rect.x0 - 1.3, top - 0.05, rect.z0 - 1.3, rect.x1 + 1.3, top + 0.5, rect.z1 + 1.3, roofM );
	const R = rng( hash32( P.bid, 0x70e ) );
	const mast = M( L.spandrel, [ 190, 190, 190 ], 1 ), red = M( L.plain, [ 190, 40, 32 ], 1 );
	const cx = ( rect.x0 + rect.x1 ) / 2, cz = ( rect.z0 + rect.z1 ) / 2;
	g.cyl( cx + 2.2, top + 0.5, cz - 2.2, 0.08, 6.5, 6, mast, 1 );
	g.cyl( cx + 2.2, top + 7.0, cz - 2.2, 0.14, 0.3, 8, red, 1 );
	if ( lod > 0 ) return;
	g.cyl( cx - 2.4, top + 0.5, cz + 2.0, 0.05, 3.5 + R() * 2, 6, mast, 1 );
	// the radar on a short plinth
	g.box( cx - 0.5, top + 0.5, cz - 0.5, cx + 0.5, top + 1.3, cz + 0.5, M( L.plain, [ 220, 220, 216 ], 1 ) );
	g.push().translate( cx, top + 1.5, cz ).rotY( R() * Math.PI );
	g.box( - 1.2, - 0.2, - 0.08, 1.2, 0.35, 0.08, M( L.plain, [ 236, 236, 232 ], 1 ) );
	g.pop();
}

export function hoseTower( P ) {
	const r = P.rect;
	return [ r.x1 - 3.2, r.z1, r.x1, r.z1 + 3.2 ];
}

function flatCap( g, x0, z0, x1, z1, y ) {
	g.box( x0, y, z0, x1, y + 0.2, z1, M( L.concrete, [ 200, 196, 188 ], 2 ) );
}

// a big box's entrance portal: two piers and a head over the doors, rising above the roof with the sign
export function portalOf( P ) {
	const { S, rect } = P;
	if ( S.arch !== 'bigbox' || rect.x1 - rect.x0 < 18 ) return null;
	const cx = ( rect.x0 + rect.x1 ) / 2;
	return { x0: cx - 4.6, x1: cx + 4.6, z0: rect.z0 - 1.4, z1: rect.z0, pw: 1.0, y1: S.top + 2.8 };
}

function storefronts( g, P, lod ) {
	const { S, mat, rect } = P;
	const st = P.storeys[ 0 ];
	const R = rng( hash32( P.bid, 0xa3 ) );
	const look = P.look || {};
	const aw = S.arch !== 'bigbox' && S.arch !== 'gas' && S.arch !== 'tower';
	const units = P.units || [ { x0: rect.x0, x1: rect.x1, shop: S.shop || S.type } ];
	const cap = M( L.concrete, [ 214, 210, 202 ], 2 );
	// piers between the storefronts, up to the false front
	if ( look.piers && ( S.arch === 'shop' || S.arch === 'food' ) ) {
		const pm = look.accent || mat.ext, y1 = S.top + 0.8 + 0.9;
		const xs = [ rect.x0 + 0.25, ...units.slice( 1 ).map( u => u.x0 ), rect.x1 - 0.25 ];
		for ( const x of xs ) g.box( x - 0.25, S.fy - 0.2, rect.z0 - 0.18, x + 0.25, y1, rect.z0, { px: pm, nx: pm, nz: pm, py: cap }, 16 );
	}
	// the big box's portal and its canopy along the front
	const po = portalOf( P );
	if ( po ) {
		const am = look.accent || mat.ext;
		const pm = { px: am, nx: am, pz: am, nz: am, py: cap, ny: am };
		g.box( po.x0, S.fy - 0.3, po.z0, po.x0 + po.pw, po.y1, po.z1, pm );
		g.box( po.x1 - po.pw, S.fy - 0.3, po.z0, po.x1, po.y1, po.z1, pm );
		g.box( po.x0 + po.pw, S.fy + 4.2, po.z0, po.x1 - po.pw, po.y1, po.z1, pm );
		const cy = S.fy + 3.4, top = M( L.spandrel, [ 176, 178, 180 ], 2 ), soffit = M( L.plain, [ 232, 230, 224 ], 1 );
		for ( const [ a, b ] of [ [ rect.x0 + 0.3, po.x0 ], [ po.x1, rect.x1 - 0.3 ] ] ) if ( b - a > 1.5 ) g.box( a, cy, rect.z0 - 2.4, b, cy + 0.3, rect.z0, { px: am, nx: am, nz: am, py: top, ny: soffit } );
	}
	for ( let u = 0; u < units.length; u ++ ) {
		const un = units[ u ];
		const x0 = un.x0 + 0.3, x1 = un.x1 - 0.3;
		const w = x1 - x0;
		if ( w < 2 ) continue;
		const z = rect.z0;
		const yA = S.fy + Math.min( 3.1, st.h - 0.9 );
		if ( aw ) {
			// sloped fabric awning with a valance
			const am = { ...mat.awning, c: PAL_AWN( R ) };
			const out = 1.5;
			g.quad( [ x1, yA - 0.5, z - out ], [ x0, yA - 0.5, z - out ], [ x0, yA, z ], [ x1, yA, z ], am );
			g.quad( [ x0, yA - 0.52, z - out ], [ x1, yA - 0.52, z - out ], [ x1, yA - 0.02, z ], [ x0, yA - 0.02, z ], am );
			g.box( x0, yA - 0.8, z - out - 0.02, x1, yA - 0.5, z - out, am );
			if ( lod === 0 ) {
				g.box( x0 - 0.02, yA - 0.8, z - out, x0, yA, z, am );
				g.box( x1, yA - 0.8, z - out, x1 + 0.02, yA, z, am );
			}
		}
		// the sign board: above the awning on the false front
		const sg = signFor( P, u, un.shop );
		if ( sg ) {
			if ( po && u === 0 ) {
				// on the portal's head, above the roof line
				const sw = po.x1 - po.x0 - 0.6, sh = Math.min( 1.8, sw / 7 );
				signBoard( g, po.x0 + 0.3, po.x1 - 0.3, po.y1 - sh - 0.5, po.y1 - 0.5, po.z0 - 0.12, sg );
				continue;
			}
			const sy0 = S.arch === 'tower' ? Math.max( S.fy + st.h - 1.3, S.fy + Math.min( 3.3, S.Hs[ 0 ] - 0.9 ) + 0.42 ) : S.arch === 'bigbox' ? S.top - 2.2 : yA + 0.25;
			const sh = S.arch === 'bigbox' ? 1.8 : 1.0;
			const sw = Math.min( w - 0.4, sh * ( S.arch === 'bigbox' ? 7 : 7.5 ) );
			const cx = ( x0 + x1 ) / 2;
			signBoard( g, cx - sw / 2, cx + sw / 2, sy0, sy0 + sh, z - 0.12, sg );
		}
	}
}
const PAL_AWN = ( R ) => [ [ 170, 40, 36 ], [ 36, 96, 70 ], [ 38, 70, 128 ], [ 214, 170, 50 ], [ 60, 60, 64 ], [ 200, 90, 40 ], [ 30, 120, 130 ], [ 120, 40, 90 ] ][ Math.floor( R() * 8 ) ];

// a board with the sign atlas on its face (front faces -z in local coords)
function signBoard( g, x0, x1, y0, y1, z, sg ) {
	const back = M( L.plain, sg.board || [ 40, 40, 44 ], 1 );
	g.box( x0, y0, z, x1, y1, z + 0.1, { px: back, nx: back, py: back, ny: back, pz: back } );
	// the face: the sign's atlas slot, cropped to the board's aspect
	const uv = signUV( sg.idx, ( x1 - x0 ) / ( y1 - y0 ) );
	const face = M( L.sign0, WHITE, 1 );
	g.quadUV( [ x1, y0, z ], [ x0, y0, z ], [ x0, y1, z ], [ x1, y1, z ], [ uv[ 0 ], uv[ 1 ], uv[ 2 ], uv[ 1 ], uv[ 2 ], uv[ 3 ], uv[ 0 ], uv[ 3 ] ], face, [ 0, 0, - 1 ] );
}

// institutional name boards over the entrance
function nameSign( g, P, lod ) {
	const { S, rect } = P;
	const sg = signFor( P, 0, S.type );
	if ( ! sg || lod > 1 ) return;
	const st = P.storeys[ 0 ];
	// centre over the main entrance
	let cx = ( rect.x0 + rect.x1 ) / 2;
	const f = st.facades.find( f => f.side === 0 && f.ops.some( o => o.ext ) );
	if ( f ) { const o = f.ops.find( o => o.ext ); cx = f.ax + ( f.bx - f.ax ) / f.len * o.u; }
	const sh = S.arch === 'walkup' ? 0.6 : 0.8, sw = sh * 7;
	const y0 = S.arch === 'tower' ? S.fy + st.h - 1.1 : S.fy + Math.min( st.h - 0.9, 2.8 );
	const x0 = Math.max( rect.x0 + 0.2, cx - sw / 2 ), x1 = Math.min( rect.x1 - 0.2, x0 + sw );
	signBoard( g, x0, x1, y0, y0 + sh, rect.z0 - 0.12, sg );
	// the tower's name up top
	if ( S.arch === 'tower' && sg.top ) {
		const w = Math.min( rect.x1 - rect.x0 - 2, 14 );
		signBoard( g, - w / 2 + ( rect.x0 + rect.x1 ) / 2, w / 2 + ( rect.x0 + rect.x1 ) / 2, S.top - 2.4, S.top - 0.6, rect.z0 - 0.12, sg.top );
	}
}

function gasCanopy( g, P, lod, gh ) {
	const { r, S } = P;
	const R = rng( hash32( P.bid, 0x9a5 ) );
	const pumps = pumpsOf( r, S );
	if ( ! pumps.length ) return;
	const xs = pumps.map( p => p[ 0 ] ), zs = pumps.map( p => p[ 1 ] );
	const x0 = Math.min( ...xs ) - 4, x1 = Math.max( ...xs ) + 4, z0 = Math.min( ...zs ) - 3.4, z1 = Math.max( ...zs ) + 3.4;
	// the forecourt follows the ground, not the kiosk's floor
	const gy = ( x, z ) => gh ? groundAt( P, gh, x, z ) : S.fy;
	const base = Math.max( ...pumps.map( p => gy( p[ 0 ], p[ 1 ] ) ) );
	const h = base + 5.0;
	const sg = signFor( P, 0, 'gas' );
	const brand = sg ? SIGNS[ sg.idx ].bg : PAL_AWN( R );
	const fm = M( L.plain, brand, 1 );
	const white = M( L.plain, [ 236, 236, 232 ], 1 );
	const under = M( L.plain, [ 220, 220, 216 ], 1 );
	g.box( x0, h, z0, x1, h + 0.9, z1, { px: fm, nx: fm, pz: fm, nz: fm, py: white, ny: under } );
	// columns at the pump islands
	const cm = M( L.plain, [ 230, 230, 226 ], 1 );
	for ( const [ px, pz ] of pumps ) {
		if ( pz > ( z0 + z1 ) / 2 ) continue;
		const cz = ( z0 + z1 ) / 2;
		g.box( px - 0.2, gy( px, cz ) - 0.3, cz - 0.2, px + 0.2, h, cz + 0.2, cm );
	}
	// islands and pumps
	const curb = M( L.concrete, [ 215, 212, 205 ], 2 );
	const pumpM = M( L.plain, [ 226, 226, 222 ], 1 );
	const panel = M( L.plain, brand, 1 );
	const dark = M( L.plain, [ 30, 32, 36 ], 1 );
	for ( const [ px, pz ] of pumps ) {
		const y = gy( px, pz );
		g.box( px - 0.7, y - 0.5, pz - 1.3, px + 0.7, y + 0.15, pz + 1.3, curb );
		g.box( px - 0.35, y + 0.15, pz - 0.28, px + 0.35, y + 1.7, pz + 0.28, pumpM );
		g.box( px - 0.36, y + 1.2, pz - 0.29, px + 0.36, y + 1.65, pz + 0.29, panel );
		if ( lod === 0 ) {
			g.box( px - 0.2, y + 0.9, pz - 0.3, px + 0.2, y + 1.15, pz - 0.28, dark );
			g.box( px - 0.2, y + 0.9, pz + 0.28, px + 0.2, y + 1.15, pz + 0.3, dark );
			// hoses
			g.box( px + 0.36, y + 0.6, pz - 0.2, px + 0.42, y + 1.3, pz - 0.14, dark );
			g.box( px - 0.42, y + 0.6, pz + 0.14, px - 0.36, y + 1.3, pz + 0.2, dark );
		}
	}
	// price sign by the street
	const sx = r.w / 2 - 2, sz = - r.d / 2 + 2, sy = gy( sx, sz );
	g.box( sx - 0.12, sy - 0.5, sz - 0.12, sx + 0.12, sy + 5.5, sz + 0.12, M( L.spandrel, [ 180, 180, 180 ], 1 ) );
	g.box( sx - 1.2, sy + 5.5, sz - 0.2, sx + 1.2, sy + 7.5, sz + 0.2, { px: fm, nx: fm, py: fm, ny: fm, pz: white, nz: white } );
	if ( sg ) signBoard( g, x0 + 1, x1 - 1, h + 0.1, h + 0.8, z0 - 0.02, sg );
	void lod;
}
