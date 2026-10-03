// The arms domain's thrown things, as kinds of the weapons module's Throwables (src/weapons/Throwables.js reads
// THROW_KINDS[ def.throwable.kind ]):
//   arms_firecracker  a string (or a New Year roll) of firecrackers: lit from a lighter or matches you carry, a fuse,
//                     then bursts of pops with flashes and sparks for a few seconds; a pulse of noise every half second
//                     draws the infected to it. Unlit (nothing to light it with) it lands as a dud you can pick up.
//   arms_knife        a throwing knife: spins end over end, hurts what it hits (head shots most), and drops where it
//                     lands or at the feet of what it hit, to be picked up again.
//   arms_shot         a slingshot's steel ball or stone: fast and flat, a quiet hit, often found again.
//   arms_item         a thing thrown that isn't a weapon (an alarm clock set to ring, a radio left playing): where it
//                     comes to rest it becomes a placed noise maker (the placeables' `noise` kind).
//   flare             a road flare thrown with the throw key: it lights and burns where it lands, as "Light and throw"
//                     does (the items module's flare simulation).
// Hooks: mesh( def ), launch( o, sys, opts ), hit( o, { point, hit, ent, zone, dir }, sys ) -> true when handled,
// rest( o, sys ), update( o, dt, sys ), detonate( o, sys ). sys is the Throwables system (sys.game, sys.hitEntity).
import * as THREE from 'three';
import { getItem, makeStack } from '../../ItemDB.js';
import { buildItemModel } from '../../../../render/ItemModels.js';
import { FIRECRACKER, popTimes, hitDamage, SLING, KNIFE_THROW, clamp } from './logic.js';
import { ensureArmsSound } from './sounds.js';

const rnd = () => Math.random();
const _v = new THREE.Vector3(), _up = new THREE.Vector3( 0, 1, 0 );
const POP_COL = 0xffc27a;

function play( g, name, pos, vol, o = {} ) {
	const a = g.audio;
	if ( ! a?.play ) return;
	ensureArmsSound( a, name );
	a.play( name, { pos, vol, max: o.max ?? 120, ref: o.ref, rate: o.rate ?? 1, detune: o.detune } );
}

// the thing becomes an item on the ground again (a thrown knife, a dud, a ball found later)
function toItem( o, sys, id = o.def.id, at = o.pos ) {
	const g = sys.game;
	o.done = true;
	o.keep = false;
	o.mesh.visible = false;
	const st = makeStack( id, 1 );
	if ( ! st || ! g.items3d?.spawn ) return null;
	try { return g.items3d.spawn( st, at.clone().add( _v.set( 0, 0.05, 0 ) ), { persistent: true } ); } catch ( e ) { return null; }
}

function bleed( g, ent, point, dir, amount ) {
	if ( ent.type === 'zombie' || ent.type === 'animal' || ent.type === 'npc' ) g.fx?.blood( point, dir, amount );
}

