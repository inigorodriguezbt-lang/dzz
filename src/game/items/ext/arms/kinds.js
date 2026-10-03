// The arms domain's placed thing (docs/ITEMS_PLAN.md "Placeables"). Node-safe: its look comes from
// ARMS.look[ kind ]( p, game ), set by models/ext/arms.js in the browser (else the item's own model).
//
//   arms_tripwire   a line of tin cans strung between two stakes, 2.6 m across a path, a doorway or a gap in a fence.
//                   When one of the infected (or an animal, or a bandit) walks through it the cans clatter: a burst of
//                   noise that draws the others to that spot, and a warning to you within earshot ("Cans rattled").
//                   You can step through your own once you have walked clear of it. With an air horn rigged to it,
//                   it blasts the horn: heard far off. F: reset it, or pick it up.
import { addPlaceable } from '../../placeables/registry.js';
import { TRIP, crossesTrip } from './logic.js';
import { ensureArmsSound } from './sounds.js';

export const ARMS = {
	look: {}, // kind -> ( p, game ) -> Object3D, set by the model file
};

const look = ( kind ) => ( p, g ) => ARMS.look[ kind ]?.( p, g ) || null;
const _near = [];
const TRIPPERS = new Set( [ 'zombie', 'animal', 'npc' ] );

addPlaceable( 'arms_tripwire', {
	radius: 0.3,
	place: { time: 4, gerund: 'Stringing' },
	model: look( 'arms_tripwire' ),

	onPlace( p ) {
		p.data = { set: true, horn: !! p.stack?.data?.horn };
		p._safe = true; // whoever strings it steps out of it first
	},

	label( p ) { return p.data.horn ? 'Horn tripwire' : 'Can tripwire'; },
	sub( p ) { return p.data.set ? 'Set' : 'Tripped'; },

	// every frame nearby: anything that walks into the line rattles it
	frame( p, dt, g ) {
		const D = p.data;
		if ( ! D.set ) return;
		const c = g.placeables?.vec?.( p ) || p.pos;
		for ( const e of g.entities?.near?.( c, TRIP.len / 2 + 1, null, _near ) || [] ) {
			if ( ! e.alive || e.removed || ! TRIPPERS.has( e.type ) || e.water ) continue;
			if ( Math.abs( e.pos.y - p.pos.y ) > 1.2 || ! crossesTrip( e.pos, p.pos, p.yaw, e.radius || 0.3 ) ) continue;
			trip( p, g, e );
			return;
		}
		const pl = g.player;
		if ( ! pl || pl.vehicle || g.dead ) return;
		const inside = Math.abs( pl.pos.y - p.pos.y ) < 1.2 && crossesTrip( pl.pos, p.pos, p.yaw, 0.3 );
		if ( p._safe ) { if ( ! inside ) p._safe = false; return; }
		if ( inside && g.mode !== 'creative' ) trip( p, g, pl );
	},

	actions( p, g ) {
		const M = g.placeables, A = [];
		if ( ! p.data.set ) A.push( { label: 'Reset', run: () => M.timed( 'Resetting', TRIP.reset, 'craft', () => { p.data.set = true; p._safe = true; M.refresh( p ); } ) } );
		A.push( M.pickUpAction( p ) );
		return A;
	},

	serialize( p ) { return { set: !! p.data.set, horn: !! p.data.horn }; },
	load( p, d ) { p.data = { set: d.set !== false, horn: !! d.horn }; },
} );

// the cans go: noise where the line is, a clatter you can hear, a word if you are near enough to make it out
export function trip( p, g, who ) {
	const D = p.data;
	D.set = false;
	const M = g.placeables;
	const loud = D.horn ? TRIP.hornNoise : TRIP.noise;
	if ( M?.noise ) M.noise( p, loud, 'tripwire' );
	else g.events?.emit?.( 'noise', { pos: { ...p.pos }, radius: loud, source: p, kind: 'tripwire' } );
	const a = g.audio, pos = M?.vec?.( p ) || p.pos;
	if ( a?.play ) {
		ensureArmsSound( a, 'arms_rattle' );
		a.play( 'arms_rattle', { pos, vol: 1, max: 160, ref: 10 } );
		if ( D.horn ) { ensureArmsSound( a, 'arms_airhorn' ); a.play( 'arms_airhorn', { pos, vol: 1, max: 700, ref: 30 } ); }
	}
	const pl = g.player;
	if ( pl && who !== pl ) {
		const d = Math.hypot( pl.pos.x - p.pos.x, pl.pos.z - p.pos.z );
		if ( d < ( D.horn ? TRIP.hornNoise : TRIP.warn ) && d > 3 ) g.toast?.( D.horn ? 'Tripwire horn' : 'Cans rattled', 'warn' );
	}
	// the cans hit the ground with the next build
	M?.refresh?.( p );
	return true;
}
