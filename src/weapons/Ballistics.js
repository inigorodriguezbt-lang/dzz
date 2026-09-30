// Projectiles with travel time, gravity and drag. Each frame every live round sweeps the segment it flies
// through against the entities (the infected, animals, survivors, vehicles), the player (rounds fired by
// others) and the static world (boxes, terrain, water). Thin wood, glass and foliage are shot through, hard
// surfaces at grazing angles can ricochet, and rifle rounds over-penetrate bodies.
//
//   game.ballistics.fire( origin, dir, { damage, velocity, pellets, spread, source, weapon, ammo, gravity, visual } )
//   game.ballistics.npcShot( source, weaponId, origin, dir, { spread } )   sound + flash + noise + the shot, for NPC shooters
//   game.ballistics.explode( pos, { radius, damage, source, weapon, noise } )   blast damage with line of sight
//   hitEntity( game, entity, amount, info )  shared damage path (events: 'damage', 'kill', 'hitmarker')
import * as THREE from 'three';
import { getItem, makeStack } from '../game/items/ItemDB.js';
import { rayCylinder } from '../game/Entities.js';
import { patchMaterial } from '../render/Materials.js';
import { ammoIdsFor } from './ops.js';

// damage multipliers by hit zone (entity.hitTest names; unknown zones count as torso)
export const ZONE = { head: 4, neck: 2.5, chest: 1.1, torso: 1, stomach: 1, pelvis: 1, arm: 0.6, hand: 0.5, leg: 0.6, foot: 0.5, limb: 0.6 };
const LIVING = new Set( [ 'zombie', 'animal', 'npc' ] );
const G = 9.81;
const MAX_T = 4; // s a round lives
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _seg = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const rnd = Math.random;

// the one place damage is dealt to entities by the weapons module: fires the events the HUD and stats need
export function hitEntity( game, e, amount, info = {} ) {
	if ( ! e || ! e.alive || typeof e.damage !== 'function' ) return false;
	e.damage( amount, info );
	const killed = ! e.alive;
	game.events.emit( 'damage', { target: e, amount, source: info.source, zone: info.zone, kind: info.kind } );
	if ( killed ) game.events.emit( 'kill', { target: e, source: info.source, weapon: info.weapon } );
	// burning ground ticks several times a second: only its kills get a marker
	if ( info.source === game.player && ( LIVING.has( e.type ) || killed ) && ( info.kind !== 'fire' || killed ) ) game.events.emit( 'hitmarker', { kill: killed, headshot: info.zone === 'head' } );
	return killed;
}

// a point in a random cone around dir (radians, roughly gaussian)
export function coneDir( dir, spread, out = new THREE.Vector3() ) {
	out.copy( dir );
	if ( spread <= 0 ) return out;
	const a = rnd() * Math.PI * 2, r = spread * Math.sqrt( - 2 * Math.log( Math.max( 1e-6, rnd() ) ) ) * 0.5;
	// two axes perpendicular to dir
	const up = Math.abs( dir.y ) < 0.95 ? _n.set( 0, 1, 0 ) : _n.set( 1, 0, 0 );
	const u = _v2.crossVectors( dir, up ).normalize();
	const w = up.crossVectors( u, dir ).normalize();
	return out.addScaledVector( u, Math.cos( a ) * r ).addScaledVector( w, Math.sin( a ) * r ).normalize();
}

// exit distance of a ray inside a yaw-rotated physics box (the far slab), or null
function rayBoxExit( o, d, b ) {
	const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
	const ou = dx * b.c - dz * b.s, ov = dx * b.s + dz * b.c;
	const du = d.x * b.c - d.z * b.s, dv = d.x * b.s + d.z * b.c;
	let t1 = Infinity;
	for ( const [ oo, dd, h ] of [ [ ou, du, b.hx ], [ dy, d.y, b.hy ], [ ov, dv, b.hz ] ] ) {
		if ( Math.abs( dd ) < 1e-9 ) { if ( Math.abs( oo ) > h ) return null; continue; }
		const a = ( - h - oo ) / dd, c = ( h - oo ) / dd;
		t1 = Math.min( t1, Math.max( a, c ) );
	}
	return t1 === Infinity ? null : Math.max( 0, t1 );
}

