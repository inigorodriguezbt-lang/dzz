// Placeables core items (docs/ITEMS_PLAN.md "Placeables"): the few new things the base kinds need — an alarm clock
// (noise), a wire snare and a spring trap (trap), a rain barrel (collector), a storage tote (stash), a candle and a
// tiki torch (light), and the meat a snare catches. Existing items get their `place` field in tools.js /
// materials.js. The runtime is src/game/items/Placeables.js; the verbs are in placeables/verbs.js.
import { defineItems } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import '../../placeables/verbs.js';

function tool( id, name, kind, o ) {
	const d = { id, name, cat: 'tool', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ 'tool', ...( o.tags || [] ) ], model: o.model, tool: { kind, ...( o.tool || {} ) } };
	for ( const k of [ 'place', 'noise', 'container' ] ) if ( o[ k ] ) d[ k ] = o[ k ];
	return d;
}

defineItems( [
	// ---- noise ----
	tool( 'alarm_clock', 'Alarm clock', 'alarm', { w: 0.35, size: 1, tags: [ 'house', 'hotel', 'office', 'pawn' ],
		model: { type: 'pl_alarm_clock', color: 0xc8302a },
		noise: { radius: 50, seconds: 45 }, place: { kind: 'noise', alarm: true, radius: 50, every: 2, ring: 45 },
		desc: 'Rings after a delay. Draws the infected.' } ),

	// ---- traps ----
	tool( 'snare', 'Wire snare', 'trap', { w: 0.15, size: 1, stack: 4, rarity: 'uncommon', tags: [ 'farm', 'hardware', 'outdoor', 'hunting', 'crafted' ],
		model: { type: 'pl_snare' }, place: { kind: 'trap', trap: 'snare' },
		desc: 'Catches small game. Set it in the wild.' } ),
	tool( 'spring_trap', 'Spring trap', 'trap', { w: 3.2, size: 3, rarity: 'uncommon', tags: [ 'farm', 'hardware', 'hunting', 'garage' ],
		model: { type: 'pl_spring_trap' }, place: { kind: 'trap', trap: 'jaw' },
		desc: 'Snaps shut on a leg. Holds the infected.' } ),

	// ---- water ----
	tool( 'rain_barrel', 'Rain barrel', 'collector', { w: 6.5, size: 24, rarity: 'uncommon', tags: [ 'farm', 'hardware', 'garage', 'construction' ],
		model: { type: 'pl_barrel', color: 0x2a5aa8 }, place: { kind: 'collector', litres: 120, area: 1 },
		desc: 'Collects rain. Place it outdoors.' } ),

	// ---- stash ----
	tool( 'stash_box', 'Storage tote', 'stash', { w: 1.4, size: 10, tags: [ 'house', 'garage', 'hardware', 'warehouse' ],
		model: { type: 'pl_tote', color: 0x3a4a5a, lid: 0x2a6ad6 }, container: { capacity: 30 }, place: { kind: 'stash' },
		desc: 'Holds 30. Stash it or bury it.' } ),

	// ---- light ----
	tool( 'candle', 'Candle', 'candle', { w: 0.15, size: 0.5, stack: 6, tags: [ 'house', 'church', 'hotel', 'grocery' ],
		model: { type: 'pl_candle', color: 0xf2ead8 },
		place: { kind: 'light', fire: true, burn: 8, light: { range: 6, color: 0xffa860, intensity: 3.5, flicker: true }, flame: 0.04 },
		desc: 'Burns 8 h. Light it where it stands.' } ),
	tool( 'tiki_torch', 'Tiki torch', 'tiki', { w: 1.1, size: 8, rarity: 'uncommon', tags: [ 'house', 'garage', 'hardware', 'beach', 'hotel' ],
		model: { type: 'pl_tiki_torch' },
		place: { kind: 'light', fire: true, burn: 6, refuel: 'cooking_oil', upright: true, light: { range: 13, color: 0xff9440, intensity: 14, flicker: true }, flame: 0.09 },
		desc: 'Garden torch. Burns 6 h on oil.' } ),

	// ---- what a snare catches ----
	{ id: 'raw_small_game', name: 'Small game meat', cat: 'food', weight: 0.25, size: 1, stack: 4, rarity: 'common', tags: [ 'hunting' ],
		model: { type: 'meat', kind: 'chunk', color: 0x9a3a36 },
		food: { kcal: 220, water: 0, spoil: 24, raw: true, sick: 0.1, cooked: 'cooked_small_game', portions: 1 }, desc: 'Cook it first.' },
	{ id: 'cooked_small_game', name: 'Roast small game', cat: 'food', weight: 0.2, size: 1, stack: 4, rarity: 'common', tags: [ 'crafted' ],
		model: { type: 'meat', kind: 'chicken', cooked: true },
		food: { kcal: 260, water: 0, spoil: 48, portions: 1 } },
] );

// where they lie in buildings (shelves, counters and floors you can see)
const add = ( table, entries ) => extendLoot( table, entries );
add( 'house_bedroom', [ [ 'alarm_clock', 0.7 ], [ 'candle', 0.4, [ 1, 3 ] ] ] );
add( 'hotel_room', [ [ 'alarm_clock', 0.6 ], [ 'candle', 0.3 ] ] );
add( 'office', [ [ 'alarm_clock', 0.15 ] ] );
add( 'pawn', [ [ 'alarm_clock', 0.4 ], [ 'spring_trap', 0.15 ] ] );
add( 'house_living', [ [ 'candle', 0.8, [ 1, 4 ] ] ] );
add( 'house_kitchen', [ [ 'candle', 0.4, [ 1, 3 ] ] ] );
add( 'church', [ [ 'candle', 2.5, [ 2, 6 ] ] ] );
add( 'grocery', [ [ 'candle', 0.4, [ 1, 4 ] ] ] );
add( 'farm', [ [ 'snare', 0.6, [ 1, 3 ] ], [ 'spring_trap', 0.45 ], [ 'rain_barrel', 0.6 ], [ 'tiki_torch', 0.2 ] ] );
add( 'hardware', [ [ 'snare', 0.25, [ 1, 2 ] ], [ 'spring_trap', 0.25 ], [ 'rain_barrel', 0.4 ], [ 'stash_box', 0.5 ], [ 'tiki_torch', 0.5 ] ] );
add( 'house_garage', [ [ 'stash_box', 0.6 ], [ 'rain_barrel', 0.2 ], [ 'tiki_torch', 0.4 ], [ 'spring_trap', 0.08 ], [ 'snare', 0.1 ] ] );
add( 'warehouse', [ [ 'stash_box', 0.5 ], [ 'rain_barrel', 0.25 ], [ 'spring_trap', 0.1 ] ] );
add( 'sports', [ [ 'snare', 0.2, [ 1, 2 ] ] ] );
add( 'beach', [ [ 'tiki_torch', 0.35 ] ] );

addRecipes( [
	R( 'snare', 'Wire snare', [ 'snare', 2 ], [ [ 'wire', 1 ], [ 'stick', 1 ] ], { tools: [ 'cut' ], time: 8, cat: 'tools' } ),
	R( 'snare_rope', 'Rope snare', [ 'snare', 1 ], [ [ 'rope', 1 ], [ 'stick', 1 ] ], { tools: [ 'cut' ], time: 8, cat: 'tools' } ),
] );
