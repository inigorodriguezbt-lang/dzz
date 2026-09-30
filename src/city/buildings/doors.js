// Doors of the loaded interiors: leaves drawn with a few instanced meshes (one per leaf shape), hinged or
// sliding / rolling, each with a physics box that follows it. Opening, closing, locks (lockpick, pry tool,
// kicking), bashing by the infected, noise, and the state that persists in save.world.doors.
import * as THREE from 'three';
import { Geo, F_IN } from './geo.js';
import { L, hash32 } from './data.js';
import { M } from './plan.js';
import { geoToBuffer } from './materials.js';

const OPEN = 1.62; // hinged leaves open to ~93 degrees
const SPEED = 3.2; // rad / s
const HP = { int: 60, front: 140, back: 110, ext: 120, swing: 50, glass: 70, glass2: 70, glassd: 70, slider: 60, metal: 260, roll: 320, vault: 2000 };
const DOOR_PAL = [ [ 120, 74, 44 ], [ 150, 40, 36 ], [ 40, 70, 60 ], [ 236, 234, 226 ], [ 60, 70, 90 ], [ 96, 60, 36 ], [ 180, 150, 100 ] ];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3( 1, 1, 1 ), _Y = new THREE.Vector3( 0, 1, 0 ), _c = new THREE.Color();

// leaf geometry: local x from the hinge (0) to w, y 0..h, z centred on the leaf plane. Painted parts are white
// here; each door's paint comes from its instance colour (one batch per leaf shape, not per colour).
function leafGeo( kind, w, h, inside ) {
	const g = new Geo( 256 );
	const f = inside ? F_IN : 0;
	const t = kind === 'vault' ? 0.14 : kind === 'roll' ? 0.06 : kind === 'metal' ? 0.05 : 0.045;
	const glassy = kind === 'glass' || kind === 'glass2' || kind === 'glassd' || kind === 'slider';
	const handle = M( L.metal, [ 70, 70, 72 ], 1, f );
	const WHITE = [ 255, 255, 255 ];
	if ( glassy ) {
		const fr = M( L.metal, WHITE, 1, f ), fw = 0.07;
		g.box( 0, 0, - t / 2, w, 0.12, t / 2, fr ); g.box( 0, h - fw, - t / 2, w, h, t / 2, fr );
		g.box( 0, 0.12, - t / 2, fw, h - fw, t / 2, fr ); g.box( w - fw, 0.12, - t / 2, w, h - fw, t / 2, fr );
		// push bar both sides
		g.box( 0.1, 0.98, - t / 2 - 0.05, w - 0.1, 1.02, - t / 2 - 0.02, handle ); g.box( 0.1, 0.98, t / 2 + 0.02, w - 0.1, 1.02, t / 2 + 0.05, handle );
	} else if ( kind === 'roll' ) {
		g.box( 0, 0, - t / 2, w, h, t / 2, M( L.metal, WHITE, 1, f ) );
		for ( let y = 0.1; y < h; y += 0.17 ) g.box( 0, y, - t / 2 - 0.01, w, y + 0.03, t / 2 + 0.01, M( L.metal, [ 220, 220, 218 ], 1, f ) );
		g.box( 0, 0, - t / 2 - 0.02, w, 0.08, t / 2 + 0.02, M( L.plain, [ 90, 90, 90 ], 1, f ) );
	} else if ( kind === 'vault' ) {
		g.box( 0, 0, - t / 2, w, h, t / 2, M( L.metal, WHITE, 1, f ) );
		g.cyl( w * 0.5, h * 0.5, - t / 2 - 0.08, 0.25, 0.04, 12, handle );
	} else {
		const metal = kind === 'metal';
		const body = metal ? M( L.metal, WHITE, 1, f ) : M( kind === 'int' ? L.wood : L.plain, WHITE, 1, f );
		g.box( 0, 0, - t / 2, w, h, t / 2, body );
		if ( ! metal ) {
			// raised panels on both faces
			const pm = M( kind === 'int' ? L.wood : L.plain, [ 230, 230, 230 ], 1, f );
			for ( const s of [ - 1, 1 ] ) {
				const z0 = s * t / 2, z1 = s * ( t / 2 + 0.008 );
				g.box( 0.12, 0.2, Math.min( z0, z1 ), w - 0.12, h * 0.45, Math.max( z0, z1 ), pm, s > 0 ? 32 : 16 );
				g.box( 0.12, h * 0.52, Math.min( z0, z1 ), w - 0.12, h - 0.15, Math.max( z0, z1 ), pm, s > 0 ? 32 : 16 );
			}
		} else {
			g.box( 0.1, 1.0, - t / 2 - 0.05, w - 0.1, 1.04, - t / 2 - 0.02, handle );
		}
		// lever handles on both sides at the free edge
		for ( const s of [ - 1, 1 ] ) g.box( w - 0.14, 0.98, s > 0 ? t / 2 : - t / 2 - 0.06, w - 0.06, 1.02, s > 0 ? t / 2 + 0.06 : - t / 2, handle );
	}
	return { geo: geoToBuffer( g.finish( false ) ), t, glassy };
}

