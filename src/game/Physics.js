// Static collision world: yaw-rotated boxes in a spatial hash, over the terrain height field.
// Used by the player, the infected, animals and vehicles (cylinders), and by bullets / line of sight
// (rays). Boxes are the only primitive: walls, floors, stair steps, furniture, props, tree trunks.
//
// Box: { x, y, z (centre), hx, hy, hz (half extents), yaw (radians, three.js rotation.y convention),
//        mat: 'concrete' | 'wood' | 'metal' | 'glass' | 'flesh' | 'foliage' | 'rock' | 'dirt',
//        kind: 'solid' (default) | 'glass' | 'door' | 'noclimb', owner, id }
// Local frame: local x runs along (cos yaw, -sin yaw), local z along (sin yaw, cos yaw) in world xz,
// exactly as an Object3D with rotation.y = yaw.
import * as THREE from 'three';

const CELL = 8;
const key = ( i, j ) => ( i + 32768 ) * 65536 + ( j + 32768 );

export class Physics {
	constructor( hf, ocean ) {
		this.hf = hf;
		this.ocean = ocean;
		this.cells = new Map();
		this.boxes = new Map();
		this.nextId = 1;
		this.stamp = 1;
	}

	add( b ) {
		b.id = this.nextId ++;
		b.c = Math.cos( b.yaw || 0 ); b.s = Math.sin( b.yaw || 0 );
		// world AABB (xz)
		const ex = Math.abs( b.c ) * b.hx + Math.abs( b.s ) * b.hz;
		const ez = Math.abs( b.s ) * b.hx + Math.abs( b.c ) * b.hz;
		b.minX = b.x - ex; b.maxX = b.x + ex; b.minZ = b.z - ez; b.maxZ = b.z + ez;
		b.minY = b.y - b.hy; b.maxY = b.y + b.hy;
		b.mat = b.mat || 'concrete';
		b.kind = b.kind || 'solid';
		b._stamp = 0;
		b._cells = [];
		for ( let i = Math.floor( b.minX / CELL ); i <= Math.floor( b.maxX / CELL ); i ++ ) {
			for ( let j = Math.floor( b.minZ / CELL ); j <= Math.floor( b.maxZ / CELL ); j ++ ) {
				const k = key( i, j );
				let a = this.cells.get( k );
				if ( ! a ) { a = []; this.cells.set( k, a ); }
				a.push( b );
				b._cells.push( k );
			}
		}
		this.boxes.set( b.id, b );
		return b;
	}

	remove( b ) {
		if ( ! b || ! this.boxes.has( b.id ) ) return;
		for ( const k of b._cells ) {
			const a = this.cells.get( k );
			if ( ! a ) continue;
			const i = a.indexOf( b );
			if ( i >= 0 ) a.splice( i, 1 );
			if ( ! a.length ) this.cells.delete( k );
		}
		this.boxes.delete( b.id );
	}

	// move / rotate a dynamic box (doors, vehicles)
	update( b ) {
		this.remove( b );
		const id = b.id;
		this.add( b );
		void id;
	}

	removeOwner( owner ) {
		for ( const b of [ ...this.boxes.values() ] ) if ( b.owner === owner ) this.remove( b );
	}

	// boxes whose xz AABB touches a circle
	near( x, z, r, out = [] ) {
		out.length = 0;
		const st = ++ this.stamp;
		for ( let i = Math.floor( ( x - r ) / CELL ); i <= Math.floor( ( x + r ) / CELL ); i ++ ) {
			for ( let j = Math.floor( ( z - r ) / CELL ); j <= Math.floor( ( z + r ) / CELL ); j ++ ) {
				const a = this.cells.get( key( i, j ) );
				if ( ! a ) continue;
				for ( const b of a ) {
					if ( b._stamp === st ) continue;
					b._stamp = st;
					if ( b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r ) continue;
					out.push( b );
				}
			}
		}
		return out;
	}

	// point in box footprint (xz), with a margin
	static inside( b, x, z, m = 0 ) {
		const dx = x - b.x, dz = z - b.z;
		const u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
		return Math.abs( u ) <= b.hx + m && Math.abs( v ) <= b.hz + m;
	}

	terrainHeight( x, z ) { return this.hf.heightAt( x, z ); }

	// highest walkable surface at (x, z) no higher than y + step; returns { y, box }
	ground( x, z, y, step = 0.45, r = 0 ) {
		let best = this.hf.heightAt( x, z ), box = null;
		const list = this.near( x, z, r + 0.05, _tmp );
		for ( const b of list ) {
			if ( b.maxY > y + step || b.maxY < best ) continue;
			if ( b.kind === 'noclimb' && b.maxY > y + 0.05 ) continue;
			if ( ! Physics.inside( b, x, z, r * 0.6 ) ) continue;
			best = b.maxY; box = b;
		}
		return { y: best, box };
	}

	// lowest ceiling above (x, z) starting at y
	ceiling( x, z, y, r = 0 ) {
		let best = Infinity;
		for ( const b of this.near( x, z, r, _tmp ) ) {
			if ( b.minY < y || b.minY > best ) continue;
			if ( ! Physics.inside( b, x, z, r * 0.5 ) ) continue;
			best = b.minY;
		}
		return best;
	}

