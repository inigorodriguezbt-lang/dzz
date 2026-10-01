# Phase A core APIs (exact, from the core agents' final reports)

## combine

```
// src/game/items/combos.js (Node-safe; domains: import { addCombos } from '../../combos.js')
addCombos( [ { id, verb, a, b, use?: { a: 0|n|'all'|{ qty|portions|uses: n }, b }, liquid?: { side?: 'a'|'b', kind, litres }, out?: 'id' | [ id, qty, data? ] | [ [ id, qty, data? ], … ], repair?: { a|b: amount, max }, wear?: { a|b: amount }, tools?: [ kinds ], station?: 'fire', time?: s | fn( ctx ), sound?, label?: 'Text {a} {b}' | fn( a, b ), check?: fn( ctx ) -> null | 'reason' | { reason, soft: true }, run?: fn( ctx ), skill?, xp?, fun?, noise?: { radius }, progress? } ] )
// defaults use { a: 1, b: 1 }, time 2, verb 'Combine'. Plain n = a use (tool/medical.uses), a portion (drink portions > 1), else one of the stack (also from other carried stacks of the id; the used unit takes its per-unit state). { qty: 1 } = one whole unit however full.
matches( matcher, stack, def? ); findCombos( x, y, { both?, list? } ) -> [ { combo, a, b } ]; comboLabel( combo, a, b ) (every {a}/{b} filled); getCombo, allCombos, COMBOS, comboIds; unitKind, useSpec, unitsIn, maxUses, maxPortions; liquidIn, holds, liquidRoom, kindOk
// src/game/items/Combine.js: game.combine
find( a, b, { both? } ) -> [ { combo, a, b, label, state: { ok, reason?, soft? } } ]
accepts( dragged, target ) -> { ok: true, verb, matches, refused } | { ok: false, reason, combo: true } | null   // null also when only soft refusals: not a drag target
partners( stack ) -> [ { combo, other, a, b, verb, label, ok, reason } ]   // carried + open container + ground 2.6 m; one row per combo+partner id (the one that needs it most); soft refusals left out
state( combo, a, b ) -> { ok } | { ok: false, reason, soft? }
cost( combo, a, b ) -> '2× Rags, 4× Sticks' | null
run( combo, a, b ) -> bool   // timed game.actions action carrying combo: { id, a: uid, b: uid }; does nothing if the player died / respawned meanwhile
apply( combo, a, b ) -> ctx; consume( stack, use, skip? ); give( id, qty, data ) (HUD pickup row when the screen is closed; no 'item:pick'); replace( stack, id, data ) (same uid/slot/cond; a bag's contents stay as far as they fit, the rest to your bags); draw( stack, litres ); drawCarried( kind, litres ); pour( from, to, litres? )
ctx = { game, inv, combo, a, b, A, B, use, survival, player, skills, used: { a, b }, made: [], consume( stack, n ), give( id, qty, data ), replace( stack, id, data ), toast( text, kind ), sound( name ), pour( from, to, litres ), draw( stack, litres ), liquid( stack ) }
// after outputs: a consumed side that was on a hotbar key or in the hands hands both to a single-unit output
events: 'combine' { id, a, b }; 'noise' { pos, radius, source, kind: 'combine' }
```

## mood

```
// unchanged from the builder (see docs/ARCHITECTURE.md "Mood and skills"), plus:
// ---- game.survival ----
survival.boredom, .stress, .unhappy, .panic  // 0..100, saved in save.survival
survival.mood( { boredom, stress, unhappy, panic } )  // deltas, clamped; no-op in creative / god mode
survival.swayMul(), healMul(), sleepQuality(), noiseMul(), passTime( hours ), slept( hours ), moodles(), conditions()
// sleep: Survival records when game.sleeping starts and applies slept( hours ) once the clock jump shows (or when sleep ends, if paused through it)
// ---- game.skills ----
skills.xp( skill, n ) -> level; level( skill ) 0..10 (cached); progress, total, mul( skill, perLevel ), setLevel, knows / learn, readProgress / setRead, craftSkill( r ), craftXp( r ), list(), serialize / load
craftSkill: r.skill > r.cat if it names a skill other than R()'s default 'survival' > inferred from whole-word ingredient ids (rags output -> tailoring; food or fire -> cooking; medical -> first_aid; cloth without sticks or wood -> tailoring; electronics / battery / solder -> electrical; toolbox / wrench / vehicle -> mechanics; hammer / planks / nails -> carpentry; else survival)
craftXp: r.xp if > 0, else clamp( time / 2, 3, 15 )
// ---- recipes.js ----
R( id, name, out, inputs, { …, skill, xp } )  // now passed through
// ---- game.itemUse ----
itemUse.applyFun( def, k = 1, { repeat, fallback } )  // no allocation
itemUse.funDamp( key, seconds, stamp = false ) -> 0.15..1
itemUse.lightNear( r = 8 ) -> bool  // carried light on, hands / gun / headlamp light, placed 'light' placeable lit, flare or chemlight on the ground within r
itemUse.canSee()  // day, a fire, or lightNear()
itemUse.readSpec( def )  // read field > book.skill (75 xp, 1 h, once) > cat 'book' (0.5 h, re-readable) > newspaper (0.25 h)
itemUse.read( stack, spec = null )  // spec { skill, xp, hours, once, learn } for domain verbs; refused when swimming / underwater / driving / dark / infected hunting within 12 m / panic >= 50 ('Too tense to read'); every book resumes where you stopped; a book read for fun again within 3600 s of play gives fun * 0.15..1
itemUse.xp( skill, n ), itemUse.knowledge (getter -> game.skills.known)
```