export class Ballistics {
	constructor( game ) {
		this.game = game;
		this.list = [];
		this.arrows = []; // stuck, recoverable arrows
		this.flares = []; // burning signal flares on the ground
		this._arrowGeo = null;
		this.shots = 0;
		if ( game.interact ) this._unProvide = game.interact.addProvider( ( ray ) => this._arrowProvider( ray ) );
	}

	get fx() { return this.game.fx; }

	// fire one shot (all its pellets). opts: { damage, velocity, pellets, spread, pelletSpread, source, weapon (def or id), ammo (def or id),
	// gravity (true / false / m/s²), visual (Vector3 muzzle point for tracers), tracer, range, pen, drag }
	fire( origin, dir, opts = {} ) {
		const wdef = typeof opts.weapon === 'string' ? getItem( opts.weapon ) : opts.weapon || null;
		const f = wdef?.firearm || {};
		let adef = typeof opts.ammo === 'string' ? getItem( opts.ammo ) : opts.ammo || null;
		if ( ! adef && f.caliber ) adef = getItem( ammoIdsFor( f.caliber )[ 0 ] );
		const a = adef?.ammo || {};
		const pellets = opts.pellets ?? a.pellets ?? f.pellets ?? 1;
		const damage = ( opts.damage ?? f.damage ?? 30 ) * ( opts.damage == null ? ( a.damage ?? 1 ) : 1 );
		const velocity = opts.velocity ?? f.velocity ?? 400;
		const spread = opts.spread ?? 0;
		const pSpread = pellets > 1 ? ( opts.pelletSpread ?? f.pelletSpread ?? 0.04 ) : 0;
		const kind = f.caliber === 'arrow' ? 'arrow' : f.caliber === 'bolt' ? 'bolt' : f.caliber === 'flare' ? 'flare' : pellets > 1 ? 'pellet' : 'bullet';
		const grav = opts.gravity === false ? 0 : typeof opts.gravity === 'number' ? opts.gravity : G;
		const player = opts.source === this.game.player;
		const base = coneDir( dir, spread, new THREE.Vector3() );
		const out = [];
		for ( let i = 0; i < pellets; i ++ ) {
			const d = pellets > 1 ? coneDir( base, pSpread, new THREE.Vector3() ) : base.clone();
			const p = {
				pos: origin.clone(), vel: d.multiplyScalar( velocity * ( pellets > 1 ? 0.92 + rnd() * 0.16 : 1 ) ), v0: velocity,
				dmg: damage, source: opts.source ?? null, srcEntity: opts.source?.isEntity || opts.source?.type ? opts.source : null,
				weapon: wdef?.id ?? opts.weapon ?? null, kind, grav, drag: opts.drag ?? a.drag ?? 0.3, pen: opts.pen ?? a.pen ?? 0.1, concrete: 0,
				range: opts.range ?? f.range ?? 100, dist: 0, t: 0, player, whiz: false, exclude: null, ricochets: 0,
				tracer: opts.tracer ?? ( a.tracer ? 1 : 0 ), visOff: opts.visual ? opts.visual.clone().sub( origin ) : null, mesh: null, ammo: adef?.id || null,
			};
			if ( f.caliber === '.50bmg' ) p.concrete = 0.35;
			if ( p.srcEntity === this.game.player ) p.srcEntity = null;
			if ( kind === 'arrow' || kind === 'bolt' ) p.mesh = this._arrowMesh( kind );
			if ( kind === 'flare' ) p.tracer = 2;
			this.list.push( p );
			out.push( p );
		}
		this.shots ++;
		return out;
	}

