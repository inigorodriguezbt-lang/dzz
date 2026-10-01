// `trap`: wire snares and steel spring traps.
//   snare: set in the wild, it catches small game over game hours — a feral chicken, a mongoose, a rat — more often
//          far from towns, in forest and grass, at dawn and dusk, with bait, never while you hang about. F takes the
//          catch (it rots in the noose after a day), resets it, baits it, picks it up.
//   jaw:   a spring trap snaps on the first leg to cross it: the infected take a leg wound and are held a while (they
//          can still swing at you), an animal is hurt badly, and so are you — a wound, maybe a broken leg, stuck until
//          you pry it open (hold F). The snap is loud.
import * as THREE from 'three';
import { addPlaceable, lc } from './registry.js';
import { getItem, makeStack } from '../ItemDB.js';
import { snareChance, chanceOver, pickCatch, rollYields, CATCH, JAW } from './logic.js';
import { placedModel } from '../models/ext/placeables.js';

const kindOf = ( p ) => getItem( p.item )?.place?.trap || 'snare';
const _v = new THREE.Vector3(), _near = [];

// what you can bait a snare with: squid bait, scraps of meat or fish, fruit, peanut butter
const BAIT = ( s, d ) => !! d && ( d.id === 'fishing_bait' || ( d.cat === 'food' && ( d.id === 'peanut_butter' || /^raw_/.test( d.id ) || d.tags.includes( 'fruit' ) ) ) );