export const THROW_KINDS = {
	arms_firecracker: {
		launch( o, sys ) {
			const g = sys.game, inv = g.player?.inventory;
			o.fc = FIRECRACKER[ o.def.id ] || FIRECRACKER.firecracker_string;
			o.fuse = o.fc.fuse;
			o.spin.multiplyScalar( 0.5 );
			// lit as it leaves the hand from whatever you carry to light it with
			const lit = g.mode === 'creative' || !! inv?.hasTool?.( 'lighter' ) || !! inv?.hasTool?.( 'matches' );
			if ( ! lit ) { o.armed = false; o.dud = true; g.toast?.( 'No lighter', 'warn' ); return; }
			play( g, 'arms_fuse', o.pos, 0.35, { max: 30 } );
		},
		update( o, dt, sys ) {
			const g = sys.game, fx = g.fx;
			if ( o.armed && ! o.done && fx && rnd() < 0.7 ) {
				// the fuse sputters
				fx.add.emit( { x: o.pos.x, y: o.pos.y + 0.03, z: o.pos.z, vx: ( rnd() - 0.5 ) * 1.5, vy: 1 + rnd(), vz: ( rnd() - 0.5 ) * 1.5, life: 0.18, s0: 0.012, s1: 0.003, frame: 2, r: 4, g: 2.6, b: 1, a: 1, grav: 6, drag: 1 } );
			}
			if ( ! o.pops ) return;
			o.pt += dt;
			const spec = o.fc;
			while ( o.pi < o.pops.length && o.pops[ o.pi ] <= o.pt ) { pop( o, sys ); o.pi ++; }
			o.nt -= dt;
			if ( o.nt <= 0 && o.pi < o.pops.length ) { o.nt = spec.every; g.events.emit( 'noise', { pos: o.pos.clone(), radius: spec.noise, source: null, kind: 'firecracker' } ); }
			if ( o.pi >= o.pops.length ) {
				o.keep = false;
				o.mesh.visible = false;
				const floor = g.physics?.ground?.( o.pos.x, o.pos.z, o.pos.y + 0.3 )?.y ?? o.pos.y;
				g.fx?.decal?.( _v.set( o.pos.x, floor, o.pos.z ), _up, 'scorch', 0.5 * spec.flash, 300, 0.6 );
			}
		},
		rest( o, sys ) { if ( o.dud && ! o.wet && ! o.done ) toItem( o, sys ); },
		detonate( o, sys ) {
			if ( o.wet ) { o.keep = false; return; } // it drowned
			o.keep = true;
			o.pops = popTimes( o.fc );
			o.pt = 0; o.pi = 0; o.nt = 0;
			sys.game.fx?.light( o.pos, POP_COL, 10 * o.fc.flash, 7, 0.06 );
		},
	},

	arms_knife: {
		launch( o ) { o.armed = false; o.spin.set( 0, 0, - 20 - rnd() * 6 ); },
		hit( o, h, sys ) {
			if ( o.done ) return true;
			const g = sys.game;
			if ( h.ent ) {
				const speed = o.vel.length(), t = o.def.throwable;
				const dmg = hitDamage( t.damage ?? KNIFE_THROW.dmg, h.zone, speed / ( t.speed || KNIFE_THROW.speed ) );
				// (a projectile blade: in the head it drops them, like an arrow)
				sys.hitEntity( g, h.ent, dmg, { source: o.source, zone: h.zone, dir: h.dir, kind: 'arrow', weapon: o.def.id, point: h.point.clone() } );
				bleed( g, h.ent, h.point, h.dir, 1.1 );
				h.ent.stagger?.( h.dir.clone(), 0.5 );
				g.audio?.play( 'hit_blade', { pos: h.point, vol: 0.7, max: 30 } );
				if ( o.source === g.player ) g.skills?.xp?.( 'aiming', 3 );
				g.events.emit( 'noise', { pos: h.point.clone(), radius: 8, source: o.source, kind: 'melee' } );
				// it drops at the feet of what it hit
				toItem( o, sys, o.def.id, _v.set( h.ent.pos.x + ( rnd() - 0.5 ) * 0.5, h.ent.pos.y + 0.05, h.ent.pos.z + ( rnd() - 0.5 ) * 0.5 ).clone() );
				return true;
			}
			if ( ! o.clang && h.hit.kind !== 'water' ) { o.clang = true; g.audio?.play( 'hit_metal', { pos: h.point, vol: 0.45, rate: 1.4, max: 30 } ); }
			return false;
		},
		rest( o, sys ) { if ( ! o.done ) toItem( o, sys ); },
	},

	arms_shot: {
		mesh( def ) {
			const steel = def.id === 'steel_shot';
			const m = new THREE.Mesh( new THREE.SphereGeometry( steel ? 0.0055 : 0.011, 8, 6 ), new THREE.MeshStandardMaterial( { color: steel ? 0xb8bcc2 : 0x7a756c, metalness: steel ? 0.9 : 0, roughness: steel ? 0.25 : 0.9 } ) );
			const g = new THREE.Group(); g.add( m );
			return g;
		},
		launch( o ) { o.armed = false; o.spin.set( 0, 0, 0 ); },
		hit( o, h, sys ) {
			if ( o.done ) return true;
			const g = sys.game, A = SLING.ammo[ o.def.id ] || SLING.ammo.stone;
			if ( h.ent && ! o.struck ) {
				o.struck = true;
				const speed = o.vel.length();
				const dmg = hitDamage( A.dmg, h.zone, speed / SLING.speed );
				sys.hitEntity( g, h.ent, dmg, { source: o.source, zone: h.zone, dir: h.dir, kind: 'melee', weapon: 'slingshot', point: h.point.clone() } );
				bleed( g, h.ent, h.point, h.dir, 0.4 );
				h.ent.stagger?.( h.dir.clone(), h.zone === 'head' ? 0.7 : 0.35 );
				g.audio?.play( h.zone === 'head' ? 'headshot' : 'hit_flesh', { pos: h.point, vol: 0.5, max: 25 } );
				if ( o.source === g.player ) g.skills?.xp?.( 'aiming', 2 );
				if ( rnd() < A.keep ) toItem( o, sys, o.def.id, _v.set( h.ent.pos.x, h.ent.pos.y + 0.05, h.ent.pos.z ).clone() );
				else { o.done = true; o.mesh.visible = false; }
				return true;
			}
			if ( ! o.clang && h.hit.kind !== 'water' ) {
				o.clang = true;
				const mat = h.hit.mat || ( h.hit.kind === 'ground' ? 'dirt' : 'concrete' );
				g.fx?.impact( h.point, h.hit.normal || _up, mat, { size: 0.25, kind: 'melee', decal: false } );
				g.events.emit( 'noise', { pos: h.point.clone(), radius: 7, source: o.source, kind: 'impact' } );
				// it skips on hard ground and keeps going a little way
				o.vel.multiplyScalar( 0.35 );
			}
			return false;
		},
		rest( o, sys ) {
			if ( o.done ) return;
			const A = SLING.ammo[ o.def.id ] || SLING.ammo.stone;
			if ( ! o.wet && rnd() < A.keep ) toItem( o, sys );
			else { o.done = true; o.mesh.visible = false; }
		},
	},

	arms_item: {
		mesh( def ) {
			const src = getItem( def.id );
			const obj = src ? buildItemModel( src ).clone( true ) : new THREE.Group();
			// centred on its middle so it tumbles about it
			const box = new THREE.Box3().setFromObject( obj ), c = box.getCenter( new THREE.Vector3() );
			const g = new THREE.Group(); obj.position.sub( c ); g.add( obj );
			return g;
		},
		launch( o ) { o.armed = false; o.spin.multiplyScalar( 0.6 ); },
		hit( o, h, sys ) {
			if ( o.done ) return true;
			const g = sys.game;
			if ( h.ent && ! o.struck ) {
				o.struck = true;
				sys.hitEntity( g, h.ent, 5, { source: o.source, zone: h.zone, dir: h.dir, kind: 'blunt', weapon: o.def.id, point: h.point.clone() } );
				h.ent.stagger?.( h.dir.clone(), 0.3 );
			}
			if ( ! o.clang ) { o.clang = true; g.audio?.play( 'hit_wood', { pos: h.point, vol: 0.4, rate: 1.4, max: 30 } ); }
			return false;
		},
		rest( o, sys ) {
			if ( o.done ) return;
			const g = sys.game, st = o.stack;
			o.done = true;
			o.mesh.visible = false;
			if ( ! st ) return;
			const floor = g.physics?.ground?.( o.pos.x, o.pos.z, o.pos.y + 0.3 )?.y ?? o.pos.y;
			const at = { x: o.pos.x, y: floor, z: o.pos.z };
			// it keeps ringing or playing where it lies (the placeables' noise kind); without them, an item on the ground
			const p = ! o.wet && g.placeables?.add ? g.placeables.add( 'noise', st, at, rnd() * Math.PI * 2, o.place || null ) : null;
			if ( p ) g.placeables.refresh?.( p );
			else if ( g.items3d?.spawn ) g.items3d.spawn( st, new THREE.Vector3( at.x, at.y + 0.05, at.z ), { persistent: true } );
		},
	},

	// a road flare quick-thrown with the throw key: it lights and burns where it lands (ItemUse's flares)
	flare: {
		launch( o, sys ) {
			const g = sys.game, U = g.itemUse, d = o.def;
			o.armed = false;
			if ( ! U?.addFlare ) return;
			U.addFlare( o.pos, o.vel, d );
			o.done = true;
			o.mesh.visible = false;
		},
	},
};