	// push a vertical cylinder (feet at pos.y) out of boxes; returns true if it hit something
	resolveCylinder( pos, r, h, step = 0.45, ignore = null ) {
		let hit = false;
		for ( let it = 0; it < 3; it ++ ) {
			let moved = false;
			for ( const b of this.near( pos.x, pos.z, r, _tmp ) ) {
				if ( b === ignore || b.owner === ignore ) continue;
				if ( b.maxY <= pos.y + step || b.minY >= pos.y + h ) continue;
				const dx = pos.x - b.x, dz = pos.z - b.z;
				const u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
				const cu = Math.max( - b.hx, Math.min( b.hx, u ) ), cv = Math.max( - b.hz, Math.min( b.hz, v ) );
				let du = u - cu, dv = v - cv;
				let d = Math.hypot( du, dv );
				if ( d >= r ) continue;
				let push;
				if ( d > 1e-5 ) { push = r - d; du /= d; dv /= d; } else {
					// centre inside the box: leave by the shallowest side
					const px = b.hx - Math.abs( u ), pz = b.hz - Math.abs( v );
					if ( px < pz ) { du = Math.sign( u ) || 1; dv = 0; push = px + r; } else { du = 0; dv = Math.sign( v ) || 1; push = pz + r; }
				}
				// back to world: local x axis is (c, -s), local z axis is (s, c)
				pos.x += ( du * b.c + dv * b.s ) * push;
				pos.z += ( - du * b.s + dv * b.c ) * push;
				moved = hit = true;
			}
			if ( ! moved ) break;
		}
		return hit;
	}

	// ray against boxes; returns { t, box, normal } or null
	raycastBoxes( o, d, maxT, filter = null ) {
		let best = null, bt = maxT;
		const st = ++ this.stamp;
		const len = maxT;
		const steps = Math.ceil( len / ( CELL * 0.5 ) );
		for ( let k = 0; k <= steps; k ++ ) {
			const t = Math.min( len, k * CELL * 0.5 );
			if ( t > bt + CELL ) break;
			const x = o.x + d.x * t, z = o.z + d.z * t;
			const ci = Math.floor( x / CELL ), cj = Math.floor( z / CELL );
			for ( let a = - 1; a <= 1; a ++ ) for ( let c = - 1; c <= 1; c ++ ) {
				const list = this.cells.get( key( ci + a, cj + c ) );
				if ( ! list ) continue;
				for ( const b of list ) {
					if ( b._stamp === st ) continue;
					b._stamp = st;
					if ( filter && ! filter( b ) ) continue;
					const r = rayBox( o, d, b, bt );
					if ( r && r.t < bt ) { bt = r.t; best = { t: r.t, box: b, normal: r.n }; }
				}
			}
		}
		return best;
	}

	// ray against everything static: boxes, ground and water. Returns { t, point, normal, kind, box }
	raycast( o, d, maxT, opts = {} ) {
		let res = null;
		const hb = this.raycastBoxes( o, d, maxT, opts.filter );
		if ( hb ) res = { t: hb.t, kind: 'box', box: hb.box, normal: hb.normal, mat: hb.box.mat };
		const tt = this.hf.raycast( o.x, o.y, o.z, d.x, d.y, d.z, res ? res.t : maxT );
		if ( tt >= 0 && ( ! res || tt < res.t ) ) {
			const n = this.hf.normalAt( o.x + d.x * tt, o.z + d.z * tt, new THREE.Vector3() );
			res = { t: tt, kind: 'ground', normal: n, mat: 'dirt' };
		}
		if ( opts.water !== false && d.y < 0 && o.y > 0 ) {
			const tw = ( o.y - 0 ) / - d.y;
			if ( tw < ( res ? res.t : maxT ) ) {
				const wx = o.x + d.x * tw, wz = o.z + d.z * tw;
				if ( this.hf.heightAt( wx, wz ) < 0 ) res = { t: tw, kind: 'water', normal: new THREE.Vector3( 0, 1, 0 ), mat: 'water' };
			}
		}
		if ( res ) res.point = new THREE.Vector3( o.x + d.x * res.t, o.y + d.y * res.t, o.z + d.z * res.t );
		return res;
	}

	// clear line between two points (sight / hearing through walls)
	lineOfSight( a, b ) {
		_d.subVectors( b, a );
		const L = _d.length();
		_d.divideScalar( L );
		const hit = this.raycastBoxes( a, _d, L, x => x.kind !== 'glass' );
		if ( hit ) return false;
		const tt = this.hf.raycast( a.x, a.y, a.z, _d.x, _d.y, _d.z, L, 2 );
		return tt < 0;
	}

	waterLevel( x, z ) {
		return this.ocean ? this.ocean.heightAt( x, z ) : 0;
	}
}

const _tmp = [];
const _d = new THREE.Vector3();

// slab test in the box frame
function rayBox( o, d, b, maxT ) {
	const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
	const ou = dx * b.c - dz * b.s, ov = dx * b.s + dz * b.c;
	const du = d.x * b.c - d.z * b.s, dv = d.x * b.s + d.z * b.c;
	let t0 = 0, t1 = maxT, axis = - 1, sign = 1;
	const slab = ( oo, dd, h, ax ) => {
		if ( Math.abs( dd ) < 1e-9 ) return Math.abs( oo ) <= h;
		let a = ( - h - oo ) / dd, c = ( h - oo ) / dd;
		let sg = - 1;
		if ( a > c ) { const tmp = a; a = c; c = tmp; sg = 1; }
		if ( a > t0 ) { t0 = a; axis = ax; sign = sg; }
		if ( c < t1 ) t1 = c;
		return t0 <= t1;
	};
	if ( ! slab( ou, du, b.hx, 0 ) || ! slab( dy, d.y, b.hy, 1 ) || ! slab( ov, dv, b.hz, 2 ) ) return null;
	if ( t0 <= 0 && axis === - 1 ) return null; // started inside
	const n = new THREE.Vector3();
	if ( axis === 0 ) n.set( sign * b.c, 0, - sign * b.s );
	else if ( axis === 1 ) n.set( 0, sign, 0 );
	else n.set( sign * b.s, 0, sign * b.c );
	return { t: t0, n };
}
