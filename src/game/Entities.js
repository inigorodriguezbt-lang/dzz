// Entities: everything that moves or can be shot — the infected, animals, survivors, vehicles,
// dropped items, projectiles and corpses. The manager keeps a spatial hash (rebuilt each frame) for
// neighbour queries and bullet ray tests.
import * as THREE from 'three';

const _seen = new Set();

let NEXT_ID = 1;
const CELL = 16;

export class Entity {
	constructor( game, type ) {
		this.game = game;
		this.id = NEXT_ID ++;
		this.type = type;
		this.pos = new THREE.Vector3();
		this.vel = new THREE.Vector3();
		this.yaw = 0;
		this.radius = 0.35;
		this.height = 1.8;
		this.health = 100;
		this.maxHealth = 100;
		this.alive = true;
		this.removed = false;
		this.object = null; // THREE.Object3D in the world scene
		this.persistent = false; // saved with the world
		this.noHit = false;
	}
	update( /* dt */ ) {}
	// dir: THREE.Vector3 the hit came from (unit), zone: 'head' | 'torso' | 'arm' | 'leg' | ...
	damage( amount, info = {} ) {
		if ( ! this.alive ) return;
		this.health -= amount;
		if ( this.health <= 0 ) { this.health = 0; this.alive = false; this.die( info ); }
	}
	die() {}
	// ray (o, d unit) against this entity's hit volumes; returns { t, zone } or null
	hitTest( o, d, maxT ) {
		// default: an upright cylinder split into head / torso / legs
		const t = rayCylinder( o, d, this.pos, this.radius, this.height, maxT );
		if ( t === null ) return null;
		const y = o.y + d.y * t - this.pos.y;
		const zone = y > this.height * 0.84 ? 'head' : y > this.height * 0.45 ? 'torso' : 'leg';
		return { t, zone };
	}
	serialize() { return null; }
	dispose() {
		if ( this.object && this.object.parent ) this.object.parent.remove( this.object );
	}
}

export class EntityManager {
	constructor( game ) {
		this.game = game;
		this.list = [];
		this.byId = new Map();
		this.hash = new Map();
		this._q = [];
	}
	add( e ) {
		this.list.push( e );
		this.byId.set( e.id, e );
		if ( e.object && ! e.object.parent ) this.game.scene.add( e.object );
		return e;
	}
	remove( e ) {
		e.removed = true;
	}
	ofType( type ) { return this.list.filter( e => e.type === type && ! e.removed ); }
	count( type ) { let n = 0; for ( const e of this.list ) if ( e.type === type && ! e.removed ) n ++; return n; }

	update( dt ) {
		for ( let i = 0; i < this.list.length; i ++ ) {
			const e = this.list[ i ];
			if ( ! e.removed ) e.update( dt );
		}
		// compact removed
		let w = 0;
		for ( let i = 0; i < this.list.length; i ++ ) {
			const e = this.list[ i ];
			if ( e.removed ) { e.dispose(); this.byId.delete( e.id ); continue; }
			this.list[ w ++ ] = e;
		}
		this.list.length = w;
		// rebuild the hash
		this.hash.clear();
		for ( const e of this.list ) {
			const k = Math.floor( e.pos.x / CELL ) * 100003 + Math.floor( e.pos.z / CELL );
			let a = this.hash.get( k );
			if ( ! a ) { a = []; this.hash.set( k, a ); }
			a.push( e );
		}
	}

	// entities within r of p (optionally of a type)
	near( p, r, type = null, out = [] ) {
		out.length = 0;
		const r2 = r * r;
		for ( let i = Math.floor( ( p.x - r ) / CELL ); i <= Math.floor( ( p.x + r ) / CELL ); i ++ ) {
			for ( let j = Math.floor( ( p.z - r ) / CELL ); j <= Math.floor( ( p.z + r ) / CELL ); j ++ ) {
				const a = this.hash.get( i * 100003 + j );
				if ( ! a ) continue;
				for ( const e of a ) {
					if ( e.removed || ( type && e.type !== type ) ) continue;
					const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
					if ( dx * dx + dz * dz <= r2 ) out.push( e );
				}
			}
		}
		return out;
	}

	// bullets: nearest entity along the ray
	raycast( o, d, maxT, exclude = null ) {
		let best = null, bt = maxT;
		const steps = Math.ceil( maxT / CELL );
		// reused across calls (raycast isn't re-entrant): the AI and ballistics call it many times a frame
		const seen = _seen;
		seen.clear();
		for ( let k = 0; k <= steps; k ++ ) {
			const t = k * CELL;
			if ( t > bt + CELL ) break;
			const ci = Math.floor( ( o.x + d.x * t ) / CELL ), cj = Math.floor( ( o.z + d.z * t ) / CELL );
			for ( let a = - 1; a <= 1; a ++ ) for ( let b = - 1; b <= 1; b ++ ) {
				const list = this.hash.get( ( ci + a ) * 100003 + cj + b );
				if ( ! list ) continue;
				for ( const e of list ) {
					if ( seen.has( e ) ) continue;
					seen.add( e );
					if ( e === exclude || e.noHit || e.removed ) continue;
					const h = e.hitTest( o, d, bt );
					if ( h && h.t < bt ) { bt = h.t; best = { t: h.t, entity: e, zone: h.zone }; }
				}
			}
		}
		return best;
	}
}

// ray vs upright cylinder (base at p, radius r, height h); returns t or null
export function rayCylinder( o, d, p, r, h, maxT ) {
	const ox = o.x - p.x, oz = o.z - p.z;
	const a = d.x * d.x + d.z * d.z;
	let t0 = 0, t1 = maxT;
	if ( a > 1e-9 ) {
		const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r;
		const disc = b * b - a * c;
		if ( disc < 0 ) return null;
		const s = Math.sqrt( disc );
		t0 = Math.max( t0, ( - b - s ) / a ); t1 = Math.min( t1, ( - b + s ) / a );
	} else if ( ox * ox + oz * oz > r * r ) return null;
	// clip to the height
	if ( Math.abs( d.y ) > 1e-9 ) {
		let ya = ( p.y - o.y ) / d.y, yb = ( p.y + h - o.y ) / d.y;
		if ( ya > yb ) { const tmp = ya; ya = yb; yb = tmp; }
		t0 = Math.max( t0, ya ); t1 = Math.min( t1, yb );
	} else if ( o.y < p.y || o.y > p.y + h ) return null;
	if ( t0 > t1 || t1 < 0 ) return null;
	return Math.max( 0, t0 );
}

// ray vs sphere; returns t or null
export function raySphere( o, d, c, r, maxT ) {
	const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
	const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
	const disc = b * b - cc;
	if ( disc < 0 ) return null;
	const t = - b - Math.sqrt( disc );
	return t >= 0 && t <= maxT ? t : null;
}
