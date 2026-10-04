// Where a ladder, a rope or a hook can go: the top of a wall seen from below, the edge of a roof or a cliff seen from
// above, an anchor for a zipline. Works on game.physics (boxes over the terrain) only, so it runs in Node too.
//
//   wallTop( g, hit, maxH )        a wall hit by a ray -> { top (the lip's height), ledge (Vector3 to stand on, or null),
//                                  out (unit vector away from the wall), foot (the ground at its base) }
//   ladderSpot( g, eye, dir, L )   a ladder leant on the wall in view -> { ok, reason, bot, top, face, ledge, len }
//   edgeBelow( g, pos, dir, reach ) the edge in front of you when you stand at a drop -> { ok, reason, top, bot, face, ledge, drop }
//   hookSpot( g, eye, dir, reach ) where a thrown hook catches -> { ok, reason, edge, top, bot, face, ledge, dist }
//   anchorNear( g, pos, r )        a tree, a post or a wall to tie a strap round -> { x, z, y (strap height), box } | null
import * as THREE from 'three';
import { GRAPPLE, ZIP } from './logic.js';

const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _near = [];

// a box (or the terrain) fills the point (a window's glass counts: it's part of the wall a ladder leans on)
export function solidAt( g, x, y, z ) {
	const P = g.physics;
	if ( y < g.hf.heightAt( x, z ) - 0.05 ) return true;
	for ( const b of P.near( x, z, 0.02, _near ) ) {
		if ( y < b.minY || y > b.maxY ) continue;
		if ( b.mat === 'foliage' ) continue;
		if ( inside( b, x, z ) ) return true;
	}
	return false;
}
function inside( b, x, z ) {
	const dx = x - b.x, dz = z - b.z;
	const u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
	return Math.abs( u ) <= b.hx && Math.abs( v ) <= b.hz;
}

// nothing solid along a straight line (an awning, a balcony, a branch) between two points, ends left out; sampled
// every 8 cm (an awning is thin)
export function lineClear( g, a, b ) {
	const n = Math.ceil( a.distanceTo( b ) / 0.08 );
	for ( let i = 1; i < n; i ++ ) {
		const k = i / n;
		if ( solidAt( g, a.x + ( b.x - a.x ) * k, a.y + ( b.y - a.y ) * k, a.z + ( b.z - a.z ) * k ) ) return false;
	}
	return true;
}

// the ground you'd stand on at x, z, no higher than y + step
const standY = ( g, x, z, y, step = 0.4 ) => g.physics.ground( x, z, y, step, 0.15 ).y;

// The top of a wall: from the ray's hit, climb up just inside the face until it stops being solid. Then is there
// somewhere to stand behind the lip (a roof, a cliff top) with room for a body?
export function wallTop( g, hit, maxH, fromY = null ) {
	const n = _o.set( hit.normal.x, 0, hit.normal.z );
	if ( n.lengthSq() < 0.2 ) return null;
	n.normalize();
	const out = n.clone();
	const ix = hit.point.x - out.x * 0.12, iz = hit.point.z - out.z * 0.12;
	const footY = standY( g, hit.point.x + out.x * 0.4, hit.point.z + out.z * 0.4, ( fromY ?? hit.point.y ) + 0.3, 1.2 );
	let y = Math.max( hit.point.y, footY + 0.3 ), top = null;
	if ( ! solidAt( g, ix, y, iz ) ) y += 0.05;
	for ( ; y <= footY + maxH + 0.3; y += 0.08 ) {
		if ( ! solidAt( g, ix, y, iz ) ) { top = y; break; }
	}
	if ( top === null ) return { top: null, ledge: null, out, foot: new THREE.Vector3( hit.point.x + out.x * 0.4, footY, hit.point.z + out.z * 0.4 ) };
	// the lip's height: refine down to a centimetre or so
	let lo = top - 0.08, hi = top;
	for ( let i = 0; i < 4; i ++ ) { const m = ( lo + hi ) / 2; if ( solidAt( g, ix, m, iz ) ) lo = m; else hi = m; }
	top = hi;
	// standing room behind it (a flat roof, or one a step down behind a parapet)
	const sx = hit.point.x - out.x * 0.55, sz = hit.point.z - out.z * 0.55;
	const sy = standY( g, sx, sz, top + 0.25, 0.5 );
	const ceil = g.physics.ceiling( sx, sz, sy + 0.1, 0.2 );
	const ledge = sy > top - 1.3 && sy < top + 0.4 && ceil - sy > 1.15 ? new THREE.Vector3( sx, sy, sz ) : null;
	return { top, ledge, out, foot: new THREE.Vector3( hit.point.x + out.x * 0.4, footY, hit.point.z + out.z * 0.4 ) };
}

// a yaw that looks along -out (at the wall from outside it)
export const faceOf = ( out ) => Math.atan2( out.x, out.z );

