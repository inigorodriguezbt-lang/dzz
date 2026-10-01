// `shelter`: a tent pitched or a sleeping bag laid out where you'll sleep. F sleeps in it (a tent is the better
// night: dry and out of the wind), a tent keeps gear inside (place.capacity), and either packs back up into the item.
import { addPlaceable } from './registry.js';
import { getItem } from '../ItemDB.js';
import { placedModel } from '../models/ext/placeables.js';
import { ageStored } from './stash.js';

const spec = ( p ) => getItem( p.item )?.place || {};

addPlaceable( 'shelter', {
	solid: ( p ) => spec( p ).shape === 'tent',
	solidBox: { hy: 0.45, k: 0.8 },
	outdoors: false,
	place: { time: 4, gerund: 'Setting up' },
	check( pos, g, sp ) { return sp.shape === 'tent' && g.world.isIndoors?.( pos ) ? 'Outdoors only' : null; },

	model( p ) {
		const S = spec( p ), color = getItem( p.item )?.model?.color;
		return placedModel( S.shape === 'tent' ? 'tent' : 'bedroll', { color } );
	},

	onPlace( p ) { p.data = spec( p ).capacity ? { items: [] } : {}; },

	// gear left in a tent: food in it goes off
	update( p, dt, g, dh ) { if ( p.data.items ) ageStored( g, p.data.items, dh ); },

	sub( p ) {
		const n = p.data.items?.length || 0;
		return n ? `${n} ${n === 1 ? 'item' : 'items'} inside` : '';
	},

	actions( p, g ) {
		const S = spec( p ), M = g.placeables, A = [];
		A.push( { label: 'Sleep', run: () => {
			// a tent under the rain is as good as a bed; a bag on the ground less so
			const q = S.sleep ?? 0.85;
			if ( g.itemUse?.sleep ) g.itemUse.sleep( q ); else g.sleep?.( 6, q );
		} } );
		if ( S.capacity ) A.push( { label: 'Open', run: () => g.app?.ui?.openContainer?.( { key: 'tent:' + p.id, label: getItem( p.item ).name, capacity: S.capacity, items: p.data.items, kind: 'tent', pos: M.vec( p ).clone() } ) } );
		A.push( M.pickUpAction( p, { label: S.shape === 'tent' ? 'Pack up' : 'Roll up', time: S.shape === 'tent' ? 5 : 2, check: () => p.data.items?.length ? 'Empty it first' : null } ) );
		return A;
	},
} );
