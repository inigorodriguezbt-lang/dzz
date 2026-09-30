// Ground movement shared by the infected, survivors and land animals: steering towards a goal around walls and
// buildings (a grid path planned on demand, short probes with a sticky detour side while there is none),
// separation from neighbours, keeping out of deep water and off cliffs, stuck detection, and the move itself
// (collide with the physics boxes, follow the ground, fall).
import * as THREE from 'three';
// (Math.hypot boxes its arguments in V8: garbage on hot paths)
const hyp = ( a, b ) => Math.sqrt( a * a + b * b );

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const PROBE_ANGLES = [ 0.45, 0.9, 1.35, 1.9, 2.5 ];
const _near = [];
// probes ignore what can be stepped over (kerbs, stairs): a module-level filter, no closure per call
let _minY = 0;
const tall = ( b ) => b.maxY > _minY;
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

// per-mover steering state
export class Mover {
	constructor( radius = 0.3, height = 1.7 ) {
		this.r = radius;
		this.h = height;
		this.dir = new THREE.Vector3( 0, 0, - 1 ); // wanted heading (unit, xz)
		this.detour = 0; // seconds left following the detour side
		this.side = Math.random() < 0.5 ? 1 : - 1;
		this.blocked = null; // the box in the way on the last probe (doors)
		this.stuckT = 0; this.stuckN = 0;
		this.lastX = 0; this.lastZ = 0;
		this.onGround = true;
		this.vy = 0;
		this.water = false; // may enter deep water (sharks, swimmers)
		this.maxSlope = 0.6; // min ground normal y
		this.path = { pts: new Float32Array( 64 ), n: 0, i: 0, gx: 0, gz: 0, t: 0 }; // planned waypoints (xz pairs)
		this.planT = 0; // seconds until another plan may be made
	}
}

// is a straight walk of `len` metres along (dx, dz) from p free of walls, water and cliffs?
export function pathFree( game, p, dx, dz, len, m, knee = 0.75 ) {
	const P = game.physics, hf = game.hf;
	_o.set( p.x, p.y + knee, p.z );
	_d.set( dx, 0, dz );
	_minY = p.y + 0.5;
	const hit = P.raycastBoxes( _o, _d, len + m.r, tall );
	if ( hit ) { m.blocked = hit.box; return false; }
	// the ground ahead: no deep water for walkers, no cliffs
	const ax = p.x + dx * ( len + m.r ), az = p.z + dz * ( len + m.r );
	const h = hf.heightAt( ax, az );
	if ( ! m.water && h < - 0.7 ) return false;
	if ( m.water && h > - 1.2 ) return false;
	if ( ! m.water ) {
		if ( h - p.y > 1.2 && ! P.near( ax, az, 0.2, _near ).length ) return false; // a rock face, not stairs
		if ( m.maxSlope > 0 && hf.normalAt( ax, az, _n, 1 ).y < m.maxSlope && h > p.y + 0.2 ) return false;
	}
	return true;
}