addPlaceable( 'trap', {
	radius: 0.2,
	place: { time: 3, gerund: 'Setting' },
	check( pos, g, spec ) {
		if ( spec.trap === 'snare' ) {
			if ( g.world.isIndoors?.( pos ) ) return 'Outdoors only';
			if ( g.hf.flagsNear?.( pos.x, pos.z ) & ( 1 | 4 | 8 | 16 ) ) return 'Needs soft ground';
		}
		return null;
	},

	model( p ) {
		if ( kindOf( p ) === 'snare' ) return placedModel( 'snare', { set: p.data.set !== false, catch: p.data.catch || null } );
		return placedModel( 'jaw', { open: p.preview || !! p.data.set, blood: !! p.data.blood } );
	},

	onPlace( p, g ) {
		p.data = { set: true };
		p._safe = true; // whoever set it steps off it first
		if ( kindOf( p ) === 'snare' ) {
			// the spot's character, worked out once: how far from town, Kauaʻi or not, the ground
			const pos = p.pos, hf = g.hf, s = hf.surfaceAt?.( pos.x, pos.z ) || [ 0.5, 0, 0, 0 ];
			p.data.town = Math.round( townEdge( g, pos ) );
			p.data.kauai = hf.islandAt?.( pos.x, pos.z ) === 2;
			p.data.moist = + ( s[ 0 ] || 0 ).toFixed( 2 ); p.data.lava = + ( s[ 1 ] || 0 ).toFixed( 2 );
			p.data.beach = !! g.world.isBeach?.( pos.x, pos.z );
		}
		g.skills?.xp?.( 'survival', 2 );
		g.placeables.refresh( p );
	},

	update( p, dt, g, dh ) {
		if ( kindOf( p ) !== 'snare' ) return;
		const D = p.data;
		if ( D.bait && g.time.hours - ( D.baitAt ?? 0 ) > 48 ) D.bait = null; // eaten by ants
		if ( ! D.set || D.catch || ! ( dh > 0 ) ) return;
		const watched = Math.hypot( p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z ) < 20;
		const c = snareChance( { townEdge: D.town ?? 2000, moist: D.moist ?? 0.5, lava: D.lava ?? 0, beach: !! D.beach, bait: !! D.bait, hour: g.hour, skill: g.skills?.level?.( 'survival' ) || 0, watched } );
		if ( Math.random() >= chanceOver( c, dh ) ) return;
		D.catch = pickCatch( Math.random, { kauai: !! D.kauai, townEdge: D.town ?? 2000 } );
		D.catchAt = g.time.hours - Math.random() * Math.min( dh, 24 ); // some time in the hours that went by (a night's sleep)
		D.set = false;
		D.bait = null;
		g.placeables.refresh( p );
	},

	// the jaws: whatever steps in first
	frame( p, dt, g ) {
		if ( kindOf( p ) !== 'jaw' ) return;
		const D = p.data;
		if ( D.set ) {
			for ( const e of g.entities.near( g.placeables.vec( p ), JAW.radius + 0.3, null, _near ) ) {
				if ( ! e.alive || e.removed || ( e.type !== 'zombie' && e.type !== 'animal' && e.type !== 'npc' ) || e.water ) continue;
				if ( Math.hypot( e.pos.x - p.pos.x, e.pos.z - p.pos.z ) > JAW.radius + ( e.radius || 0.3 ) * 0.3 || Math.abs( e.pos.y - p.pos.y ) > 0.6 ) continue;
				snap( p, g, e );
				return;
			}
			const pl = g.player, d = Math.hypot( pl.pos.x - p.pos.x, pl.pos.z - p.pos.z );
			if ( p._safe ) { if ( d > JAW.radius + 0.6 ) p._safe = false; return; }
			if ( g.mode !== 'creative' && ! pl.vehicle && ! g.dead && d < JAW.radius && Math.abs( pl.pos.y - p.pos.y ) < 0.5 ) snap( p, g, pl );
			return;
		}
		// holding one of the infected: pin it where it stands until it tears free or dies
		const z = p._victim;
		if ( ! z ) return;
		p._holdT -= dt;
		if ( ! z.alive || z.removed || p._holdT <= 0 ) {
			if ( z.alive && ! z.removed ) z.damage?.( 10, { kind: 'melee', zone: 'leg', source: null } );
			p._victim = null;
			return;
		}
		z.pos.x = p.pos.x; z.pos.z = p.pos.z;
		if ( typeof z.speed === 'number' ) z.speed = 0;
		// it thrashes now and then
		p._thrash = ( p._thrash ?? 1 ) - dt;
		if ( p._thrash <= 0 ) { p._thrash = 1 + Math.random() * 2; z.body?.flinch?.( _v.set( Math.random() - 0.5, 0, Math.random() - 0.5 ).normalize(), 0.5, 'leg' ); g.placeables.sound( p, 'hit_metal', 0.25, { rate: 1.6 } ); }
	},

	sub( p, g ) {
		const D = p.data;
		if ( kindOf( p ) === 'jaw' ) return p._victim ? 'Holding' : D.set ? 'Set' : 'Sprung';
		if ( D.catch ) return CATCH[ D.catch ]?.name + ( g.time.hours - ( D.catchAt ?? 0 ) > 24 ? ' · rotten' : '' );
		return D.set ? ( D.bait ? 'Set · baited' : 'Set' ) : 'Sprung';
	},

	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( kindOf( p ) === 'snare' ) {
			if ( D.catch ) A.push( { label: `Take ${lc( CATCH[ D.catch ]?.name )}`, run: () => M.timed( 'Taking it out', 3, null, () => takeCatch( p, g ) ) } );
			else if ( ! D.set ) A.push( { label: 'Reset', run: () => M.timed( 'Setting snare', 3, null, () => { D.set = true; M.refresh( p ); } ) } );
			else if ( ! D.bait ) {
				const b = g.player.inventory.find( BAIT );
				if ( b ) A.push( { label: `Bait with ${lc( getItem( b.id ).name )}`, run: () => M.timed( 'Baiting', 2, null, () => {
					const id = b.id;
					if ( takeBait( g, b ) ) { D.bait = id; D.baitAt = g.time.hours; }
				} ) } );
			}
		} else {
			if ( ! D.set && ! p._victim ) A.push( { label: 'Reset', run: () => M.timed( 'Setting trap', 4, null, () => { D.set = true; D.blood = false; p._safe = true; M.refresh( p ); M.sound( p, 'click', 0.6 ); } ) } );
		}
		if ( p._victim ) return A; // not with one of them thrashing in it
		A.push( M.pickUpAction( p, { time: 2, check: () => p._victim ? 'Not now' : null, before: () => {
			// springing a set trap by hand can catch your fingers
			if ( kindOf( p ) === 'jaw' && D.set && Math.random() < 0.06 * ( 1 - ( g.skills?.level?.( 'survival' ) || 0 ) / 10 ) ) { g.survival?.hurt?.( 8, 'melee', { zone: 'hand', cause: 'a spring trap' } ); g.toast( 'Caught your fingers', 'warn' ); }
			if ( p.stack ) delete p.stack.data.trap;
		} } ) );
		return A;
	},

	onRemove( p, g ) { if ( g.placeables.held === p ) g.placeables.release(); p._victim = null; },
} );