	// an NPC (bandit, soldier) fires a weapon by id: the report, the flash, the noise and the round
	npcShot( source, weaponId, origin, dir, o = {} ) {
		const def = getItem( weaponId );
		if ( ! def?.firearm ) return null;
		const f = def.firearm, g = this.game;
		const supp = !! o.suppressed;
		g.audio?.play( supp ? ( f.cls === 'pistol' || f.cls === 'smg' ? 'gun_supp_pistol' : 'gun_supp' ) : f.sound, { pos: origin, vol: 1, rate: f.pitch || 1, max: Math.max( 200, f.noise * ( supp ? 0.8 : 3 ) ), ref: 10, detune: 0.05 } );
		g.fx?.muzzle( _v.copy( origin ).addScaledVector( dir, 0.5 ), dir, { scale: f.cls === 'pistol' ? 0.6 : f.cls === 'shotgun' ? 1.3 : 1, suppressed: supp } );
		g.events.emit( 'noise', { pos: origin.clone(), radius: f.noise * ( supp ? 0.3 : 1 ), source, kind: 'gunshot' } );
		return this.fire( origin, dir, { weapon: def, source, spread: o.spread ?? ( f.spread + f.hip * 0.5 ), visual: o.visual } );
	}

	update( dt ) {
		const g = this.game;
		const listener = g.camera.position;
		for ( let k = this.list.length - 1; k >= 0; k -- ) {
			const p = this.list[ k ];
			if ( ! this._step( p, dt, listener ) ) {
				if ( p.mesh && ! p.stuck ) { p.mesh.parent?.remove( p.mesh ); }
				this.list.splice( k, 1 );
			}
		}
		this._updateFlares( dt );
	}

	// advance one projectile; false when it's done
	_step( p, dt, listener ) {
		const g = this.game;
		p.t += dt;
		if ( p.t > MAX_T || p.dist > Math.max( 1500, p.range * 6 ) || p.pos.y < - 60 ) return false;
		// drag and gravity over the frame
		p.vel.multiplyScalar( Math.max( 0, 1 - p.drag * dt ) );
		const speed0 = p.vel.length();
		if ( speed0 < 20 && p.kind !== 'arrow' && p.kind !== 'bolt' && p.kind !== 'flare' ) return false;
		_seg.copy( p.vel ).multiplyScalar( dt );
		_seg.y -= 0.5 * p.grav * dt * dt;
		p.vel.y -= p.grav * dt;
		let L = _seg.length();
		if ( L < 1e-6 ) return false;
		_d.copy( _seg ).divideScalar( L );
		const from = _v.copy( p.pos );
		// the nearest thing along the segment
		let best = null;
		const eh = g.entities.raycast( from, _d, L, p.exclude || p.srcEntity );
		if ( eh && ! ( p.hitSet && p.hitSet.has( eh.entity ) ) ) best = { t: eh.t, entity: eh.entity, zone: eh.zone };
		const sh = g.physics.raycast( from, _d, best ? best.t : L );
		if ( sh && ( ! best || sh.t < best.t ) ) best = { t: sh.t, stat: sh };
		if ( ! p.player && g.player && ! g.player.vehicle && g.player.alive !== false && ! g.dead ) {
			const P = g.player;
			const tp = rayCylinder( from, _d, P.pos, 0.32, P.height, best ? best.t : L );
			if ( tp !== null ) best = { t: tp, playerHit: true };
		}
		// supersonic crack / whiz for rounds passing the listener (not your own)
		if ( ! p.player && ! p.whiz ) {
			_v2.copy( listener ).sub( from );
			const s = Math.max( 0, Math.min( best ? best.t : L, _v2.dot( _d ) ) );
			const cx = from.x + _d.x * s - listener.x, cy = from.y + _d.y * s - listener.y, cz = from.z + _d.z * s - listener.z;
			const miss = Math.sqrt( cx * cx + cy * cy + cz * cz );
			if ( miss < 4 && s > 0.5 ) {
				p.whiz = true;
				const at = new THREE.Vector3( from.x + _d.x * s, from.y + _d.y * s, from.z + _d.z * s );
				const sup = speed0 > 360;
				g.audio?.play( sup ? 'crack' : 'whiz', { pos: at, vol: ( sup ? 0.9 : 0.7 ) * ( 1 - miss / 5 ), max: 20, delay: false } );
				if ( sup ) g.audio?.play( 'whiz', { pos: at, vol: 0.5, rate: 1.3, max: 20, delay: false } );
			}
		}
		this._draw( p, from, best ? best.t : L );
		if ( ! best ) {
			p.pos.add( _seg );
			p.dist += L;
			if ( p.mesh ) this._orientArrow( p );
			return true;
		}
		// hit
		const hitPoint = new THREE.Vector3().copy( from ).addScaledVector( _d, best.t );
		p.dist += best.t;
		const falloff = p.dist <= p.range ? 1 : Math.max( 0.3, 1 - ( p.dist - p.range ) / ( p.range * 2 ) );
		const velK = p.kind === 'pellet' || p.kind === 'arrow' || p.kind === 'bolt' ? Math.min( 1, Math.pow( speed0 / p.v0, 1.5 ) + 0.15 ) : 1;
		const dmg = p.dmg * falloff * velK;
		if ( best.playerHit ) return this._hitPlayer( p, hitPoint, dmg );
		if ( best.entity ) return this._hitEntity( p, best.entity, best.zone, hitPoint, dmg, L - best.t );
		return this._hitStatic( p, best.stat, hitPoint, dmg, L - best.t );
	}

