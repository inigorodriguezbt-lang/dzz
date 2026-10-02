// Ice. A bag of ice or a frozen freezer pack keeps the food beside it (the same bag, cooler or stash) fresh for longer,
// and melts meanwhile: faster loose in a backpack than in a cooler. Hooked into food ageing (hooks.js addSpoilHook),
// which ItemUse runs for what you carry and the open container and placeables/stash.js for stashes, holes and tents.
// An item's `chill`: { hours (cold that lasts in the open), k (how fast food beside it ages; 1 = no help), melts
// (gone when warm: a bag of ice, shave ice), warm (found warm: a freezer pack a week into an outage) }.
// stack.data.cold: the fraction of cold left (missing: full, or none for things found warm).
// Node-safe.
import { getItem } from '../../ItemDB.js';
import { addSpoilHook } from '../../hooks.js';

export function coldLeft( s, d = getItem( s.id ) ) {
	const c = d?.chill;
	if ( ! c ) return 0;
	return s.data?.cold ?? ( c.warm ? 0 : 1 );
}

// a freezer pack frozen again (snow on the summits)
export function freeze( s ) {
	s.data.cold = 1;
	delete s.data.name;
}

const NAMES = { ice_bag: [ 'Bag of ice (melting)', null ], freezer_pack: [ null, 'Freezer pack (warm)' ] };

function setName( s, left ) {
	const n = NAMES[ s.id ];
	if ( ! n ) return;
	const want = left <= 0 ? n[ 1 ] : left < 0.4 ? n[ 0 ] : null;
	if ( want ) s.data.name = want; else delete s.data.name;
}

// k: how fast food in this list ages (a cooler bag 0.5); returns the rate with the coldest ice in it
export function chillItems( items, k, dh, game = null ) {
	if ( ! items?.length ) return k;
	let best = 1, melted = null;
	for ( let i = items.length - 1; i >= 0; i -- ) {
		const s = items[ i ], d = getItem( s.id ), c = d?.chill;
		if ( ! c ) continue;
		let left = coldLeft( s, d );
		// a pack found warm says so
		if ( left <= 0 ) { setName( s, 0 ); continue; }
		// the cooler that slows the food slows the melting too
		left = Math.max( 0, left - ( dh > 0 ? dh * k / c.hours : 0 ) );
		s.data.cold = left;
		if ( left > 0 ) { best = Math.min( best, c.k ?? 1 ); setName( s, left ); continue; }
		if ( c.melts ) { items.splice( i, 1 ); melted = d; } else setName( s, 0 );
	}
	// only say so for what you carry
	if ( melted && game?.player?.inventory?.containers?.().some( c => c.items === items ) ) {
		game.toast?.( `${melted.name} melted`, 'info' );
		game.player.inventory.changed();
	}
	return k * best;
}

// ice you put down melts too, in the sun as in a pocket (loot lying where it was found is left to its spot until it is
// picked up, as the food beside it is). Runs from the spoil hook, once for each new game time whoever calls it (the
// first time, by the hours the caller says have passed)
const groundAt = new WeakMap();
export function meltGround( game, hours = 0 ) {
	const W = game?.items3d, now = game?.time?.hours;
	if ( ! W?.items || now == null ) return;
	const last = groundAt.get( game );
	if ( last === now ) return;
	groundAt.set( game, now );
	const dh = last === undefined || now < last ? hours : now - last;
	if ( ! ( dh > 0 ) || dh > 24 * 60 ) return;
	const gone = [];
	for ( const it of W.items ) {
		if ( ! it.persistent || ! it.stack ) continue;
		const s = it.stack, d = getItem( s.id ), c = d?.chill;
		if ( ! c ) continue;
		const left = coldLeft( s, d );
		if ( left <= 0 ) continue;
		s.data.cold = Math.max( 0, left - dh / c.hours );
		if ( s.data.cold > 0 ) setName( s, s.data.cold );
		else if ( c.melts ) gone.push( it );
		else setName( s, 0 );
	}
	for ( const it of gone ) W.remove( it, { taken: true } );
}

addSpoilHook( ( items, k, dh, game ) => { meltGround( game, dh ); return chillItems( items, k, dh, game ); } );
