// Keepsakes (docs/ITEMS_PLAN.md "leisure"): "Admire" a souvenir, a trophy or a valuable and it eases boredom and gloom,
// fully once a game day (itemUse.funDamp over a day of play), more the bigger your collection: each other kind of
// keepsake you carry or keep on display close by adds a tenth. The older souvenirs and jewellery in the catalogue join
// in (EXTRA). Node-safe.
import { getItem } from '../../ItemDB.js';
import { daySeconds, collectionK, COLLECT } from './logic.js';
import { ensureLeisSound } from './sounds.js';

// the catalogue's own keepsakes, which have no `admire` of their own
export const EXTRA = {
	tiki: { fun: { boredom: - 6, unhappy: - 4 } },
	gold_chain: { fun: { boredom: - 4, unhappy: - 5 } },
	diamond_ring: { fun: { boredom: - 4, unhappy: - 7 } },
	kukui_lei: { fun: { boredom: - 4, unhappy: - 4 } },
	puka_necklace: { fun: { boredom: - 3, unhappy: - 3 } },
};

// what admiring an item does: { verb, gerund, time, sound, fun } or null
export function admireSpec( def ) {
	if ( ! def ) return null;
	if ( def.admire ) return { verb: 'Admire', gerund: 'Admiring', time: 4, ...def.admire, fun: def.fun || def.admire.fun };
	const x = EXTRA[ def.id ];
	return x ? { verb: 'Admire', gerund: 'Admiring', time: 4, ...x } : null;
}

// kinds of keepsake to hand: carried, and on display within reach
export function collectionKinds( g ) {
	const kinds = new Set();
	for ( const s of g.player?.inventory?.allStacks?.() || [] ) if ( admireSpec( getItem( s.id ) ) ) kinds.add( s.id );
	for ( const p of g.placeables?.near?.( g.player.pos, COLLECT.displayR, 'leisure_decor' ) || [] ) kinds.add( p.item );
	return kinds.size;
}

// the lift: the day's damping (shared by every copy of the item) times the collection
export function admireK( g, def, stamp = false ) {
	const U = g.itemUse;
	const damp = U?.funDamp ? U.funDamp( 'admire:' + def.id, daySeconds( g ), stamp ) : 1;
	return { damp, k: damp * collectionK( collectionKinds( g ) ) };
}

// admire a stack (carried, or on display: `placed` skips the "still have it" check)
export function admire( g, stack, def, { placed = false } = {} ) {
	const U = g.itemUse, A = admireSpec( def );
	if ( ! U || ! A ) return false;
	if ( A.sound ) ensureLeisSound( g.audio, A.sound );
	U.timed( A.gerund, A.time, A.sound || null, () => {
		if ( ! placed && ! U.exists( stack ) ) return;
		const { damp, k } = admireK( g, def, true );
		U.applyFun( { id: 'admire:' + def.id, fun: A.fun }, k );
		if ( damp < 0.5 ) g.toast( 'Seen it today', 'info' );
	}, { cancelOnMove: false } );
	return true;
}