function paneGeo( w, h, t ) {
	const g = new THREE.BufferGeometry();
	const x0 = 0.07, x1 = w - 0.07, y0 = 0.12, y1 = h - 0.07;
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0 ], 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ], 3 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	void t;
	return g;
}

// one instanced mesh per leaf shape, grown on demand; slots are recycled
class LeafBatch {
	constructor( group, geo, mat, layer = 0, colours = false ) {
		this.group = group; this.geo = geo; this.mat = mat; this.layer = layer; this.colours = colours;
		this.cap = 0; this.free = []; this.n = 0; this.mesh = null;
		this._alloc( 16 );
	}
	_alloc( cap ) {
		const old = this.mesh;
		const m = new THREE.InstancedMesh( this.geo, this.mat, cap );
		m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		m.frustumCulled = false;
		m.castShadow = this.layer === 0; m.receiveShadow = true;
		m.layers.set( this.layer );
		if ( this.colours ) m.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( cap * 3 ).fill( 1 ), 3 );
		if ( old ) {
			m.instanceMatrix.array.set( old.instanceMatrix.array );
			if ( old.instanceColor ) m.instanceColor.array.set( old.instanceColor.array );
			this.group.remove( old ); old.dispose();
		} else for ( let i = 0; i < cap; i ++ ) m.setMatrixAt( i, _m.makeScale( 0, 0, 0 ) );
		for ( let i = this.cap; i < cap; i ++ ) { m.setMatrixAt( i, _m.makeScale( 0, 0, 0 ) ); this.free.push( i ); }
		m.count = cap;
		this.cap = cap; this.mesh = m;
		this.group.add( m );
	}
	take() { if ( ! this.free.length ) this._alloc( this.cap * 2 ); this.n ++; return this.free.pop(); }
	give( i ) { this.mesh.setMatrixAt( i, _m.makeScale( 0, 0, 0 ) ); this.mesh.instanceMatrix.needsUpdate = true; this.free.push( i ); this.n --; }
	set( i, m ) { this.mesh.setMatrixAt( i, m ); this.mesh.instanceMatrix.needsUpdate = true; }
	colour( i, c ) { if ( this.mesh.instanceColor ) { this.mesh.setColorAt( i, c ); this.mesh.instanceColor.needsUpdate = true; } }
	dispose() { this.group.remove( this.mesh ); this.mesh.dispose(); this.geo.dispose(); }
}

export class Doors {
	constructor( city ) {
		this.city = city;
		this.game = city.game;
		this.group = new THREE.Group();
		this.group.name = 'building-doors';
		this.game.scene.add( this.group );
		this.batches = new Map();
		this.list = new Set();
		this.moving = new Set();
		this.saved = {}; // key -> { o, l, b, hp } (only doors that changed)
	}

	// one batch per leaf shape (kind, size to 5 cm, inside or out); colours are per instance
	_batch( kind, w, h, inside, pane = false ) {
		const q = ( v ) => Math.round( v * 20 ) / 20;
		const k = `${kind}:${q( w )}:${q( h )}:${inside ? 1 : 0}${pane ? ':p' : ''}`;
		let b = this.batches.get( k );
		if ( ! b ) {
			const M_ = this.city.mats;
			if ( pane ) b = new LeafBatch( this.group, paneGeo( q( w ), q( h ) ), M_.glass, 1 );
			else { const L_ = leafGeo( kind, q( w ), q( h ), inside ); b = new LeafBatch( this.group, L_.geo, M_.interior, 0, true ); b.t = L_.t; b.glassy = L_.glassy; }
			this.batches.set( k, b );
		}
		return b;
	}

