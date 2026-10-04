// The mobility equipment's placed things (docs/ITEMS_PLAN.md "Placeables"). Node-safe: each look comes from
// MOB.look[ kind ]( p, game ), set by models/ext/mobility.js in the browser (else the item's own model).
//
//   mob_rope         a rope hanging down a wall or a cliff: thrown up on a grappling hook, or tied off at the top (a
//                    rope, a climbing rope). Climb it from the bottom; climb down, or take it up, from the top; yank a
//                    hook down from below.
//   mob_ladder       a ladder leant on a wall: climb it, pull it up after you (it lies on the roof, out of reach), lower
//                    it again, take it. The infected knock it over now and then if they shuffle into it.
//   mob_rope_ladder  an escape ladder hooked over a sill or a roof edge: climb it, pull it up.
//   mob_zipline      a cable between two anchors (a tree, a post, a wall): ride it down from the high end on a trolley,
//                    or cross it hand over hand; take it down from either end.
//   mob_hauler       a cart, a barrow, a beach wagon or a hand truck standing where you left it: push (pull) it, open
//                    what it holds, fold the wagon, load a placed thing onto the hand truck.
//   mob_board        a board on the water (it floats, drifting with the wind) or pulled up on the sand: climb on, take it.
//   mob_canopy       a wing or a reserve canopy spread on the ground after a landing: pack it up (it takes a while).
// The climbables and the zipline have no F menu of their own: the mobility system's prompts reach along the rope, the
// ladder and the cable (runtime.js), not just the middle of them.
import { addPlaceable, getPlaceable, serializeRecord } from '../../placeables/registry.js';
import { getItem, makeStack, displayName } from '../../ItemDB.js';
import { itemsOf, containerWeight, containerVolume } from '../../../Inventory.js';
import { HAUL, TRUCKABLE } from './logic.js';

export const MOB = {
	look: {}, // kind -> ( p, game ) -> Object3D (models/ext/mobility.js)
	visual: {}, // name -> ( … ) -> Object3D: the flying canopy, a board underfoot, a trolley, a hook in flight
	sys: null, // set by the runtime: ( game ) -> the mobility system
};

const look = ( kind ) => ( p, g ) => MOB.look[ kind ]?.( p, g ) || null;
const sys = ( g ) => MOB.sys?.( g ) || null;
const dist = ( p, g ) => Math.hypot( p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z );

// ---- climbables ---------------------------------------------------------------------------------------------------------

addPlaceable( 'mob_rope', {
	label: ( p ) => p.data.hook ? 'Grappling hook' : getItem( p.item )?.name || 'Rope',
	model: look( 'mob_rope' ),
	actions: () => [],
	place: { time: 2, gerund: 'Tying' },
} );

addPlaceable( 'mob_ladder', {
	label: ( p ) => getItem( p.item )?.name || 'Ladder',
	model: look( 'mob_ladder' ),
	actions: () => [],
	// the infected bump into it: now and then it goes over (with you on it)
	update( p, dt, g ) {
		if ( p.data.up || ! g.entities?.near ) return;
		const near = g.entities.near( { x: p.pos.x, y: p.pos.y, z: p.pos.z }, 1.3, 'zombie' );
		if ( ! near?.length ) return;
		if ( Math.random() < 0.12 * dt * near.length ) sys( g )?.topple?.( p );
	},
	place: { time: 2.5, gerund: 'Setting up' },
} );

addPlaceable( 'mob_rope_ladder', {
	label: () => 'Rope ladder',
	model: look( 'mob_rope_ladder' ),
	actions: () => [],
	place: { time: 3, gerund: 'Hanging' },
} );

addPlaceable( 'mob_zipline', {
	label: () => 'Zipline',
	model: look( 'mob_zipline' ),
	actions: () => [],
	place: { time: 6, gerund: 'Tying off' },
} );

// ---- carts --------------------------------------------------------------------------------------------------------------