// A ladder leant on the wall in view: its foot on the ground out from the wall, its head on the lip (and a little above
// it, so you can step off), or as high as it reaches against a taller wall.
export function ladderSpot( g, eye, dir, spec ) {
	const P = g.physics, pl = g.player;
	const hit = P.raycast( eye, dir, 3.6, { water: false } );
	if ( ! hit ) return { ok: false, reason: 'Aim at a wall' };
	if ( Math.abs( hit.normal.y ) > 0.45 ) return { ok: false, reason: 'Aim at a wall' };
	if ( Math.hypot( hit.point.x - pl.pos.x, hit.point.z - pl.pos.z ) > 3.2 ) return { ok: false, reason: 'Too far' };
	const W = wallTop( g, hit, spec.reach, pl.pos.y );
	if ( ! W ) return { ok: false, reason: 'Aim at a wall' };
	const lean = spec.lean ?? 0.26, cl = Math.cos( lean ), sl = Math.sin( lean );
	const gy = W.foot.y;
	let topY, ledge = null;
	if ( W.top !== null && W.top - gy <= spec.reach * cl + 0.02 ) {
		if ( W.top - gy < 1.6 ) return { ok: false, reason: 'Too low for a ladder' };
		topY = W.top; ledge = W.ledge;
	} else topY = gy + spec.reach * cl;
	const len = ( topY - gy ) / cl;
	// the head rests against the wall at the lip; the foot stands out from it
	const out = W.out, face = faceOf( out );
	const hx = hit.point.x + out.x * 0.08, hz = hit.point.z + out.z * 0.08;
	const bot = new THREE.Vector3( hx + out.x * len * sl, 0, hz + out.z * len * sl );
	bot.y = standY( g, bot.x, bot.z, gy + 0.4, 0.8 );
	if ( Math.abs( bot.y - gy ) > 0.5 ) return { ok: false, reason: 'Uneven ground' };
	const top = new THREE.Vector3( hx, topY, hz );
	// the foot must stand clear (no fence, no furniture), on land
	if ( P.waterLevel( bot.x, bot.z ) > bot.y + 0.2 ) return { ok: false, reason: 'In water' };
	if ( solidAt( g, bot.x, bot.y + 0.5, bot.z ) || solidAt( g, bot.x, bot.y + 1.2, bot.z ) ) return { ok: false, reason: 'Blocked' };
	// and the rungs must clear an awning or a sill on the way up
	if ( ! lineClear( g, _o.copy( bot ).setY( bot.y + 0.4 ), top.clone().addScaledVector( out, 0.12 ).setY( top.y - 0.2 ) ) ) return { ok: false, reason: 'Something in the way' };
	if ( W.top !== null && ! ledge && W.top - gy <= spec.reach * cl ) return { ok: true, bot, top, face, ledge: null, len, note: 'No room on top' };
	return { ok: true, bot, top, face, ledge, len, note: ledge ? null : 'Does not reach the top' };
}

// Standing at a drop (a roof edge, a cliff, a balcony): the lip in front of you, how far down it goes, where a rope or
// a rope ladder hangs.
export function edgeBelow( g, pos, dir, reach, minDrop = 2.2 ) {
	const P = g.physics;
	const hx = dir.x, hz = dir.z, hl = Math.hypot( hx, hz );
	if ( hl < 0.2 ) return { ok: false, reason: 'Face the edge' };
	const ux = hx / hl, uz = hz / hl;
	let lip = null;
	for ( let d = 0.25; d <= 2.6; d += 0.08 ) {
		const x = pos.x + ux * d, z = pos.z + uz * d;
		const y = standY( g, x, z, pos.y + 0.3, 0.6 );
		if ( y < pos.y - 1.2 ) { lip = d; break; }
		// a parapet or a railing in the way: over it
		if ( solidAt( g, x, pos.y + 0.5, z ) && ! solidAt( g, x, pos.y + 1.15, z ) ) continue;
		if ( solidAt( g, x, pos.y + 1.15, z ) ) return { ok: false, reason: 'Blocked' };
	}
	if ( lip === null ) return { ok: false, reason: 'Stand at an edge' };
	// the lip itself, refined
	let a = lip - 0.08, b = lip;
	for ( let i = 0; i < 4; i ++ ) { const m = ( a + b ) / 2; if ( standY( g, pos.x + ux * m, pos.z + uz * m, pos.y + 0.3, 0.6 ) < pos.y - 1.2 ) b = m; else a = m; }
	const ex = pos.x + ux * a, ez = pos.z + uz * a;
	const ey = standY( g, ex, ez, pos.y + 0.6, 1.0 );
	const out = new THREE.Vector3( ux, 0, uz );
	const bx = ex + ux * 0.32, bz = ez + uz * 0.32;
	const gy = standY( g, bx, bz, ey - 0.4, 0 );
	const water = P.waterLevel( bx, bz );
	const drop = ey - Math.max( gy, water );
	if ( drop < minDrop ) return { ok: false, reason: 'Not high enough' };
	const top = new THREE.Vector3( ex + ux * 0.04, ey + 0.02, ez + uz * 0.04 );
	const bot = new THREE.Vector3( bx, Math.max( gy, ey - reach ), bz );
	const ledge = new THREE.Vector3( ex - ux * 0.5, standY( g, ex - ux * 0.5, ez - uz * 0.5, ey + 0.3, 0.5 ), ez - uz * 0.5 );
	return { ok: true, top, bot, out, face: faceOf( out ), ledge, drop, short: drop > reach + 0.05, water: water > gy };
}

