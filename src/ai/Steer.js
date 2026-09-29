// Ground movement shared by the infected, survivors and land animals: steering towards a goal around
// walls (short probes, a sticky detour side = wall following), separation from neighbours, keeping out of
// deep water and off cliffs, stuck detection, and the move itself (collide with the physics boxes, follow
// the ground, fall).
import * as THREE from 'three';

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
export function steer( game, ent, m, gx, gz, dt, neighbours = null ) {
	const p = ent.pos;
	let dx = gx - p.x, dz = gz - p.z;
	const dist = Math.hypot( dx, dz );
	if ( dist < 1e-3 ) return 0;
	dx /= dist; dz /= dist;
	const probe = Math.min( 1.6, dist );
	m.blocked = null;
	let ox = dx, oz = dz;
	m.detour = Math.max( 0, m.detour - dt );
	if ( m.detour <= 0 && pathFree( game, p, dx, dz, probe, m ) ) {
		// straight on
	} else {
		// around the obstacle: keep to the side we chose (wall following), else the side closer to the goal
		let found = false;
		const a0 = Math.atan2( dx, dz );
		for ( const a of PROBE_ANGLES ) {
			for ( const s of [ m.side, - m.side ] ) {
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
	// separation from neighbours
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
		ox += sx * 1.5; oz += sz * 1.5;
		const l = Math.hypot( ox, oz ) || 1;
		ox /= l; oz /= l;
	}
	m.dir.set( ox, 0, oz );
	return dist;
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
	if ( m.water ) return Math.hypot( p.x - ox, p.z - oz );
	const g = P.ground( p.x, p.z, p.y, 0.45, m.r * 0.5 );
	if ( p.y <= g.y + 0.02 || ( m.onGround && p.y - g.y < 0.5 ) ) {
		p.y = g.y; m.vy = 0; m.onGround = true;
	} else {
		m.onGround = false;
		m.vy -= 18 * dt;
		p.y += m.vy * dt;
		if ( p.y < g.y ) { p.y = g.y; m.vy = 0; m.onGround = true; }
	}
	return Math.hypot( p.x - ox, p.z - oz );
}

// stuck bookkeeping: call once a second with whether the mover wanted to go somewhere
export function stuckCheck( ent, m, wanted ) {
	const moved = Math.hypot( ent.pos.x - m.lastX, ent.pos.z - m.lastZ );
	m.lastX = ent.pos.x; m.lastZ = ent.pos.z;
	if ( wanted && moved < 0.25 ) {
		m.stuckN ++;
		m.side = - m.side;
		m.detour = 1.5;
		// a random heading shakes it loose from corners
		const a = Math.random() * Math.PI * 2;
		m.dir.set( Math.sin( a ), 0, Math.cos( a ) );
	} else if ( moved > 0.8 ) m.stuckN = Math.max( 0, m.stuckN - 1 );
	return m.stuckN;
}