	// faint streaks for every round (weight and direction feedback) and bright tracers
	_draw( p, from, len ) {
		const fx = this.fx;
		if ( ! fx || p.mesh ) return;
		const head = _v2.copy( from ).addScaledVector( _d, len );
		const tail = _n.copy( from ).addScaledVector( _d, Math.max( 0, len - Math.min( 14, 0.6 + p.dist * 0.5 ) ) );
		if ( p.visOff ) {
			// start at the muzzle on screen and converge on the true line of fire over ~12 m
			const k1 = Math.max( 0, 1 - p.dist / 12 ), k0 = Math.max( 0, 1 - ( p.dist - len ) / 12 );
			tail.addScaledVector( p.visOff, Math.min( 1, k0 ) );
			head.addScaledVector( p.visOff, k1 );
		}
		if ( p.tracer === 2 ) fx.beam( tail, head, 0xff3a20, 0.05, 1, 8 );
		else if ( p.tracer ) fx.beam( tail, head, 0xff7a3a, 0.02, 1, 7 );
		else if ( p.kind !== 'pellet' || rnd() < 0.35 ) fx.beam( tail, head, 0xffd8a0, 0.0045, p.player ? 0.22 : 0.32, 1.6 );
	}

	_hitPlayer( p, point, dmg ) {
		const g = this.game, P = g.player;
		const rel = ( point.y - P.pos.y ) / P.height;
		const zone = rel > 0.85 ? 'head' : rel > 0.45 ? 'torso' : 'leg';
		const mult = zone === 'head' ? 1 : zone === 'leg' ? 0.6 : 1; // Survival.hurt applies its own head multiplier
		g.survival?.hurt( dmg * mult, 'bullet', { dir: _d.clone(), zone, cause: 'a gunshot', source: p.source } );
		g.audio?.play( 'hit_flesh', { vol: 0.8 } );
		g.fx?.blood( point, _d, 0.5 );
		return false;
	}

	_hitEntity( p, e, zone, point, dmg, rest ) {
		const g = this.game;
		const living = LIVING.has( e.type );
		const mult = ZONE[ zone ] ?? 1;
		hitEntity( g, e, dmg * mult, { source: p.source, zone: zone || 'torso', dir: _d.clone(), kind: p.kind === 'arrow' || p.kind === 'bolt' ? 'arrow' : 'bullet', weapon: p.weapon, point } );
		if ( p.kind === 'flare' ) { e.ignite?.( 6 ); }
		if ( living ) {
			g.fx?.blood( point, _d, Math.min( 2, dmg * mult / 35 ) );
			if ( p.player ) {
				g.audio?.play( zone === 'head' ? 'headshot' : 'hit_flesh', { pos: point, vol: zone === 'head' ? 0.9 : 0.6, max: 60 } );
			} else g.audio?.play( 'hit_flesh', { pos: point, vol: 0.5, max: 40 } );
		} else {
			// no decal: a world-space mark would hang in the air once the vehicle drives off
			g.fx?.impact( point, _v2.copy( _d ).negate(), e.type === 'vehicle' ? 'metal' : 'wood', { size: Math.min( 1.5, dmg / 40 ), dir: _d, decal: false } );
		}
		// arrows stop in the body; some can be pulled out of the carcass later
		if ( p.kind === 'arrow' || p.kind === 'bolt' ) {
			if ( p.mesh ) p.mesh.parent?.remove( p.mesh );
			if ( rnd() < 0.5 && g.items3d?.spawn ) {
				const st = makeStack( p.kind === 'arrow' ? 'arrow' : 'crossbow_bolt', 1 );
				if ( st ) try { g.items3d.spawn( st, e.pos.clone().add( _v2.set( rnd() - 0.5, 0.05, rnd() - 0.5 ) ), { persistent: true } ); } catch ( err ) { /* items module absent */ }
			}
			return false;
		}
		// full-power rounds carry on through a body at reduced damage
		if ( living && p.kind === 'bullet' && p.pen >= 0.2 ) {
			p.hitSet ||= new Set();
			p.hitSet.add( e );
			p.exclude = e;
			p.dmg *= 0.45; p.pen *= 0.5;
			p.pos.copy( point ).addScaledVector( _d, 0.05 );
			return p.dmg > 5;
		}
		return false;
	}