## placeables

```
Unchanged from the builder's contract (docs/ITEMS_PLAN.md "Placeables"): `addPlaceable( kind, def )` from src/game/items/placeables/registry.js (also re-exported by src/game/items/Placeables.js), kind def fields update( p, dt, game, dh ), frame( p, dt, game ), actions( p, game ) -> [ { label, run, hold? } ], label, sub, model, show, check( pos, game, spec, A ), onPlace, onRemove, serialize, load, outdoors, soft, solid, solidBox, place: { time, gerund, sound }. Record { id, kind, item, pos, yaw, stack, data, born }, saved in save.world.placeables.

Added in this review:
- Kind / item spec field `water: true | 'only'` (may stand in water / must; refusal reasons 'In water', 'Needs water').
- `check( pos, game, spec, A )`: `A.floor` is the physics box under the ghost (a floor, a table) or null on open ground.
- `game.placeables.beginPlace( stack, { kind, keep, item, name, spec, hole } )`: keep = the stack is a tool that makes the thing and stays yours; item = the made thing's id; name = what the prompt calls it; spec = extra placement fields (verb, gerund, time, soft, outdoors, water, stamina, wear, doneSound). Placing also works for a stack in the container on screen.
- `game.placeables.placeFrom( stack, spec, pos, yaw, box )`, `_has( stack, box )`, `_takeOne( stack, box )` (one unit out of wherever it is; the rest stays put).
- `src/game/items/placeables/fx.js`: `itemModel( def )` (the item as the world items draw it, merged per material), `addFootprint( obj, r )` (the ghost's ground ring).
- `src/game/items/placeables/merge.js`: `compact( root )` (merge a model's static meshes per material in place; userData.fx / userData.keep parts left alone), `countMeshes( obj )`.
- `src/game/items/placeables/stash.js`: `ageStored( game, items, dh, k )` (food spoilage for stored items).
- Light-pool sources from placeables carry `dim` (outdoors by day 0.12, else 1).
```

## sites

```
game.sites (src/game/items/Sites.js). Unchanged from the builder's API except where noted:
  reveal( kind, near = player.pos, maxR? ) -> site | null
  find( kind, near = player.pos, maxR = kind === 'heli_crash' ? 6000 : 1500 ) -> site | null      // CHANGED: maxR is now honoured for helicopters
  readStash( stack ) -> { key, x, z } | null
  supplyDrop( pos?, { alt } ) -> drop | null
  dig( site )
  debugPlace( kind, pos, { yaw, seed, extra, items } ) -> site      // items: false leaves it bare until it is shown again
  near( pos, r = 250 ) -> [ site ]
  obstacles( x0, z0, size ) -> Float32Array | null
  lift( x, z ) -> metres                                          // NEW: height of the paved surface above the terrain: sidewalk top 0.2 (from roads.net street segments), road or lot 0.07, else 0
  stats() -> { built, queued, items, tris, draws, plans, drops, beacons }
  state: SiteState { taken, used, dug, gen, take, use, usable, dig, isDug, prune }   // prune also drops body-search records ':b<n>' older than 240 h
A site's dead: zb.lootItems() -> the same item array each time it is shown (body key = siteKey + ':b' + index; recorded in state.used).
Layout F spots (sites/layout.js): { act, x, z, h, r, box? } — box: [ hx, hy, hz ] in the site's frame (helicopter Salvage uses it); prompts carry owner = the site.
sites/plan.js (Node-safe): adds heliAt( env, I, J ), stashAt( env, I, J ) (memoised on env.memo, shared with the runtime). planCell keeps each footprint inside its own cell and clear of the 3x3 neighbours' road scenes, helicopter wrecks and stashes. Lot class: only body and roadside. Town class: FEMA camp in parks; open class: FEMA camp near towns.
sites/kit.js: Kit.build( name ) unchanged; NEW Kit.begin( name ) / Kit.step( until ) -> done / Kit.end() -> { group, boxes, tris } (same output as build, merged a few parts per call).
Streaming ranges: props built within 240 m; fema_camp, checkpoint and military_checkpoint within 380 m; dropped 40 m further out. Loot and bodies within 120 m, one site per frame; cleared past 145 m. Build budget 4 ms per frame.
```