	// a door record from the interior job -> a live door (world space)
	add( B, si, rec ) {
		const r = B.r;
		const key = `${r.i}:${si}:d${rec.idx}`;
		const ext = rec.ext;
		const kind = rec.kind === 'ext' ? 'front' : rec.kind;
		const hsh = hash32( r.i, si * 977 + rec.idx );
		const colour = kind === 'int' ? [ 214, 190, 160 ] : kind === 'metal' ? ( ext ? [ 120, 130, 126 ] : [ 170, 172, 170 ] ) : kind === 'swing' ? [ 196, 198, 200 ]
			: kind === 'roll' ? [ 214, 214, 208 ] : kind === 'vault' ? [ 170, 172, 170 ] : kind.startsWith( 'glass' ) || kind === 'slider' ? [ 176, 178, 180 ] : DOOR_PAL[ hsh % DOOR_PAL.length ];
		_c.setRGB( colour[ 0 ] / 255, colour[ 1 ] / 255, colour[ 2 ] / 255, THREE.SRGBColorSpace );
		const leaves = kind === 'double' || kind === 'glass2' || kind === 'glassd' ? 2 : 1;
		const lw = rec.w / leaves;
		const d = {
			key, B, si, rec, kind, ext, leaves: [], w: rec.w, h: rec.h,
			locked: !! rec.locked, broken: false, open: 0, target: 0, hp: HP[ kind ] ?? 100,
			slide: kind === 'slider', roll: kind === 'roll',
			lockLevel: kind === 'vault' ? 3 : kind === 'metal' || kind === 'roll' ? 2 : 1,
			noiseT: 0,
		};
		const s = this.saved[ key ];
		if ( s ) { d.open = d.target = s.o || 0; d.locked = !! s.l; d.broken = !! s.b; if ( s.hp !== undefined ) d.hp = s.hp; }
		// the building frame
		const yawB = - r.angle;
		const toW = ( lx, lz ) => [ r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c ];
		for ( let k = 0; k < leaves; k ++ ) {
			// hinge end: for single doors rec.hinge (+1 = the +axis end); double doors hinge at both ends
			const hs = leaves === 2 ? ( k ? 1 : - 1 ) : rec.hinge;
			const lx = rec.axis === 'x' ? rec.x + hs * rec.w / 2 : rec.x, lz = rec.axis === 'z' ? rec.z + hs * rec.w / 2 : rec.z;
			const [ hx, hz ] = toW( lx, lz );
			const yc = rec.axis === 'x' ? ( hs > 0 ? Math.PI : 0 ) : ( hs > 0 ? Math.PI / 2 : - Math.PI / 2 );
			// which way it swings: towards swing * (wall normal) in building space
			const n = rec.axis === 'x' ? [ 0, 1 ] : [ 1, 0 ];
			const sx = n[ 0 ] * rec.swing, sz = n[ 1 ] * rec.swing;
			const zx = Math.sin( yc ), zz = Math.cos( yc );
			const openSign = zx * sx + zz * sz > 0 ? - 1 : 1;
			const batch = this._batch( kind, lw, rec.h, ! ext );
			const leaf = { hx, hz, y: rec.y, yaw0: yawB + yc, openSign, batch, slot: batch.take(), pane: null, box: null };
			batch.colour( leaf.slot, _c );
			if ( batch.glassy ) { leaf.paneBatch = this._batch( kind, lw, rec.h, ! ext, true ); leaf.pane = leaf.paneBatch.take(); }
			leaf.box = this.game.physics.add( { x: hx, y: rec.y + rec.h / 2, z: hz, hx: lw / 2, hy: rec.h / 2, hz: batch.t / 2 + 0.01, yaw: leaf.yaw0, mat: kind === 'metal' || kind === 'roll' || kind === 'vault' ? 'metal' : batch.glassy ? 'glass' : 'wood', kind: 'door', owner: d } );
			d.leaves.push( leaf );
		}
		d.lw = lw;
		// the API the creatures use: game.city.doorAt( pos ).bash( amount, { source, kind } )
		d.bash = ( amount, info = null ) => this.bash( d, amount, info );
		d.pos = this._centre( d );
		Object.defineProperty( d, 'isOpen', { get: () => d.target > 0.5 } );
		this._pose( d );
		this.list.add( d );
		return d;
	}

	// defer: an array to hand the leaves' colliders to (removed later, time-sliced) instead of removing them now
	remove( d, defer = null ) {
		for ( const l of d.leaves ) {
			l.batch.give( l.slot );
			if ( l.paneBatch ) l.paneBatch.give( l.pane );
			if ( defer ) defer.push( l.box ); else this.game.physics.remove( l.box );
		}
		this.list.delete( d );
		this.moving.delete( d );
	}