	_hitStatic( p, s, point, dmg, rest ) {
		const g = this.game;
		let mat = s.mat || 'concrete';
		if ( s.kind === 'ground' ) mat = this._groundMat( point );
		const n = s.normal;
		const isBox = s.kind === 'box';
		// door leaves swing open: marks on them would be left behind in world space
		const moving = isBox && ( s.box.kind === 'door' || s.box.dynamic || s.box.owner?.type === 'vehicle' );
		if ( s.kind === 'water' ) {
			g.fx?.impact( point, n, 'water', { size: p.kind === 'pellet' ? 0.3 : 1 } );
			return false;
		}
		const size = p.kind === 'pellet' ? 0.35 : Math.min( 2, 0.5 + dmg / 60 );
		// arrows stick in soft things, break or drop on hard ones
		if ( p.kind === 'arrow' || p.kind === 'bolt' ) {
			g.audio?.play( mat === 'metal' || mat === 'concrete' || mat === 'rock' ? 'hit_concrete' : 'arrow_hit', { pos: point, vol: 0.6, max: 40 } );
			if ( mat === 'wood' || mat === 'dirt' || mat === 'sand' || mat === 'foliage' ) this._stickArrow( p, point );
			else if ( rnd() < 0.5 ) { point.addScaledVector( n, 0.05 ); p.vel.set( 0, - 1, 0 ); this._stickArrow( p, _v2.set( point.x, g.physics.ground( point.x, point.z, point.y ).y + 0.02, point.z ), true ); }
			else if ( p.mesh ) p.mesh.parent?.remove( p.mesh );
			return false;
		}
		if ( p.kind === 'flare' ) { this._landFlare( point, n ); return false; }
		// bullets: shoot through thin wood, glass, foliage (and thin sheet metal / walls for .50)
		if ( isBox && p.pen > 0 ) {
			const box = s.box;
			const glass = mat === 'glass' || box.kind === 'glass';
			const exitT = rayBoxExit( _v2.copy( point ).addScaledVector( _d, 0.002 ), _d, box );
			if ( exitT !== null ) {
				const thick = exitT + 0.002;
				let cap = mat === 'wood' ? p.pen : mat === 'foliage' ? p.pen * 8 : mat === 'metal' ? p.pen * 0.04 : mat === 'concrete' || mat === 'rock' ? p.concrete : 0;
				if ( glass ) cap = 10;
				if ( thick <= cap ) {
					g.fx?.impact( point, n, glass ? 'glass' : mat, { size, dir: _d, sound: p.player || ! glass, decal: moving ? false : undefined } );
					if ( glass ) g.events.emit( 'noise', { pos: point.clone(), radius: 25, source: p.source, kind: 'glass' } );
					box.onHit?.( { point, dir: _d.clone(), damage: dmg, kind: 'bullet', source: p.source } );
					const exit = point.clone().addScaledVector( _d, thick + 0.01 );
					if ( ! glass && mat !== 'foliage' ) g.fx?.impact( exit, _d, mat, { size: size * 0.6, dir: _d, sound: false, decal: moving ? false : undefined } );
					const lose = glass ? 0.12 : mat === 'foliage' ? 0.05 : 0.2 + 0.6 * thick / Math.max( cap, 1e-3 );
					p.dmg *= 1 - lose;
					if ( ! glass && mat !== 'foliage' ) p.pen -= thick;
					p.vel.multiplyScalar( 1 - lose * 0.5 );
					p.pos.copy( exit );
					return p.dmg > 3;
				}
			}
		}
		// hard surfaces at grazing angles: ricochet
		const cosI = - _d.dot( n );
		if ( ( mat === 'metal' || mat === 'concrete' || mat === 'rock' || ( s.kind === 'ground' && mat !== 'sand' ) ) && cosI < 0.26 && p.ricochets < 2 && rnd() < ( p.kind === 'pellet' ? 0.25 : 0.5 ) ) {
			g.fx?.impact( point, n, mat, { size: size * 0.5, dir: _d, decal: false, sound: false } );
			g.fx?.sparks( point, _v2.copy( _d ).addScaledVector( n, 2 * cosI ), 4 );
			if ( p.kind !== 'pellet' || rnd() < 0.3 ) g.audio?.play( 'ricochet', { pos: point, vol: 0.6, rate: 0.8 + rnd() * 0.5, max: 80 } );
			p.vel.reflect( n ).multiplyScalar( 0.5 );
			p.dmg *= 0.35;
			p.ricochets ++;
			p.pos.copy( point ).addScaledVector( n, 0.01 );
			return true;
		}
		g.fx?.impact( point, n, mat, { size, dir: _d, sound: p.kind !== 'pellet' || rnd() < 0.3, decal: moving ? false : undefined } );
		if ( isBox ) s.box.onHit?.( { point, dir: _d.clone(), damage: dmg, kind: 'bullet', source: p.source } );
		if ( p.player && p.kind !== 'pellet' ) g.events.emit( 'noise', { pos: point.clone(), radius: 9, source: p.source, kind: 'impact' } );
		return false;
	}