// choose m.dir towards (gx, gz). think(): call a few times a second, not every frame.
// Straight at the goal when the way is clear; around walls and buildings on a planned path (see findPath) when it
// is not; short probes (a sticky detour side = wall following) while no plan is available.
export function steer( game, ent, m, gx, gz, dt, neighbours = null ) {
	const p = ent.pos;
	let dx = gx - p.x, dz = gz - p.z;
	const dist = hyp( dx, dz );
	if ( dist < 1e-3 ) return 0;
	dx /= dist; dz /= dist;
	const probe = Math.min( 1.6, dist );
	m.blocked = null;
	let ox = dx, oz = dz;
	m.detour = Math.max( 0, m.detour - dt );
	m.planT -= dt;
	const direct = pathFree( game, p, dx, dz, probe, m );
	let following = false;
	if ( direct && ! m.path.n && m.detour <= 0 ) {
		// straight on
	} else if ( followPath( game, p, m, gx, gz, direct ) ) {
		ox = m.dir.x; oz = m.dir.z; following = true;
	} else if ( m.detour <= 0 && direct ) {
		// straight on
	} else {
		// around the obstacle: keep to the side we chose (wall following), else the side closer to the goal
		let found = false;
		const a0 = Math.atan2( dx, dz );
		for ( const a of PROBE_ANGLES ) {
			for ( let k = 0; k < 2; k ++ ) {
				const s = k ? - m.side : m.side;
				const b = a0 + a * s;
				const cx = Math.sin( b ), cz = Math.cos( b );
				if ( pathFree( game, p, cx, cz, 1.3, m ) ) {
					ox = cx; oz = cz; found = true;
					if ( s !== m.side && m.detour <= 0 ) m.side = s;
					break;
				}
			}
			if ( found ) break;
		}
		if ( found ) m.detour = Math.max( m.detour, 0.8 );
		else { ox = - dx; oz = - dz; m.side = - m.side; m.detour = 1.2; }
		// check again soon whether the straight line has opened up
		if ( m.detour > 0 && pathFree( game, p, dx, dz, probe, m ) ) m.detour = Math.min( m.detour, 0.3 );
	}
	// separation from neighbours (weaker on a planned path: the corridor may be narrow)
	if ( neighbours ) {
		let sx = 0, sz = 0;
		for ( const e of neighbours ) {
			if ( e === ent || ! e.alive ) continue;
			const ex = p.x - e.pos.x, ez = p.z - e.pos.z;
			const d2 = ex * ex + ez * ez;
			const rr = ( e.radius || 0.3 ) + m.r + 0.25;
			if ( d2 > rr * rr || d2 < 1e-6 ) continue;
			const d = Math.sqrt( d2 );
			sx += ex / d * ( rr - d ) / rr; sz += ez / d * ( rr - d ) / rr;
		}
		const k = following ? 0.8 : 1.5;
		ox += sx * k; oz += sz * k;
		const l = hyp( ox, oz ) || 1;
		ox /= l; oz /= l;
	}
	m.dir.set( ox, 0, oz );
	return dist;
}

// ---- path planning ------------------------------------------------------------------------------------------------
//
// A* over a throwaway occupancy grid around the mover and its goal, rasterised from the physics boxes it could
// bump into (walls, props, parked cars; not kerbs or ceilings), deep water and cliffs, then string-pulled into a few
// waypoints. Closed doors are passable at a cost: the path leads to the door and the infected pound on it.
// Plans are rationed per frame (nav.budget) because a big grid costs a millisecond or two.

export const nav = { budget: 2, plans: 0, fails: 0 };
const CELL = 0.8, MAXN = 110;
const PLAN_R = 70; // plan at most this far; beyond, towards a point this far along the way
let G = null;
function grid( n ) {
	if ( G && G.cap >= n ) return G;
	const cap = Math.max( n, MAXN * MAXN );
	G = { cap, occ: new Uint8Array( cap ), gs: new Float32Array( cap ), par: new Int32Array( cap ), seen: new Uint32Array( cap ), shut: new Uint32Array( cap ),
		heap: new Int32Array( cap ), hf: new Float32Array( cap ), stamp: 0, n: 0 };
	return G;
}
let _planMinY = 0, _planMaxY = 0;
const planBox = ( b ) => b.maxY > _planMinY && b.minY < _planMaxY;
const _boxes = [];

