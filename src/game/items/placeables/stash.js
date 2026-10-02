// `stash`: a bag, a cooler or a storage tote left somewhere as a container you open with F; its contents stay in the
// item (stack.data.items), so picking it up takes everything with it. With a shovel it can be buried in soft ground:
// all that shows is a low mound, and getting at it again means digging it up. A shovel also digs a bare hole to
// stash things in (no container: data.items, HOLE_CAP), filled in again once it's empty. Food left in one goes off
// as it would in your bag (a cooler bag slows it).
import { addPlaceable } from './registry.js';
import { getItem, displayName } from '../ItemDB.js';
import { capacityOf, itemsOf } from '../../Inventory.js';
import { placedModel } from '../models/ext/placeables.js';
import { itemModel } from './fx.js';
import { provides } from '../util.js';
import { spoilRate } from '../hooks.js';

const HARD = 1 | 4 | 8 | 16;
export const HOLE_CAP = 20;
const hole = ( p ) => ! p.stack;
const itemsIn = ( p ) => p.stack ? itemsOf( p.stack ) : ( p.data.items ||= [] );
const shovel = ( g ) => g.player.inventory.find( ( s ) => provides( s, 'dig' ) );

// food ages in game hours where it was left (stashes, holes, tents); the container open on screen is aged by
// ItemUse already. k: what the container lets through (a cooler bag 0.5)
export function ageStored( g, items, dh, k = 1 ) {
	if ( ! ( dh > 0 ) || ! items?.length || g.app?.ui?.inventory?.other?.items === items ) return;
	k = spoilRate( items, k, dh, g ); // ice beside the food (hooks.js)
	for ( const s of items ) {
		const d = getItem( s.id );
		if ( d?.food?.spoil ) s.data.age = ( s.data.age || 0 ) + dh * k;
		if ( s.data?.items?.length ) ageStored( g, s.data.items, dh, k * ( 1 - ( d?.backpack?.keepsFresh || d?.clothing?.keepsFresh || 0 ) ) );
	}
}

// soft ground to bury in: not a road, a floor or a building's lot, not under a roof
export function diggable( g, pos ) {
	if ( g.world.isIndoors?.( pos ) ) return false;
	if ( g.hf.flagsNear?.( pos.x, pos.z ) & HARD ) return false;
	const fl = g.physics.ground( pos.x, pos.z, pos.y + 0.2, 0.3, 0 );
	return ! fl.box;
}

addPlaceable( 'stash', {
	radius: 0.3,
	place: { time: 1.5, gerund: 'Stashing' },

	model( p, game ) {
		// dug earth on a beach is wet sand
		const sand = !! game?.world?.isBeach?.( p.pos.x, p.pos.z );
		if ( p.data.buried ) return placedModel( 'mound', { sand } );
		if ( hole( p ) || p.spec?.hole ) return placedModel( 'hole', { sand } );
		return itemModel( getItem( p.item ) );
	},

	onPlace( p ) { p.data = { buried: false }; itemsIn( p ); },

	update( p, dt, g, dh ) { ageStored( g, itemsIn( p ), dh, 1 - ( getItem( p.stack?.id )?.backpack?.keepsFresh || 0 ) ); },

	label( p ) { return p.data.buried ? 'Mound' : hole( p ) ? 'Hole' : null; },
	sub( p, g ) {
		if ( p.data.buried ) return shovel( g ) ? 'Buried' : 'Buried · needs a shovel';
		const n = itemsIn( p ).length;
		return n ? `${n} ${n === 1 ? 'item' : 'items'}` : 'Empty';
	},

	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( D.buried ) {
			A.push( { label: 'Dig up', run: () => {
				const sh = shovel( g );
				if ( ! sh ) { g.toast( 'Need a shovel', 'warn' ); return; }
				M.sound( p, 'dig', 0.8 );
				M.timed( 'Digging', 8, null, () => { D.buried = false; g.itemUse?.wear?.( sh, 0.01 ); g.survival?.useStamina?.( 15 ); M.refresh( p ); open( p, g ); } );
			} } );
			return A;
		}
		A.push( { label: 'Open', run: () => open( p, g ) } );
		if ( shovel( g ) && diggable( g, M.vec( p ) ) ) A.push( { label: 'Bury', run: () => {
			const sh = shovel( g );
			M.sound( p, 'dig', 0.8 );
			M.timed( 'Burying', 10, null, () => { D.buried = true; g.itemUse?.wear?.( sh, 0.01 ); g.survival?.useStamina?.( 15 ); g.skills?.xp?.( 'survival', 2 ); M.refresh( p ); } );
		} } );
		if ( hole( p ) ) A.push( { label: 'Fill in', run: () => {
			if ( itemsIn( p ).length ) { g.toast( 'Empty it first', 'warn' ); return; }
			M.sound( p, 'dig', 0.7 );
			M.timed( 'Filling in', 4, null, () => { if ( ! itemsIn( p ).length ) M.remove( p, { give: false } ); } );
		} } );
		else A.push( M.pickUpAction( p, { time: 1.5 } ) );
		return A;
	},
} );

function open( p, g ) {
	const s = p.stack;
	g.app?.ui?.openContainer?.( { key: 'stash:' + p.id, label: s ? displayName( s ) : 'Hole', capacity: s ? capacityOf( s ) || 20 : HOLE_CAP, items: itemsIn( p ), kind: 'stash', pos: g.placeables.vec( p ).clone() } );
}