	// place leaves and boxes for the current opening amount
	_pose( d ) {
		const a = d.open;
		for ( const l of d.leaves ) {
			let yaw = l.yaw0, px = l.hx, pz = l.hz, sy = 1, py = l.y;
			const dx = Math.cos( l.yaw0 ), dz = - Math.sin( l.yaw0 ); // leaf direction (hinge -> free edge)
			if ( d.slide ) {
				// slides behind the wall on its hinge side
				px -= dx * d.lw * 0.92 * a; pz -= dz * d.lw * 0.92 * a;
			} else if ( d.roll ) {
				sy = Math.max( 0.06, 1 - a ); py = l.y + d.h * ( 1 - sy );
			} else yaw = l.yaw0 + l.openSign * OPEN * a;
			_q.setFromAxisAngle( _Y, yaw );
			_p.set( px, py, pz );
			_s.set( 1, sy, 1 );
			_m.compose( _p, _q, _s );
			l.batch.set( l.slot, _m );
			if ( l.paneBatch ) l.paneBatch.set( l.pane, _m );
			// the box follows the leaf (centre half way along it)
			const cx = Math.cos( yaw ), cz = - Math.sin( yaw );
			const b = l.box;
			b.x = px + cx * d.lw / 2; b.z = pz + cz * d.lw / 2; b.yaw = yaw;
			b.hy = d.h * sy / 2; b.y = py + b.hy;
			this.game.physics.update( b );
		}
	}

	update( dt ) {
		for ( const d of this.moving ) {
			const dir = Math.sign( d.target - d.open );
			if ( ! dir ) { this.moving.delete( d ); continue; }
			d.open = THREE.MathUtils.clamp( d.open + dir * dt * SPEED / ( d.roll ? 2.5 : d.slide ? 1.2 : OPEN ), Math.min( d.open, d.target ), Math.max( d.open, d.target ) );
			if ( Math.abs( d.open - d.target ) < 1e-4 ) { d.open = d.target; this.moving.delete( d ); if ( d.target === 0 ) this._sound( d, 'door_close' ); }
			this._pose( d );
		}
	}

	_centre( d, out = new THREE.Vector3() ) {
		const l = d.leaves[ 0 ];
		if ( d.leaves.length === 2 ) return out.set( ( d.leaves[ 0 ].hx + d.leaves[ 1 ].hx ) / 2, l.y + 1.1, ( d.leaves[ 0 ].hz + d.leaves[ 1 ].hz ) / 2 );
		return out.set( l.hx + Math.cos( l.yaw0 ) * d.lw / 2, l.y + 1.1, l.hz - Math.sin( l.yaw0 ) * d.lw / 2 );
	}

	_sound( d, name, vol = 0.7 ) { this.game.audio?.play( name, { pos: this._centre( d ), vol } ); }
	_noise( d, radius ) { this.game.events.emit( 'noise', { pos: this._centre( d ), radius, source: this.game.player, kind: 'door' } ); }
	_save( d ) { this.saved[ d.key ] = { o: d.target, l: d.locked ? 1 : 0, b: d.broken ? 1 : 0, hp: Math.round( d.hp ) }; }

	toggle( d ) {
		if ( d.broken ) return;
		if ( d.locked ) { this._sound( d, 'door_locked', 0.6 ); this.game.toast( 'Locked', 'warn' ); return; }
		d.target = d.target > 0.5 ? 0 : 1;
		if ( d.target === 1 ) this._sound( d, 'door_open' );
		this.moving.add( d );
		this._noise( d, d.kind === 'roll' ? 16 : 7 );
		this._save( d );
	}

	unlock( d ) { d.locked = false; this._sound( d, 'door_open', 0.4 ); this._save( d ); }

	// damage from kicks or the infected; the door gives way at 0. The infected make their own thuds and noise.
	// info: { source, kind } (the creatures), or the source itself (the player's kicks)
	bash( d, amount, info = null ) {
		if ( d.broken || ( d.target > 0.5 && ! d.locked ) ) return false;
		const source = info && info.source !== undefined ? info.source : info;
		const player = source === this.game.player;
		d.hp -= amount;
		if ( player ) {
			this._sound( d, d.kind === 'metal' || d.kind === 'roll' || d.kind === 'vault' ? 'hit_metal' : 'hit_wood', 0.8 );
			this.game.events.emit( 'noise', { pos: this._centre( d ), radius: 26, source, kind: 'door' } );
		}
		if ( d.hp <= 0 ) {
			d.broken = true; d.locked = false; d.target = 1;
			this.moving.add( d );
			this._sound( d, 'door_break', 1 );
			this.game.events.emit( 'noise', { pos: this._centre( d ), radius: 40, source: source || null, kind: 'door' } );
		}
		this._save( d );
		return true;
	}