// plan from p to (gx, gz); writes world waypoints into m.path. Returns true on success.
export function findPath( game, p, gx, gz, m ) {
	const P = game.physics, hf = game.hf;
	let tx = gx, tz = gz;
	const full = hyp( gx - p.x, gz - p.z );
	if ( full > PLAN_R ) { tx = p.x + ( gx - p.x ) / full * PLAN_R; tz = p.z + ( gz - p.z ) / full * PLAN_R; }
	const dist = hyp( tx - p.x, tz - p.z );
	const pad = 10 + dist * 0.35;
	let x0 = Math.min( p.x, tx ) - pad, z0 = Math.min( p.z, tz ) - pad;
	let nx = Math.ceil( ( Math.max( p.x, tx ) + pad - x0 ) / CELL ), nz = Math.ceil( ( Math.max( p.z, tz ) + pad - z0 ) / CELL );
	if ( nx > MAXN ) { x0 += ( nx - MAXN ) * CELL * 0.5; nx = MAXN; }
	if ( nz > MAXN ) { z0 += ( nz - MAXN ) * CELL * 0.5; nz = MAXN; }
	const N = nx * nz, g = grid( N );
	const occ = g.occ;
	occ.fill( 0, 0, N );
	// obstacles: what stands between knee and head height on this level, grown by the mover's radius
	_planMinY = p.y + 0.5; _planMaxY = p.y + Math.max( 1.2, m.h );
	const cx = x0 + nx * CELL * 0.5, cz = z0 + nz * CELL * 0.5;
	const list = P.near( cx, cz, hyp( nx, nz ) * CELL * 0.5, _boxes );
	const grow = m.r * 0.9;
	for ( const b of list ) {
		if ( ! planBox( b ) ) continue;
		// closed doors can be broken through; an open or broken leaf is just in the way
		const v = b.kind === 'door' && ! ( b.owner && ( b.owner.broken || b.owner.isOpen ) ) ? 2 : 1;
		const i0 = Math.max( 0, Math.floor( ( b.minX - grow - x0 ) / CELL ) ), i1 = Math.min( nx - 1, Math.floor( ( b.maxX + grow - x0 ) / CELL ) );
		const j0 = Math.max( 0, Math.floor( ( b.minZ - grow - z0 ) / CELL ) ), j1 = Math.min( nz - 1, Math.floor( ( b.maxZ + grow - z0 ) / CELL ) );
		for ( let j = j0; j <= j1; j ++ ) {
			const z = z0 + ( j + 0.5 ) * CELL;
			for ( let i = i0; i <= i1; i ++ ) {
				const k = j * nx + i;
				if ( occ[ k ] === 1 ) continue;
				const dx = x0 + ( i + 0.5 ) * CELL - b.x, dz = z - b.z;
				const u = dx * b.c - dz * b.s, w = dx * b.s + dz * b.c;
				if ( Math.abs( u ) <= b.hx + grow && Math.abs( w ) <= b.hz + grow ) occ[ k ] = v;
			}
		}
	}
	// the sea for walkers (only near the coast: inland the corners are all high ground)
	if ( ! m.water && Math.min( hf.baseHeight( x0, z0 ), hf.baseHeight( x0 + nx * CELL, z0 ), hf.baseHeight( x0, z0 + nz * CELL ), hf.baseHeight( x0 + nx * CELL, z0 + nz * CELL ), hf.baseHeight( cx, cz ) ) < 3 ) {
		for ( let j = 0; j < nz; j += 1 ) for ( let i = 0; i < nx; i += 1 ) {
			if ( hf.heightAt( x0 + ( i + 0.5 ) * CELL, z0 + ( j + 0.5 ) * CELL ) < - 0.7 ) occ[ j * nx + i ] = 1;
		}
	}
	const cell = ( x, z ) => {
		const i = Math.floor( ( x - x0 ) / CELL ), j = Math.floor( ( z - z0 ) / CELL );
		return i < 0 || j < 0 || i >= nx || j >= nz ? - 1 : j * nx + i;
	};
	// start and goal: the nearest free cells
	const free = ( k ) => {
		if ( k < 0 ) return - 1;
		if ( occ[ k ] !== 1 ) return k;
		const i = k % nx, j = ( k - i ) / nx;
		for ( let r = 1; r <= 3; r ++ ) for ( let b = - r; b <= r; b ++ ) for ( let a = - r; a <= r; a ++ ) {
			if ( Math.max( Math.abs( a ), Math.abs( b ) ) !== r ) continue;
			const ii = i + a, jj = j + b;
			if ( ii >= 0 && jj >= 0 && ii < nx && jj < nz && occ[ jj * nx + ii ] !== 1 ) return jj * nx + ii;
		}
		return - 1;
	};
	const s = free( cell( p.x, p.z ) ), t = free( cell( tx, tz ) );
	if ( s < 0 || t < 0 ) return false;
	nav.plans ++;
	// A* (8-connected, no corner cutting), binary heap keyed on f
	const st = ++ g.stamp;
	const gs = g.gs, par = g.par, seen = g.seen, shut = g.shut, heap = g.heap, hfv = g.hf;
	const ti = t % nx, tj = ( t - ti ) / nx;
	const H = ( k ) => { const i = k % nx, j = ( k - i ) / nx; const ax = Math.abs( i - ti ), az = Math.abs( j - tj ); return ( ax + az + ( 1.4142 - 2 ) * Math.min( ax, az ) ) * 1.05; };
	let hn = 0;
	const push = ( k, f ) => {
		let c = hn ++;
		while ( c > 0 ) { const pa = ( c - 1 ) >> 1; if ( hfv[ pa ] <= f ) break; heap[ c ] = heap[ pa ]; hfv[ c ] = hfv[ pa ]; c = pa; }
		heap[ c ] = k; hfv[ c ] = f;
	};
	const pop = () => {
		const top = heap[ 0 ];
		const lk = heap[ -- hn ], lf = hfv[ hn ];
		let c = 0;
		for ( ;; ) {
			let ch = c * 2 + 1;
			if ( ch >= hn ) break;
			if ( ch + 1 < hn && hfv[ ch + 1 ] < hfv[ ch ] ) ch ++;
			if ( hfv[ ch ] >= lf ) break;
			heap[ c ] = heap[ ch ]; hfv[ c ] = hfv[ ch ]; c = ch;
		}
		heap[ c ] = lk; hfv[ c ] = lf;
		return top;
	};
	gs[ s ] = 0; par[ s ] = - 1; seen[ s ] = st;
	push( s, H( s ) );
	let found = false, iter = 0;
	while ( hn > 0 && iter ++ < 12000 ) {
		const k = pop();
		if ( shut[ k ] === st ) continue;
		shut[ k ] = st;
		if ( k === t ) { found = true; break; }
		const i = k % nx, j = ( k - i ) / nx;
		for ( let d = 0; d < 8; d ++ ) {
			const a = DX[ d ], b = DZ[ d ];
			const ii = i + a, jj = j + b;
			if ( ii < 0 || jj < 0 || ii >= nx || jj >= nz ) continue;
			const nk = jj * nx + ii;
			const o = occ[ nk ];
			if ( o === 1 || shut[ nk ] === st ) continue;
			if ( a && b && ( occ[ j * nx + ii ] === 1 || occ[ jj * nx + i ] === 1 ) ) continue;
			const ng = gs[ k ] + ( a && b ? 1.4142 : 1 ) + ( o === 2 ? 6 : 0 );
			if ( seen[ nk ] === st && ng >= gs[ nk ] ) continue;
			seen[ nk ] = st; gs[ nk ] = ng; par[ nk ] = k;
			push( nk, ng + H( nk ) );
		}
	}
	if ( ! found ) { nav.fails ++; return false; }
	// walk back, then keep only the corners (string pulling on the grid)
	const cells = _cells;
	cells.length = 0;
	for ( let k = t; k >= 0; k = par[ k ] ) { cells.push( k ); if ( k === s ) break; }
	cells.reverse();
	const path = m.path;
	path.n = 0;
	let a = 0;
	while ( a < cells.length - 1 ) {
		let b = cells.length - 1;
		while ( b > a + 1 && ! gridLine( occ, nx, cells[ a ], cells[ b ] ) ) b --;
		const k = cells[ b ], i = k % nx, j = ( k - i ) / nx;
		if ( path.n < path.pts.length / 2 ) {
			// the last point is the goal itself when it was reachable
			const last = b === cells.length - 1 && k === cell( tx, tz );
			path.pts[ path.n * 2 ] = last ? tx : x0 + ( i + 0.5 ) * CELL;
			path.pts[ path.n * 2 + 1 ] = last ? tz : z0 + ( j + 0.5 ) * CELL;
			path.n ++;
		}
		a = b;
	}
	path.i = 0; path.gx = gx; path.gz = gz; path.t = 0;
	return path.n > 0;
}
const DX = [ 1, - 1, 0, 0, 1, 1, - 1, - 1 ], DZ = [ 0, 0, 1, - 1, 1, - 1, 1, - 1 ];
const _cells = [];