	// what the ground is made of where a round lands (for the dust colour and the sound)
	_groundMat( p ) {
		const g = this.game, hf = g.hf;
		const fl = hf.flagsNear?.( p.x, p.z ) || 0;
		if ( fl & ( 1 | 4 | 8 ) ) return 'concrete';
		if ( p.y < 3 && g.world?.isBeach?.( p.x, p.z ) ) return 'sand';
		const s = hf.surfaceAt?.( p.x, p.z );
		if ( s && s[ 1 ] > 0.45 ) return 'rock';
		return 'dirt';
	}

	// ---- arrows ----
	_arrowMesh( kind ) {
		if ( ! this._arrowGeo ) {
			const shaft = new THREE.CylinderGeometry( 0.0038, 0.0038, 0.66, 6 ); shaft.rotateX( Math.PI / 2 ); shaft.translate( 0, 0, - 0.33 );
			const tip = new THREE.ConeGeometry( 0.0055, 0.035, 6 ); tip.rotateX( - Math.PI / 2 ); tip.translate( 0, 0, 0.015 );
			const vane = new THREE.BoxGeometry( 0.001, 0.014, 0.06 ); vane.translate( 0, 0.009, - 0.6 );
			const vanes = [ 0, 1, 2 ].map( i => vane.clone().rotateZ( i / 3 * Math.PI * 2 ) );
			this._arrowGeo = { shaft, tip, vanes };
			this._arrowMat = {
				shaft: patchMaterial( new THREE.MeshStandardMaterial( { color: 0x1c1c1e, roughness: 0.5, metalness: 0.2 } ), 'wpn-arrow' ),
				tip: patchMaterial( new THREE.MeshStandardMaterial( { color: 0xa0a4a8, roughness: 0.3, metalness: 1 } ), 'wpn-arrow' ),
				vane: patchMaterial( new THREE.MeshStandardMaterial( { color: 0xe0561c, roughness: 0.6 } ), 'wpn-arrow' ),
			};
		}
		const A = this._arrowGeo, M = this._arrowMat;
		const g = new THREE.Group();
		const s = kind === 'bolt' ? 0.6 : 1;
		const sh = new THREE.Mesh( A.shaft, M.shaft ); sh.scale.set( 1, 1, s );
		const tp = new THREE.Mesh( A.tip, M.tip );
		g.add( sh, tp );
		for ( const v of A.vanes ) { const m = new THREE.Mesh( v, M.vane ); m.position.z = kind === 'bolt' ? 0.24 : 0; g.add( m ); }
		for ( const c of g.children ) c.castShadow = true;
		this.game.scene.add( g );
		return g;
	}