// the container a cart is (UI.openContainer), standing where it is
export function haulContainer( p ) {
	const st = p.stack, def = getItem( st?.id );
	// (pos: the inventory screen lets go of it 4 m away)
	return { key: 'mob:' + p.id, label: def?.name || 'Cart', capacity: HAUL[ st?.id ]?.cap ?? def?.container?.capacity ?? 40, items: itemsOf( st ), kind: 'bag', owner: st,
		pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z } };
}
export const haulLoad = ( p ) => containerWeight( itemsOf( p.stack ) ) + ( p.data.load ? 25 : 0 );

addPlaceable( 'mob_hauler', {
	label: ( p ) => ( p.stack ? displayName( p.stack ) : getItem( p.item )?.name ) || 'Cart',
	sub: ( p ) => {
		const n = itemsOf( p.stack ).length, H = HAUL[ p.stack?.id ];
		const parts = [];
		if ( p.data.tipped ) parts.push( 'Tipped over' );
		if ( p.data.load ) parts.push( 'Loaded: ' + ( getItem( p.data.load.it )?.name || 'load' ) );
		if ( H && n ) parts.push( `${Math.round( containerVolume( itemsOf( p.stack ) ) )}/${H.cap}` );
		return parts.join( ' · ' );
	},
	model: look( 'mob_hauler' ),
	solid: ( p ) => ! p._held,
	solidBox: { k: 0.8 },
	actions( p, g ) {
		const S = sys( g ), H = HAUL[ p.stack?.id ];
		if ( ! S || ! H ) return [];
		if ( p.data.tipped ) return [ { label: 'Set upright', run: () => S.upright( p ) } ];
		const A = [ { label: H.at < 0 ? 'Pull' : 'Push', run: () => S.haul( p ) } ];
		A.push( { label: 'Open', run: () => S.openHauler( p ) } );
		if ( H.loads ) {
			if ( p.data.load ) A.push( { label: 'Unload', run: () => S.unloadTruck( p ) } );
			else { const q = S.truckable( p ); if ( q ) A.push( { label: `Load ${q.name}`, run: () => S.loadTruck( p, q.rec ) } ); }
		}
		if ( H.fold ) A.push( { label: 'Fold', run: () => S.fold( p ) } );
		else if ( H.carry ) A.push( { label: 'Pick up', run: () => S.fold( p ) } );
		return A;
	},
	place: { time: 1, gerund: 'Setting down' },
} );

// ---- boards and canopies ------------------------------------------------------------------------------------------------

addPlaceable( 'mob_board', {
	label: ( p ) => getItem( p.item )?.name || 'Board',
	sub: ( p, g ) => sys( g )?.boardState?.( p ) || '',
	model: look( 'mob_board' ),
	water: true,
	// afloat it bobs and drifts (a leash keeps it by you); pulled up on the sand it stays put
	frame( p, dt, g ) { sys( g )?.floatBoard?.( p, dt ); },
	actions( p, g ) {
		const S = sys( g );
		if ( ! S ) return [];
		const A = [];
		if ( S.canBoard( p ) ) A.push( { label: S.boardVerb( p ), run: () => S.climbOn( p ) } );
		if ( dist( p, g ) < 3 ) A.push( { label: 'Pick up', run: () => S.pickBoard( p ) } );
		return A;
	},
} );

addPlaceable( 'mob_canopy', {
	label: ( p ) => p.data.chute ? 'Reserve canopy' : 'Paraglider',
	sub: () => 'Spread out',
	model: look( 'mob_canopy' ),
	water: true,
	actions( p, g ) {
		const P = g.placeables;
		const chute = !! p.data.chute;
		return [ P.pickUpAction( p, { label: chute ? 'Repack reserve' : 'Pack paraglider', time: chute ? 40 : 14,
			before: () => { if ( p.stack ) { p.stack.data = p.stack.data || {}; delete p.stack.data.spread; if ( chute ) p.stack.data.used = false; } } } ) ];
	},
} );

// a placed thing on a hand truck: saved whole in the truck's data, put back down as it was
export function packRecord( p ) { return serializeRecord( p ); }
export const truckableKind = ( kind ) => TRUCKABLE.has( kind ) && !! getPlaceable( kind );

// the board's stack when it is fished out of the water or off the sand
export const boardStack = ( p ) => p.stack || makeStack( p.item, 1 );