// a straight run between two cells over free ground (supercover walk)
function gridLine( occ, nx, a, b ) {
	let i = a % nx, j = ( a - i ) / nx;
	const i1 = b % nx, j1 = ( b - i1 ) / nx;
	const di = Math.abs( i1 - i ), dj = Math.abs( j1 - j ), si = i1 > i ? 1 : - 1, sj = j1 > j ? 1 : - 1;
	let err = di - dj;
	for ( let n = di + dj; n > 0; n -- ) {
		const e2 = err * 2;
		if ( e2 > - dj ) { err -= dj; i += si; } else { err += di; j += sj; }
		if ( occ[ j * nx + i ] ) return false;
	}
	return true;
}

// steer along m.path; plans one when the way is blocked. Returns true while it has a path to follow.
function followPath( game, p, m, gx, gz, direct ) {
	const path = m.path;
	// the goal moved away from the one planned for (a chase): plan again
	if ( path.n && hyp( path.gx - gx, path.gz - gz ) > 4 ) path.n = 0;
	if ( path.n && direct && hyp( gx - p.x, gz - p.z ) < 12 ) path.n = 0; // clear line to a close goal
	if ( ! path.n ) {
		if ( direct || m.planT > 0 || nav.budget <= 0 ) return false;
		nav.budget --;
		m.planT = 1.5;
		if ( ! findPath( game, p, gx, gz, m ) ) { m.planT = 4; return false; }
	}
	// the next waypoint; skip ahead when a later one is in plain view
	let wx = path.pts[ path.i * 2 ], wz = path.pts[ path.i * 2 + 1 ];
	if ( hyp( wx - p.x, wz - p.z ) < 0.9 ) {
		path.i ++;
		if ( path.i >= path.n ) { path.n = 0; return false; }
		wx = path.pts[ path.i * 2 ]; wz = path.pts[ path.i * 2 + 1 ];
	}
	if ( path.i + 1 < path.n ) {
		const nx = path.pts[ path.i * 2 + 2 ], nz = path.pts[ path.i * 2 + 3 ];
		const L = hyp( nx - p.x, nz - p.z );
		if ( L > 1e-3 && pathFree( game, p, ( nx - p.x ) / L, ( nz - p.z ) / L, Math.min( L, 6 ), m ) ) { path.i ++; wx = nx; wz = nz; }
	}
	const L = hyp( wx - p.x, wz - p.z ) || 1;
	m.blocked = null;
	// a door on the way sets m.blocked for the caller (the infected bash it)
	pathFree( game, p, ( wx - p.x ) / L, ( wz - p.z ) / L, Math.min( 1.4, L ), m );
	m.dir.set( ( wx - p.x ) / L, 0, ( wz - p.z ) / L );
	return true;
}