// A hook thrown at a ledge: it catches on the lip of a roof, a wall top or a cliff, within its range and the rope's
// reach. A top surface hit lands on it and slides back to the lip nearest you; a wall hit is climbed to its top.
export function hookSpot( g, eye, dir, reach ) {
	const P = g.physics, pl = g.player;
	const hit = P.raycast( eye, dir, GRAPPLE.range + 2, { water: false } );
	if ( ! hit ) return { ok: false, reason: 'Nothing to catch' };
	const dist = Math.hypot( hit.point.x - pl.pos.x, hit.point.z - pl.pos.z );
	if ( hit.t > GRAPPLE.range ) return { ok: false, reason: 'Too far' };
	let top = null, out = null, ledge = null;
	if ( hit.normal.y > 0.6 ) {
		// on a top surface: back along the way to the lip facing you
		const tx = pl.pos.x - hit.point.x, tz = pl.pos.z - hit.point.z, tl = Math.hypot( tx, tz ) || 1;
		const ux = tx / tl, uz = tz / tl;
		let lip = null;
		for ( let d = 0; d <= Math.min( 6, tl ); d += 0.08 ) {
			const y = standY( g, hit.point.x + ux * d, hit.point.z + uz * d, hit.point.y + 0.2, 0.3 );
			if ( y < hit.point.y - 0.8 ) { lip = d - 0.06; break; }
		}
		if ( lip === null ) return { ok: false, reason: 'No edge to catch' };
		out = new THREE.Vector3( ux, 0, uz );
		const ex = hit.point.x + ux * lip, ez = hit.point.z + uz * lip;
		top = new THREE.Vector3( ex + ux * 0.04, standY( g, ex, ez, hit.point.y + 0.2, 0.3 ) + 0.03, ez + uz * 0.04 );
		ledge = new THREE.Vector3( ex - ux * 0.5, standY( g, ex - ux * 0.5, ez - uz * 0.5, top.y + 0.3, 0.5 ), ez - uz * 0.5 );
		if ( g.physics.ceiling( ledge.x, ledge.z, ledge.y + 0.1, 0.2 ) - ledge.y < 1.15 ) ledge = null;
	} else if ( Math.abs( hit.normal.y ) < 0.5 ) {
		const W = wallTop( g, hit, GRAPPLE.maxRise + 1, pl.pos.y );
		if ( ! W || W.top === null ) return { ok: false, reason: 'Too high' };
		out = W.out;
		top = new THREE.Vector3( hit.point.x + out.x * 0.04, W.top + 0.03, hit.point.z + out.z * 0.04 );
		ledge = W.ledge;
	} else return { ok: false, reason: 'Nothing to catch' };
	if ( ! ledge ) return { ok: false, reason: 'Nothing to catch' };
	const rise = top.y - pl.pos.y;
	if ( rise < GRAPPLE.minRise ) return { ok: false, reason: 'Climb it' };
	if ( rise > GRAPPLE.maxRise ) return { ok: false, reason: 'Too high' };
	const bx = top.x + out.x * 0.3, bz = top.z + out.z * 0.3;
	const gy = standY( g, bx, bz, top.y - 0.6, 0 );
	if ( top.y - gy > reach + 0.05 ) return { ok: false, reason: 'Rope too short' };
	const bot = new THREE.Vector3( bx, gy, bz );
	// the rope would hang onto an awning or a balcony, out of reach: no use from down here
	if ( ! lineClear( g, _d.set( bx, gy + 0.3, bz ), _o.set( bx, top.y - 0.3, bz ) ) ) return { ok: false, reason: 'Something in the way' };
	if ( gy > pl.pos.y + 1.5 ) return { ok: false, reason: 'Out of reach' };
	return { ok: true, top, bot, out, face: faceOf( out ), ledge, dist, edge: top.clone() };
}

// a strap goes round a tree trunk, a post or a pillar within r (a wall works too, with a bolt): { x, z, y, box }
export function anchorNear( g, pos, r = 1.6 ) {
	const P = g.physics;
	let best = null, bd = r;
	for ( const b of P.near( pos.x, pos.z, r, _near ) ) {
		if ( b.kind === 'glass' || b.kind === 'door' || b.maxY < pos.y + 1.6 || b.minY > pos.y + 1.2 ) continue;
		// the nearest point of its footprint
		const dx = pos.x - b.x, dz = pos.z - b.z;
		const u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
		const cu = Math.max( - b.hx, Math.min( b.hx, u ) ), cv = Math.max( - b.hz, Math.min( b.hz, v ) );
		const d = Math.hypot( u - cu, v - cv );
		if ( d < bd ) {
			bd = d;
			const wx = b.x + cu * b.c + cv * b.s, wz = b.z - cu * b.s + cv * b.c;
			best = { x: wx, z: wz, y: Math.min( b.maxY - 0.2, pos.y + ZIP.anchorH ), box: b };
		}
	}
	return best;
}