	// the nearest closed door within r of pos (the infected break through them)
	near( pos, r = 1.5 ) {
		let best = null, bd = r * r;
		const c = new THREE.Vector3();
		for ( const d of this.list ) {
			if ( d.broken || d.target > 0.5 ) continue;
			this._centre( d, c );
			const dd = ( c.x - pos.x ) ** 2 + ( c.z - pos.z ) ** 2;
			if ( dd < bd && Math.abs( c.y - 1.1 - pos.y ) < 2.5 ) { bd = dd; best = d; }
		}
		return best;
	}

	// interaction candidates: a ray against the leaves' boxes
	provide( ray, maxDist, out ) {
		const g = this.game;
		const P = g.physics;
		// the first box along the view: a wall in front hides the door behind it
		const hit = P.raycastBoxes( ray.origin, ray.dir, maxDist );
		if ( ! hit || hit.box.kind !== 'door' ) return;
		const d = hit.box.owner;
		if ( ! d || ! this.list.has( d ) || d.broken ) return;
		const inv = g.player.inventory;
		const base = { t: hit.t, id: 'door:' + d.key, ownerBox: hit.box, owner: d, noOcclusion: true };
		if ( ! d.locked ) {
			out.push( { ...base, label: d.target > 0.5 ? 'Close' : 'Open', action: () => this.toggle( d ) } );
			return;
		}
		const pick = inv.count?.( 'lockpick' ) > 0 && d.lockLevel < 3;
		const pry = this.city.hasPry() && d.lockLevel < 3;
		if ( d.kind === 'vault' && ! pry ) { out.push( { ...base, label: 'Open', sub: 'Locked', action: () => { this._sound( d, 'door_locked', 0.6 ); this.game.toast( 'Needs a crowbar', 'warn' ); } } ); return; }
		if ( pick ) {
			out.push( { ...base, label: 'Pick lock', sub: 'Locked', action: () => this.pickLock( d ) } );
		} else if ( pry ) {
			out.push( { ...base, label: 'Pry open', sub: 'Locked', action: () => this.pry( d ) } );
		} else {
			out.push( { ...base, label: 'Kick', sub: 'Locked', action: () => this.kick( d ) } );
		}
	}

	pickLock( d ) {
		const g = this.game;
		const t = 5 + d.lockLevel * 3;
		g.actions.start( {
			label: 'Picking lock', time: t, sound: null,
			onDone: () => {
				// a pick can snap on a stubborn lock
				if ( Math.random() < 0.12 * d.lockLevel ) { g.player.inventory.consume?.( 'lockpick', 1 ); g.player.inventory.changed?.(); g.toast( 'Lockpick broke', 'warn' ); return; }
				this.unlock( d ); g.toast( 'Unlocked', 'good' );
			},
		} );
	}

	pry( d ) {
		const g = this.game;
		g.actions.start( {
			label: 'Prying', time: 3 + d.lockLevel * 2.5,
			onDone: () => {
				g.survival?.useStamina?.( 15 );
				this._noise( d, 18 );
				d.hp = Math.min( d.hp, HP[ d.kind ] * 0.5 );
				this.unlock( d );
				this._sound( d, 'hit_wood', 0.9 );
				g.toast( 'Pried open', 'good' );
			},
		} );
	}

	kick( d ) {
		const g = this.game;
		if ( g.survival && g.survival.stamina < 12 ) { g.toast( 'Too tired', 'warn' ); return; }
		g.survival?.useStamina?.( 12 );
		g.player.shake = Math.max( g.player.shake || 0, 0.25 );
		const dmg = 18 + Math.random() * 14;
		this.bash( d, d.kind === 'metal' || d.kind === 'roll' ? dmg * 0.35 : dmg, g.player );
		if ( d.broken ) g.toast( 'Door broken', 'good' );
	}

	serialize() { return this.saved; }
	load( s ) { this.saved = s || {}; }

	dispose() {
		for ( const d of [ ...this.list ] ) this.remove( d );
		for ( const b of this.batches.values() ) b.dispose();
		this.game.scene.remove( this.group );
	}
}