// turn towards m.dir, move at `speed` (m/s, scaled down while turning), collide and follow the ground.
// Returns the distance moved.
export function move( game, ent, m, dt, speed, turnRate, push = null ) {
	const P = game.physics, p = ent.pos;
	const want = Math.atan2( - m.dir.x, - m.dir.z );
	const diff = wrap( want - ent.yaw );
	const maxTurn = turnRate * dt;
	ent.yaw = wrap( ent.yaw + Math.max( - maxTurn, Math.min( maxTurn, diff ) ) );
	const k = Math.max( 0.15, Math.cos( Math.min( Math.abs( diff ), 1.5 ) ) );
	const fx = - Math.sin( ent.yaw ), fz = - Math.cos( ent.yaw );
	const v = speed * k;
	ent.vel.x = fx * v + ( push ? push.x : 0 );
	ent.vel.z = fz * v + ( push ? push.z : 0 );
	const ox = p.x, oz = p.z;
	p.x += ent.vel.x * dt; p.z += ent.vel.z * dt;
	if ( ! m.water ) {
		// no walking into deep water or off a cliff
		const h = game.hf.heightAt( p.x, p.z );
		if ( h < - 0.8 && h < game.hf.heightAt( ox, oz ) ) { p.x = ox; p.z = oz; }
	}
	P.resolveCylinder( p, m.r, m.h, 0.45 );
	if ( m.water ) return hyp( p.x - ox, p.z - oz );
	const g = P.ground( p.x, p.z, p.y, 0.45, m.r * 0.5 );
	if ( p.y <= g.y + 0.02 || ( m.onGround && p.y - g.y < 0.5 ) ) {
		p.y = g.y; m.vy = 0; m.onGround = true;
	} else {
		m.onGround = false;
		m.vy -= 18 * dt;
		p.y += m.vy * dt;
		if ( p.y < g.y ) { p.y = g.y; m.vy = 0; m.onGround = true; }
	}
	return hyp( p.x - ox, p.z - oz );
}

// stuck bookkeeping: call once a second with whether the mover wanted to go somewhere
export function stuckCheck( ent, m, wanted ) {
	const moved = hyp( ent.pos.x - m.lastX, ent.pos.z - m.lastZ );
	m.lastX = ent.pos.x; m.lastZ = ent.pos.z;
	if ( wanted && moved < 0.25 ) {
		m.stuckN ++;
		m.side = - m.side;
		m.detour = 1.5;
		// the plan led into something (a prop, a closed gap): drop it and plan afresh
		if ( m.stuckN > 1 ) { m.path.n = 0; m.planT = 0; }
		// a random heading shakes it loose from corners
		const a = Math.random() * Math.PI * 2;
		m.dir.set( Math.sin( a ), 0, Math.cos( a ) );
	} else if ( moved > 0.8 ) m.stuckN = Math.max( 0, m.stuckN - 1 );
	return m.stuckN;
}