// one pop of a string: a flash, sparks, a puff, the crack; the string jumps about
function pop( o, sys ) {
	const g = sys.game, fx = g.fx, k = o.fc.flash;
	const p = _v.set( o.pos.x + ( rnd() - 0.5 ) * 0.25 * k, o.pos.y + 0.04 + rnd() * 0.12, o.pos.z + ( rnd() - 0.5 ) * 0.25 * k ).clone();
	if ( fx ) {
		fx.light( p, POP_COL, 9 * k, 5 + 2 * k, 0.045 );
		fx.sparks( p, _up, 3 + Math.floor( rnd() * 4 ), { speed: 6 } );
		fx.add.emit( { x: p.x, y: p.y, z: p.z, life: 0.07, s0: 0.05 * k, s1: 0.18 * k, frame: 14, r: 6, g: 4.2, b: 2.4, a: 1 } );
		if ( rnd() < 0.35 ) fx.alpha?.emit( { x: p.x, y: p.y, z: p.z, vx: ( rnd() - 0.5 ) * 0.4, vy: 0.5 + rnd() * 0.4, vz: ( rnd() - 0.5 ) * 0.4, life: 1.6, s0: 0.08, s1: 0.45 * k, frame: 1, r: 0.75, g: 0.72, b: 0.7, a: 0.45, drag: 1.5 } );
		// shreds of red paper
		if ( rnd() < 0.5 ) fx.alpha?.emit( { x: p.x, y: p.y, z: p.z, vx: ( rnd() - 0.5 ) * 3, vy: 1.5 + rnd() * 2, vz: ( rnd() - 0.5 ) * 3, life: 2.5, s0: 0.012, frame: 5, r: 0.75, g: 0.08, b: 0.06, a: 1, grav: 4, drag: 2, rotV: ( rnd() - 0.5 ) * 20, floor: o.pos.y - 0.02, bounce: 0.1 } );
	}
	play( g, 'arms_pop', p, clamp( 0.55 + rnd() * 0.35, 0, 1 ) * ( k > 1 ? 1 : 0.85 ), { max: 260, ref: 14, rate: 0.8 + rnd() * 0.5, detune: 0.1 } );
	if ( o.mesh.visible ) { o.mesh.position.x = o.pos.x + ( rnd() - 0.5 ) * 0.04; o.mesh.rotation.y += ( rnd() - 0.5 ) * 0.8; }
}