	_orientArrow( p ) {
		const m = p.mesh;
		m.position.copy( p.pos );
		if ( p.visOff ) m.position.addScaledVector( p.visOff, Math.max( 0, 1 - p.dist / 10 ) );
		_v2.copy( p.vel ).normalize();
		m.quaternion.setFromUnitVectors( _n.set( 0, 0, 1 ), _v2 );
	}

	_stickArrow( p, point, lying = false ) {
		if ( ! p.mesh ) return;
		p.stuck = true;
		p.mesh.position.copy( point );
		if ( ! lying ) { _v2.copy( p.vel ).normalize(); p.mesh.quaternion.setFromUnitVectors( _n.set( 0, 0, 1 ), _v2 ); p.mesh.position.addScaledVector( _v2, 0.04 ); }
		else p.mesh.quaternion.setFromEuler( new THREE.Euler( 0, rnd() * 6.28, Math.PI / 2 ) ).multiply( new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.PI / 2, 0, 0 ) ) );
		this.arrows.push( { mesh: p.mesh, id: p.kind === 'bolt' ? 'crossbow_bolt' : 'arrow', uid: Math.random().toString( 36 ).slice( 2 ), t: 0 } );
		// don't litter forever
		while ( this.arrows.length > 30 ) { const a = this.arrows.shift(); a.mesh.parent?.remove( a.mesh ); }
	}

	_arrowProvider( ray ) {
		if ( ! this.arrows.length ) return null;
		const out = [];
		for ( const a of this.arrows ) {
			_v2.copy( a.mesh.position ).sub( ray.origin );
			const t = _v2.dot( ray.dir );
			if ( t < 0 || t > 3 ) continue;
			const miss = _v2.addScaledVector( ray.dir, - t ).length();
			if ( miss > 0.2 ) continue;
			out.push( { t, id: 'arrow:' + a.uid, label: `Take ${getItem( a.id )?.name || 'arrow'}`, noOcclusion: true, action: () => this._takeArrow( a ) } );
		}
		return out;
	}

	_takeArrow( a ) {
		const g = this.game;
		const st = makeStack( a.id, 1 );
		const left = g.player.inventory.add( st );
		if ( left > 0 ) { g.toast( 'No room', 'warn' ); return; }
		g.events.emit( 'item:pick', { stack: st } );
		g.audio?.play( 'pickup', { vol: 0.5 } );
		a.mesh.parent?.remove( a.mesh );
		this.arrows.splice( this.arrows.indexOf( a ), 1 );
	}

	// ---- signal flares: burn red on the ground for half a minute ----
	_landFlare( point, n ) {
		const g = this.game;
		const pos = point.clone().addScaledVector( n, 0.05 );
		const fire = g.fx?.fire( pos, { radius: 0.15, duration: 30, intensity: 0.5, smoke: false, sound: false } );
		this.flares.push( { pos, t: 0, fire } );
		g.events.emit( 'noise', { pos: pos.clone(), radius: 60, source: null, kind: 'flare' } );
	}

	_updateFlares( dt ) {
		const fx = this.fx;
		// flares in flight glow and spit sparks
		for ( const p of this.list ) {
			if ( p.kind !== 'flare' || ! fx ) continue;
			fx.lightNow( p.pos.clone(), _red, 40, 60 );
			if ( rnd() < 0.6 ) fx.add.emit( { x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: ( rnd() - 0.5 ) * 2, vy: ( rnd() - 0.5 ) * 2, vz: ( rnd() - 0.5 ) * 2, life: 0.5, s0: 0.05, s1: 0.2, frame: 14, r: 6, g: 0.8, b: 0.4, a: 0.8, drag: 2 } );
		}
		for ( let k = this.flares.length - 1; k >= 0; k -- ) {
			const f = this.flares[ k ];
			f.t += dt;
			if ( f.t > 30 ) { this.flares.splice( k, 1 ); continue; }
			const k2 = Math.min( 1, ( 30 - f.t ) / 3 );
			fx?.lightNow( f.pos.clone().setY( f.pos.y + 0.3 ), _red, ( 30 + rnd() * 12 ) * k2, 45 );
			if ( fx && rnd() < 0.7 ) fx.add.emit( { x: f.pos.x, y: f.pos.y + 0.03, z: f.pos.z, vx: ( rnd() - 0.5 ) * 0.6, vy: 0.5 + rnd(), vz: ( rnd() - 0.5 ) * 0.6, life: 0.6, s0: 0.12, s1: 0.03, frame: 14, r: 7, g: 1, b: 0.5, a: 0.9 * k2 } );
			if ( fx && rnd() < 0.25 ) fx.alpha.emit( { x: f.pos.x, y: f.pos.y + 0.2, z: f.pos.z, vx: 0.2, vy: 0.8, vz: 0.1, life: 3, s0: 0.1, s1: 1.2, frame: 1, r: 0.9, g: 0.55, b: 0.55, a: 0.3 * k2, drag: 0.5 } );
		}
	}

	// ---- explosions ----
	// o: { radius, damage, source, weapon, noise, fx (false = no visuals), cause }
	explode( pos, o = {} ) {
		const g = this.game;
		const R = o.radius ?? 10, D = o.damage ?? 200;
		if ( o.fx !== false ) g.fx?.explosion( pos, Math.min( 12, R * 0.6 ) );
		const c = _v.copy( pos ).setY( pos.y + 0.4 );
		for ( const e of g.entities.near( pos, R, null, [] ) ) {
			if ( ! e.alive || e.noHit || e.type === 'item' || e.type === 'projectile' ) continue;
			const mid = _v2.set( e.pos.x, e.pos.y + ( e.height || 1.6 ) * 0.5, e.pos.z );
			const d = mid.distanceTo( pos );
			if ( d > R ) continue;
			const los = g.physics.lineOfSight( c, mid );
			const k = Math.pow( 1 - d / R, 1.4 ) * ( los ? 1 : 0.2 );
			if ( k <= 0.01 ) continue;
			const dir = mid.clone().sub( pos ).normalize();
			hitEntity( g, e, D * k, { source: o.source, zone: 'torso', dir, kind: 'explosion', weapon: o.weapon } );
			// a shove away from the blast
			if ( e.knockback ) e.knockback( dir, 8 * k );
			else if ( e.vel ) e.vel.addScaledVector( dir, 6 * k ).y += 2 * k;
			if ( LIVING.has( e.type ) && k > 0.2 ) g.fx?.blood( mid, dir, 1.5 );
		}
		// the player
		const P = g.player;
		if ( P && ! g.dead && ! P.vehicle ) {
			const mid = _v2.set( P.pos.x, P.pos.y + P.height * 0.5, P.pos.z );
			const d = mid.distanceTo( pos );
			if ( d < R ) {
				const los = g.physics.lineOfSight( c, mid );
				const k = Math.pow( 1 - d / R, 1.4 ) * ( los ? 1 : 0.2 );
				if ( k > 0.01 ) g.survival?.hurt( D * k * 0.9, 'explosion', { dir: mid.clone().sub( pos ).normalize(), cause: o.cause || 'an explosion' } );
			}
		}
		// doors near the blast
		const door = g.city?.doorAt?.( pos, R * 0.5 );
		door?.bash?.( D, o.source || null );
		g.events.emit( 'noise', { pos: pos.clone(), radius: o.noise ?? 700, source: o.source, kind: 'explosion' } );
	}

	dispose() {
		this._unProvide?.();
		for ( const p of this.list ) p.mesh?.parent?.remove( p.mesh );
		for ( const a of this.arrows ) a.mesh.parent?.remove( a.mesh );
		this.list.length = 0; this.arrows.length = 0; this.flares.length = 0;
		if ( this._arrowGeo ) {
			const A = this._arrowGeo;
			for ( const geo of [ A.shaft, A.tip, ...A.vanes ] ) geo.dispose();
			for ( const m of Object.values( this._arrowMat ) ) m.dispose();
			this._arrowGeo = this._arrowMat = null;
		}
	}
}

const _red = new THREE.Color( 1, 0.12, 0.08 );
