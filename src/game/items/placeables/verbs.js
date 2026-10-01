// The item verbs that put things down in the world (Node-safe; the runtime is game.placeables, Placeables.js):
//   an item with `place: { kind }`  -> its verb ('Place', 'Set', 'Pitch', 'Plant'…)
//   any bag or box with room         -> 'Stash' (left as a hidden stash you open with F)
//   planks, at a closed door         -> 'Barricade door' (hammer and nails)
//   a shovel                         -> 'Dig stash' (a hole in soft ground to hide things in)
import { addUseActions } from '../hooks.js';
import { placeOf } from './registry.js';
import { provides } from '../util.js';

export const VERB = { light: 'Place', noise: 'Place', trap: 'Set', collector: 'Place', stash: 'Stash', shelter: 'Pitch' };

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, P = g?.placeables;
	if ( ! P ) return;
	const spec = placeOf( def );
	if ( spec && spec.kind !== 'barricade' ) ctx.add( spec.verb || VERB[ spec.kind ] || 'Place', () => P.beginPlace( stack ) );
	// a backpack, a cooler, a tote: left somewhere as a stash
	else if ( def.cat === 'backpack' || def.container?.capacity > 0 ) ctx.add( 'Stash', () => P.beginPlace( stack, { kind: 'stash' } ) );
	if ( def.id === 'planks' && P.doorAhead?.() ) ctx.add( 'Barricade door', () => P.barricadeDoor( stack ) );
	if ( provides( stack, 'dig' ) && ! ctx.game.player?.vehicle ) ctx.add( 'Dig stash', () => P.beginPlace( stack, { kind: 'stash', hole: true } ) );
} );