// the steel jaws close on whatever stepped in
function snap( p, g, e ) {
	const D = p.data, M = g.placeables;
	D.set = false;
	D.blood = true;
	M.sound( p, 'trap_snap', 1, { max: 90 } );
	M.noise( p, JAW.noise, 'trap' );
	const dir = _v.set( e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z );
	if ( dir.lengthSq() < 1e-4 ) dir.set( 1, 0, 0 );
	dir.normalize();
	const point = new THREE.Vector3( p.pos.x, p.pos.y + 0.15, p.pos.z );
	if ( e === g.player ) {
		const S = g.survival;
		S?.hurt?.( JAW.player.dmg, 'melee', { zone: 'leg', cause: 'a spring trap', dir: dir.clone() } );
		if ( Math.random() < JAW.player.fracture ) S?.breakLeg?.();
		M.hold( p );
		g.toast( 'Caught in a trap', 'bad' );
	} else {
		const T = e.type === 'zombie' ? JAW.zombie : JAW.animal;
		e.damage( T.dmg, { kind: 'melee', zone: 'leg', dir: dir.clone(), point, source: null, weapon: 'spring_trap' } );
		g.fx?.blood?.( point, dir, 0.8 );
		if ( ! e.alive ) g.events.emit( 'kill', { target: e, source: g.player, weapon: 'spring_trap' } );
		else if ( e.type === 'zombie' ) { p._victim = e; p._holdT = T.hold; p._thrash = 0.5; }
	}
	M.refresh( p );
}

function takeCatch( p, g ) {
	const D = p.data, M = g.placeables;
	if ( ! D.catch ) return;
	const age = Math.max( 0, g.time.hours - ( D.catchAt ?? g.time.hours ) );
	for ( const [ id, n ] of rollYields( D.catch, Math.random ) ) {
		if ( ! getItem( id ) || n <= 0 ) continue;
		const s = makeStack( id, n );
		// it has been lying in the noose since it was caught
		if ( getItem( id ).food?.spoil ) s.data.age = age;
		M.give( s );
	}
	D.catch = null;
	g.skills?.xp?.( 'survival', 6 );
	// the wire gives in the end
	if ( Math.random() < 0.15 ) {
		p.stack.cond = Math.max( 0, ( p.stack.cond ?? 1 ) - 0.34 );
		if ( p.stack.cond <= 0.02 ) { g.toast( 'Snare broke', 'info' ); M.remove( p, { give: false } ); return; }
	}
	M.refresh( p );
}

// one unit of bait: a portion of something with portions, else one of the stack
function takeBait( g, s ) {
	const use = g.itemUse, d = getItem( s.id );
	if ( ! use?.exists?.( s ) ) return false;
	const n = d.food?.portions || 1;
	if ( n > 1 ) {
		const one = use.splitOne( s );
		one.data.left = ( one.data.left ?? n ) - 1;
		if ( one.data.left <= 0 ) use.consumeOne( one ); else use.changed( use.where( one ) );
	} else use.consumeOne( s );
	return true;
}

// metres from a point to the edge of the nearest town (0 inside one)
export function townEdge( g, pos ) {
	let best = Infinity;
	for ( const c of g.world.meta?.cities || [] ) {
		const d = Math.hypot( c.x - pos.x, c.z - pos.z ) - ( c.radius || 300 );
		if ( d < best ) best = d;
	}
	return Math.max( 0, best === Infinity ? 3000 : best );
}
