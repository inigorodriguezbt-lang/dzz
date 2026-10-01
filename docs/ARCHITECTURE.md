# Deadtide — architecture and module contracts

Browser survival game (DayZ / Project Zomboid inspired, GTA-scale open world) set on a scaled replica of all
eight Hawaiian islands. Three.js r186 (`three`, WebGL2 `WebGLRenderer`), Vite, Web Workers. Visual style after
Tidewater (https://github.com/dgreenheck/tidewater, MIT): realistic tropical light, ACES, glassy dark UI.

Run: `npx vite --host 127.0.0.1 --port <port>` then open `http://127.0.0.1:<port>/?quick=1&mode=creative&at=X,Z&yaw=DEG&hour=H`.
`?quick=1` skips the menus and drops you into a creative test world at world coords X,Z. `&frames=N` stops the loop
after N frames (for headless screenshots). Headless screenshot: `node test/shot.mjs "<url>" out.png 1000`
(Playwright + SwiftShader: slow, ~1-5 fps, but correct). `node test/probe.mjs "<url>" "<js expr>" [out.png]`
evaluates JS in the page after boot (`window.__app`, `window.__app.game`).

## World frame and scale

- +x east, +z south, +y up, metres. Sea level y = 0. Origin = centre of the chain. World ≈ 76 km × 51 km.
- Real geography at 1:8 horizontal, 1:6 vertical (coastal plains lifted a little). Objects (people, cars,
  buildings, roads) are real size.
- Yaw convention everywhere = three.js `rotation.y`. Forward for yaw θ is (-sin θ, 0, -cos θ).
- Baked data: `public/data/world.json` (islands, cities, roads, streets, runways, buildings, labels) and
  `public/data/terrain.bin.gz` (heights + surface maps). The bake is `tools/bake/*` (don't rerun it unless asked).
- `world.meta` = parsed world.json. `world.meta.buildings = { fields: [x, z, w, d, angle, base, lo, type, floors, city, style], data: [...] }`
  — 11 numbers per building. `angle` is the BAKE angle (local x → (cos a, sin a) in xz), so three.js yaw = -angle.
  Building front (street side, door side) faces local -z. `base` = floor height (top of plinth), `lo` = lowest
  ground under the footprint. `type` codes are in `tools/bake/cities.mjs` (BT). `city` indexes `meta.cities`.
- `meta.roads[i] = { lanes: 4|2|1, w (width m), name, pts: [x, z, y, x, z, y, ...] }` (lanes 1 = dirt/rural).
- `meta.streets[i] = [ cityIndex, ax, az, ay, bx, bz, by, width, sidewalk ]` (city grid streets, segment per block edge).
- `meta.runways[i] = { x, z, angle (bake angle), len, w, y }`. `meta.cities[i] = { name, id, kind, island, x, z, angle, pu, pv, street, walk, radius }`.

## Core objects (read, don't rewrite — ask in your report if you need a core change)

- `src/main.js` App: `app.settings`, `app.input`, `app.renderer`, `app.audio`, `app.saves`, `app.world`, `app.game`, `app.ui`.
- `src/game/World.js` World: `scene`, `camera`, `hf` (HeightField), `pool` (WorkerPool), `terrain`, `sky`, `ocean`, `sun`,
  `meta`, `isIndoors(pos)` (set `world.indoorTest = fn` to provide it), `isBeach(x,z)`.
- `src/world/HeightField.js`: `hf.heightAt(x,z)` (the ground players walk on), `hf.baseHeight`, `hf.normalAt(x,z,out)`,
  `hf.surfaceAt(x,z) -> [moisture, lava, redSoil, landUse]`, `hf.flagsNear(x,z)` (FLAG bits ROAD 1, DIRT 2, STREET 4,
  RUNWAY 8, BUILDING 16, CITY 32, FIELD 64), `hf.islandAt(x,z)`, `hf.raycast(...)`. Importable in workers.
- `src/game/Game.js` Game: `game.world, scene, camera, hf, physics, entities, player, survival, actions, interact,
  weather, events, audio, settings, input, mode ('survival'|'creative'), save, time ({hours, dayMinutes}), hour, day`,
  `game.register(system)` → `system.update(dt)` each frame; optional `system.serialize(save)` / `system.load(save)`
  (write your state into `save.world.<yourKey>`), `system.dispose()` on quit. `game.toast(text, kind)`,
  `game.give(id, qty)`, `game.dropStack(stack, pos)`, `game.spawnables[name] = { spawn(pos, {yaw}) , desc, distance? }` (for /summon),
  `game.inputActive` (true while the player controls the character).
- `src/game/Physics.js` (`game.physics`): yaw-rotated boxes: `add({x,y,z,hx,hy,hz,yaw,mat,kind,owner})` returns the box,
  `remove(box)`, `removeOwner(owner)`, `update(box)` after moving it, `near(x,z,r)`, `ground(x,z,y,step,r)`,
  `ceiling(...)`, `resolveCylinder(pos,r,h,step)`, `raycast(o,d,maxT,{filter})` → `{t,point,normal,kind:'box'|'ground'|'water',box,mat}`,
  `raycastBoxes`, `lineOfSight(a,b)`, `waterLevel(x,z)`. Box `mat` drives impact sounds / FX: concrete, wood, metal, glass, rock, dirt, foliage, flesh.
- `src/game/Entities.js`: `Entity` base (pos, vel, yaw, radius, height, health, alive, object (Object3D), `update(dt)`,
  `damage(amount, {source, zone, dir, kind, weapon})`, `hitTest(o,d,maxT) -> {t, zone}`, `die()`, `dispose()`),
  `game.entities.add(e)`, `.remove(e)`, `.near(pos, r, type)`, `.raycast(o, d, maxT, exclude)`, `.ofType(type)`.
  Entity `type` strings: 'zombie', 'animal', 'npc', 'vehicle', 'item', 'projectile', 'corpse'.
- `game.events` (`src/core/Events.js`): 'noise' {pos, radius, source, kind} (gunshots, footsteps, doors, engines, glass;
  zombies listen), 'damage', 'kill' {target, source, weapon}, 'toast', 'chat', 'playerDeath', 'start', 'quit'.
- `src/game/Player.js`: `player.pos` (feet), `eye`, `yaw`, `pitch`, `stance`, `lookDir()`, `vehicle`, `recoil` (Vector2 kick:
  x = pitch rad, y = yaw rad, added to aim and decays), `shake`, `aimFov` (FOV multiplier), `inventory`, `swimming`, `underwater`.
- `src/game/Survival.js` (`game.survival`): `hurt(amount, kind, {dir, zone, cause})` kinds bite/scratch/bullet/melee/fall/burn/explosion/vehicle/animal,
  `eat(stack)`, `drink(def, litres, liquid)`, `medicate(def)`, `useStamina(n)`, `stamina`, `health`, … and the moods
  (`boredom`, `stress`, `unhappy`, `panic`, `mood( deltas )`: see "Mood and skills").
- `src/game/Inventory.js`: `player.inventory` (PlayerInventory): `equip` (slot → stack), `weapons` (primary/secondary/sidearm/melee → stack),
  `pockets`, `hands` (uid of the held stack), `hotbar` (9 uids), `containers()`, `add(stack)` → leftover qty, `remove(stack)`,
  `consume(id, n)`, `count(id)`, `find(pred)`, `findUid(uid)`, `heldStack()`, `hasTool(kind)`, `changed()` (call after edits → UI refresh).
  World containers are plain `{ key, label, capacity, items: [stacks], kind }`; open one with `game.app.ui.openContainer(container)`.
- `src/game/items/ItemDB.js`: item definition schema (read the header), `defineItems([...])`, `getItem(id)`, `makeStack(id, qty, {loot, full, rnd})`,
  `stackWeight`, `ammoOf`, `displayName`, `condLabel`. Stacks are plain JSON `{ uid, id, qty, cond, data }`.
- `src/game/Actions.js` (`game.actions`): `start({label, time, onDone, onCancel, cancelOnMove, sound})`, `busy`, `cancel()`, `progress`.
- `src/game/Interact.js` (`game.interact`): `addProvider((ray, maxDist) => [{ t, label, sub?, action(), hold?, id, owner?, ownerBox?, noOcclusion?, reach? }])`.
  Each frame the closest candidate becomes the F prompt. `id` must be stable per target.
- `src/audio/Audio.js` (`game.audio`): `play(name, {pos, vol, rate, ref, max, bus, detune, lowpass})`, `loop(name, {pos, vol}) -> {set(vol, rate, pos), stop()}`,
  `footstep(surface, vol)`. Sound names: recorded (surf_*, step_*, splash, gull …) and procedural (see `SYNTH` keys in
  `src/audio/Synth.js`: gun_pistol, gun_rifle, gun_sniper, gun_shotgun, gun_smg, gun_lmg, gun_magnum, gun_revolver, gun_supp,
  gun_supp_pistol, gun_supp_sniper, dryfire, mag_out, mag_in, bolt, pump, shell_in, casing, swing, swing_heavy, hit_flesh, hit_blade,
  hit_wood, hit_metal, hit_concrete, ricochet, whiz, headshot, z_groan1-4, z_alert, z_scream, z_attack, z_die, z_step, door_open,
  door_close, door_locked, door_break, container_open, glass, explosion, engine_car, engine_truck, engine_boat, rotor, horn, crash,
  engine_start, boar, chicken, goat, deer, growl, eat, drink, bandage, zipper, pickup, drop …). You may add generators to
  Synth.js only if you own it (nobody does now: add new sounds in your own module with `audio.buffers.set(name, AudioBuffer)`).
- `src/render/Materials.js`: EVERY lit material must go through `patchMaterial(mat, uniqueKey, extraFn?)` (aerial-perspective fog that matches
  the sky, cloud shadows, rain wetness). `uniqueKey` must be unique per distinct shader source. `tex(name)` loads
  `public/textures/<name>.jpg` (names: `<material>_d` diffuse sRGB, `<material>_n` normal; see World.js TEXTURES list:
  sand grass drygrass forest reddirt dirt rock cliff lava snow farm asphalt sidewalk stucco plaster beige bluewall panels planks
  oldplanks brick tinroof roof greyroof bitumen woodfloor tiles carpet concrete metal rust palmbark bark fabric),
  `tex('grass_n', { srgb: false })` for normal maps. `canvasTexture(w, h, drawFn)`. Shared uniforms `G` (uTime, uCamPos, uSunDir,
  uSunColor, uWind, uWet, uNight...) — add them to your ShaderMaterials with `Object.assign(uniforms, G)` and use `COMMON_GLSL`
  (noise, `atmosphereFog(col, worldPos)`, `cloudShadowAt(wp)`).
- Render layers: layer 0 = opaque world (drawn into the HDR scene target, casts/receives the sun shadow). Layer 1
  (`LAYER_POST`) = transparent things drawn after the water composite (glass, particles, water). Set `mesh.layers.set(1)`
  for transparent meshes. The first-person view model goes into `game.viewScene` (own camera `game.viewCamera`).
- Shadows: cascaded sun shadow maps, spheres around the camera (10 / 60 / 450 m on high; render/Shadows.js), one cascade
  re-rendered per frame. Set `castShadow` / `receiveShadow` on your meshes; every caster is drawn into each cascade its
  bounds touch, so keep casters cheap (a low LOD, no tiny props far out). Alpha-tested foliage: `material.alphaTest` +
  `side: DoubleSide` works in the shadow pass too. `patchMaterial( m, key, extra, { pcf: true } )`: the 5-tap PCF instead
  of the contact-hardening search on the near cascade (thin, many-layered surfaces such as grass blades).
  `world.csm.lastOnly` (a Set): casters drawn into the widest cascade only (the far building shells).
- Small lights: never add a Point/SpotLight to the world scene (every lit pixel pays for every light, lit or dark, and adding
  one recompiles every lit material). `world.lamps.addPoint( pointLight )` / `addSpot( spotLight, priority )` take your
  light as a proxy (not in any scene; set its position / colour / intensity / distance as usual, `remove( light )` on
  dispose); each frame the three strongest lit points near the camera and the highest-priority lit spot get the real
  lights (render/Lamps.js). Night sources go through `game.itemLights` (LightPool) as before.
- Memory: static geometry nothing reads back: `releaseArraysOnUpload( geometry )` (render/Materials.js) drops the CPU
  copies once uploaded (set bounds first); a canvas drawn once: `canvasTexture()` / `releaseCanvasOnUpload( texture )`.
  Canvases read on the CPU (getImageData, toDataURL, drawn into a read canvas) need `getContext( '2d', { willReadFrequently:
  true } )`: a GPU canvas makes each read a synchronous GPU readback. The terrain buffer is a SharedArrayBuffer when the
  page is cross-origin isolated (vite.config.js headers): don't write to `hf.buffer`.
- Web Workers: `world.pool.submit({ type, ...args }, priority)` returns a job with `.promise`. Worker handlers live in
  `src/workers/world.worker.js`; the worker has `hf` (HeightField) and `world` (meta subset: cities, roads, streets, runways, buildings).
  To add a handler, put your function in your own module file and add ONE line to the handlers map in the worker
  (the only shared-file edit allowed; keep it to that one line, it is merge-safe).
- Performance targets: 60 fps on a mid-range desktop GPU. Instance everything repeated, merge static geometry per cell,
  stream by distance (`settings.get('renderDistance')` in metres, `settings.get('vegetation'|'quality'|...)`),
  keep draw calls low (a few hundred), avoid per-frame allocations in hot paths, dispose what you unload.
- Code style: tabs, spaces inside parentheses `fn( a, b )`, ES modules, `import * as THREE from 'three'`, comments that say why.
  No external runtime dependencies beyond `three` (addons from `three/examples/jsm/...` are fine). All assets are procedural or
  CC0/MIT files already in `public/`. You may download more CC0 assets (Poly Haven, ambientCG, Kenney) if essential, keeping sizes small.

## Module ownership (each builder owns only these files)

| Module | Files | Handle |
|---|---|---|
| Vegetation | `src/world/Vegetation.js`, `src/world/vegetation/*`, `src/world/scatter.js` | `game.vegetation` |
| Roads & street furniture | `src/city/Roads.js`, `src/city/roads/*`, `src/world/streetgen.js` | `game.roads` |
| Buildings & interiors | `src/city/Buildings.js`, `src/city/buildings/*` | `game.city` |
| Items, loot, crafting | `src/game/items/*` (except ItemDB.js core API), `src/game/items/defs/*` (not firearms.js), `src/render/ItemModels.js`, `src/render/Icons.js`, `src/game/Crafting.js` | `game.items3d`, `game.crafting` |
| Weapons & hands | `src/weapons/*`, `src/game/items/defs/firearms.js`, `src/render/FX.js` | `game.hands`, `game.fx`, `game.ballistics` |
| Creatures | `src/ai/*` | `game.creatures` (`game.zombies`, `game.animals`) |
| Vehicles | `src/vehicles/*` | `game.vehicles` |
| UI, commands, core | everything else (lead) | `game.app.ui`, `game.commands` |

Each module file `src/.../<Module>.js` exports `install(game)` (listed in `src/game/modules.js`).

## Cross-module APIs (implement yours exactly; call others defensively with `?.` since they land in parallel)

- Items (`game.items3d`): `drop(stack, pos)` (player drops, physics settles it, persistent), `spawn(stack, pos, {yaw, key, persistent})`
  → WorldItem entity, `remove(worldItem)`, `near(pos, r)`. Item pickup interaction provider (look at item, F: "Take <name>"),
  instanced rendering of item models on the ground/shelves within ~40 m. Saves dropped items in `save.world.items`.
  `rollLoot(table, rnd, n)` in `src/game/items/Loot.js` → stacks. Tables (at least): house_kitchen, house_living, house_bedroom,
  house_bathroom, house_garage, fridge, grocery, convenience, pharmacy, medicine_cabinet, hospital, clinic, police, police_locker,
  gunstore, gun_safe, military, military_armory, military_locker, hardware, toolbox, clothing_store, wardrobe, sports, surf, restaurant,
  restaurant_kitchen, bar, fastfood, office, desk, school, fire_station, warehouse, garage_shop, hotel_room, gas_station, church, bank,
  post, pawn, market, hangar, farm, beach, street, car_trunk, car_glovebox, zombie_civilian, zombie_police, zombie_military,
  zombie_medic, zombie_tourist, trash, observatory.
  `src/render/ItemModels.js`: `registerModelBuilder(type, fn)`, `buildItemModel(def)`. `src/render/Icons.js`: `iconFor(itemId) -> Promise<dataURL>`
  (rendered from the 3D model, cached) and `iconSync(itemId) -> dataURL|null`.
  Crafting (`game.crafting`): `recipes` list `{ id, name, out: [id, qty], in: [[id, qty]...], tools: [kinds], time, station?: 'fire' }`,
  `canCraft(recipe)`, `craft(recipe)`.
- Weapons (`game.hands`): owns what the player holds and the view model: `select(stack)` / `selectSlot('primary'|...)`, `holster()`,
  `aiming` (bool), `adsSensitivity()`, `viewFov()`, `use(stack)` (consume food/drink/medicine from the inventory UI, starts timed actions),
  `reload()`, handles fire/aim/reload/melee/throw/fire-mode/flashlight input itself in its `update(dt)` when `game.inputActive`.
  Ballistics: bullets hit `game.entities.raycast` then `game.physics.raycast`; call `entity.damage(dmg, {source: player, zone, dir, kind:'bullet', weapon})`;
  emit 'noise' for shots. `game.fx`: `impact(point, normal, mat)`, `blood(point, dir, amount)`, `muzzle(...)`, `tracer(a, b)`, `explosion(pos, r)`, `fire(pos)`.
  `game.ballistics.fire(origin, dir, {damage, velocity, pellets, spread, source, weapon})` usable by NPCs too.
- Creatures (`game.creatures`): zombie + animal entities, spawning around the player (by zone: city density, military, wilderness),
  AI reacting to 'noise' events and sight, attacking the player (`game.survival.hurt`), vehicles (`vehicle.damage`), breaking doors
  (`game.city?.doorAt?.(pos)` → `door.bash(amount)`). Corpses are lootable (a container interaction). Registers /summon names: zombie,
  zombie_runner, zombie_police, zombie_military, zombie_crawler, zombie_brute, boar, chicken, goat, deer, shark, nene, bandit.
  Saves kill counts per cell in `save.world.killed`.
  Summon names: zombie, zombie_runner, zombie_police, zombie_military, zombie_crawler, zombie_brute, zombie_civilian, zombie_tourist, zombie_medic, zombie_firefighter, zombie_horde, boar, chicken, goat, deer, cow, nene, shark, turtle, bandit, bandit_group. `game.zombies`: list, count, spawn( type, pos, opts ), horde( pos, n ). Closed doors are physics boxes with kind 'door'; `game.city.doorAt( pos, r )` returns a door with `bash( amount, { source, kind } )` — the AI routes through closed doors and pounds on them.
- Buildings (`game.city`): besides the baked `meta.buildings`, `src/city/buildings/infill.js` deterministically appends street-facing infill lots (towers downtown and in Waikīkī, shops and houses elsewhere) at startup, identically on the main thread and in workers. `game.city.relocate( pos )` must be called after teleporting (it streams the storey in before collisions apply). Doors: `doorAt( pos, r )` → door with `bash( amount, { source, kind } )`.
- Items (`game.items3d`, `game.itemUse`): `itemUse.actions( stack )` returns `{ verb, note, label, run }` (label keeps the
  bracket form 'Eat (3/3)' that the inventory splits; verb/note are the parts). `items3d.remove( item, { taken, stack } )`
  (stack = what was actually taken, for partial pickups); `items3d.claim( item )` marks a loot spot looted when an item on
  the ground is changed in place (eaten, opened, cooked) and swaps building loot for a saved twin. Items draw out to
  10–55 m by size (`drawRange`). recipes.js exports `POT_COOKED`; Loot.js `PERISHABLE_H` (food keeping ≤ 72 h rolls rotten).
  `ItemDB.canMerge` refuses opened cans, part-eaten food and lit chemlights.
- Creatures: `game.zombies.count()` counts the living only. Door boxes' `owner` exposes `broken` and `isOpen`; zombies bash
  only closed doors. Run-over damage belongs to the vehicles module when `game.vehicles.handlesImpacts` is true (creatures
  only fall back when it isn't). Bullet damage info carries `pellet: true` for shotgun pellets (kind stays 'bullet').
- Vegetation: 23 species (ids 18–22 added: driftwood, fallen nuts, fallen fronds, monstera, elephant ear). The grass
  layer is `vegetation/GrassField.js` (Tidewater's clumped blades, drawn from camera-centred ground data in
  `vegetation/GroundData.js`, not per-cell instances); beach pebbles, shells, sea glass and pumice are
  `vegetation/PebbleField.js`. The worker's per-cell scatter transfer has 6 entries. `game.vegetation.rebuildObstacles()`
  (alias of `_buildObstacles()`) is called by Buildings after it appends infill lots, so trees stay off them.
- Roads (`game.roads`): city street grids are fitted to the baked street ends (`network.js` fitFrames; the baked
  city angles are rounded to 0.01 rad, too coarse to place streets). Parking lots: `roads.lots`, `roads.lotAt( x, z )`,
  `roads.lotObstacles()` (Float32Array, 5 per lot: x, z, half-length, half-width, angle — the buildings' angle
  convention); vegetation keeps off them. `spawnPoints( center, radius, n )` includes parking stalls.
- Vehicles (`game.vehicles`): drivable entities (type 'vehicle'), `enter(v)`, `exit()`, `seatInteraction()`, camera while driving
  (sets game.camera), fuel / damage / lights / horn, trunk container, `damage(amount, info)`. /summon names: sedan, pickup, jeep, suv,
  police_car, van, sports_car, bus?, motorbike?, boat, speedboat, fishing_boat, jetski, helicopter, plane?. Spawns parked / abandoned
  vehicles near roads, harbours and airports; saves them in `save.world.vehicles`.
- City (`game.city`): `types()` (building type names for /locate), `locate(type, pos) -> {name, x, z}`, `doorAt(pos, r)`, `isIndoors(pos)`
  (also set `game.world.indoorTest`), interaction providers for doors and containers, loot spawn state in `save.world.looted/containers/doors`.
- Roads (`game.roads`): meshes for highways, streets, sidewalks, runways, markings; street props; wrecked cars (static, some lootable
  trunks via `rollLoot('car_trunk')` + `ui.openContainer`), colliders for props.
- UI (`game.app.ui`): `openContainer(container)`, `openInventory()`, `toast`, `showDeath(info)`; icons come from `src/render/Icons.js`.

## Combine (item-on-item mixes)

Drag item A onto item B in the inventory (either way round), or pick "Combine ›" in an item's right-click menu (it
lists every partner among what you carry, the open container and the ground the screen shows; ones that can't run
yet are greyed with the reason). Several mixes for one pair (rags onto sticks: a fire kit or a splint) open a chooser
at the drop that says what each uses up ("2× Rags, 2× Sticks") and greys the ones that can't run yet ("Need 0.1 L
gasoline"). A refused mix on a cell says why in red and takes the drop; on a hotbar key the drop still binds. Ammo
into magazines, magazines into guns, attachments and merges keep precedence over mixes.

- Data, Node-safe: `src/game/items/combos.js`. Domains register from their def files:
  `import { addCombos } from '../../combos.js'; addCombos( [ { id, verb, a, b, use, liquid, out, repair, wear, tools,
  station, time, sound, label, check, run } ] )`. The format, matcher forms and unit rules are documented at the top
  of the file and in docs/ITEMS_PLAN.md ("Combos"). Beyond the plan: `label` takes `{a}` / `{b}` placeholders (or a
  function); `id`, `tag`, `cat` and `tool` matchers take arrays (any of them) and an array matcher means `any`; `out`
  may be a bare id; `time` may be `fn( ctx )`; `use` may say its unit (`{ qty | portions | uses: n }`); `check` may
  return `{ reason, soft: true }`; extras `skill`, `xp`, `fun`, `noise: { radius }`, `progress`. Every id a combo
  names must exist (test/combos.mjs checks); a combo whose output is missing at runtime is skipped with a warning.
- Units: a plain `n` is a use for items with `tool.uses` / `medical.uses` (duct tape, antiseptic, a lighter), a portion
  for drinks with `portions > 1` (a shot of rum; the last shot leaves `drink.container`), else one of the stack (a
  battery, a nail — also drawn from other carried stacks of the same id; the unit used takes its per-unit state, so
  the next can of a stack is closed). `{ qty: 1 }` is one whole unit however full (a bottle of rum into a molotov).
  `'all'` is the whole stack, `0` keeps it.
- Liquids: `liquidIn( stack )` → `{ kind, litres, cap, fuel }` for water containers (`tool.liquid`; kind null when
  empty) and gasoline / diesel cans (`fuel`). Kinds: water, dirty, sea, fuel, or `'any'` / a list in matchers.
- Runtime: `game.combine` (`src/game/items/Combine.js`, no three.js): `find( a, b )` → `[ { combo, a, b, label,
  state } ]`, `accepts( dragged, target )` (the inventory's drag verb: `{ ok, verb, matches, refused }`, `{ ok: false,
  reason, combo: true }` or null), `partners( stack )` → `[ { combo, other, a, b, verb, label, ok, reason } ]` (one row
  per combo and partner id: the partner that needs it most), `state( combo, a, b )` → `{ ok, reason?, soft? }`,
  `cost( combo, a, b )` → "2× Rags, 4× Sticks" or null, `run( combo, a, b )`. Run order: checks (units, "Empty it
  first", tools via `provides()`, `station: 'fire'` via `game.nearFire`, `check`) → a `game.actions` progress action
  (creative shortens it; the action carries `combo: { id, a, b }` so the inventory draws progress on both cells) →
  re-check (nothing happens if you died or respawned meanwhile) → liquid → repair (+6 % per skill level, capped at
  `repair.max`) and wear → use (through `game.itemUse` where / discard / consumeOne / splitOne / transform, so a stack
  is used up wherever it lives) → `out` (inventory, else `game.dropStack` with "No room, dropped"; the HUD pickup row
  shows it when the screen is closed — no `'item:pick'`, it is not loot) → `run( ctx )` → a side that became the
  output hands its hotbar key and the hands to it (a bat into a nailed bat) → xp, mood, noise, a toast for repairs,
  and a `'combine'` event `{ id, a, b }`. Soft refusals (a repair at its cap, liquids that don't mix) are not offered
  in menus and are not a drag target, so moving a bottle past other bottles still drops into the section.
- `ctx`: `{ game, inv, combo, a, b, A, B, use (game.itemUse), survival, player, skills, used: { a, b }, made: [ new
  stacks ], consume( stack, n ), give( id, qty, data ), replace( stack, id, data ), toast( text, kind ), sound( name ),
  pour( from, to, litres ), draw( stack, litres ), liquid( stack ) }`. `replace` turns one unit into another item where
  it lies (same uid, slot and condition); what a bag or pocket held stays in it as far as it fits, the rest goes into
  your other bags (jeans cut into shorts keep what fits).
- Battery devices may set `tool.cell` (default `'aa'`): the base `insert_batteries` combo only feeds AA devices, so a
  domain adding D cells or 9 V adds its own combo.
- Tests: `node test/combos.mjs` (registry ids, matchers, orientation, partners, consumption, liquids, outputs, repair
  caps, refusals, tools and station, the timed action, death and respawn mid-action, a save → load round trip, the
  hotbar hand-over, the chooser's cost line).

## Placeables (things put down in the world)

An item with `place: { kind, … }` gets a verb in its menu (`placeables/verbs.js`: Place, Set, Pitch, Lay out, Plant,
Rig — `place.verb` overrides); any bag or box with room (`cat: 'backpack'` or `container.capacity`) gets "Stash";
planks get "Barricade door" at a closed door. The verb starts the placer: a translucent ghost of the placed model at the
crosshair on the ground (green, or red with the reason: Too far, In water, Needs water, Too steep, Blocked, Too close,
Outdoors only, Needs open sky, Needs soft ground), the wheel or R turns it, the left button or F puts it down (a short
timed action), the right button, Esc or walking off cancels. While placing, the placer reads fire / aim / interact /
reload and the wheel first (systems update before the hands) and removes them from that frame's input. Placing works
from the inventory, the ground or the container on screen (a shelf, a trunk: remembered when the screen closes); one
unit of a stack is placed and the rest stays where it was.

- Runtime: `game.placeables` (`src/game/items/Placeables.js`, a content module after WorldItems):
  `beginPlace( stack, { kind, keep, item, name, spec } )` (keep: the stack is a tool that makes the thing and stays
  yours, as a shovel digs a hole; item: the made thing's id; spec: more placement fields such as verb, gerund, time,
  soft, outdoors, water), `add( kind, stack, pos, yaw, data, item ) -> p` (onPlace runs when data is null),
  `remove( p, { give } )`, `refresh( p )` (rebuild the look after a state change), `near( pos, r, kind )`,
  `byDoor( key )`, `list` (Map). Helpers for kinds: `vec( p )`, `give( stack )`, `timed( label, time, sound, onDone )`,
  `sound( p, name, vol )`, `loop( p, name, vol, ref )` / `stopLoop`, `noise( p, radius, kind )` (a 'noise' event the
  infected hear), `light( p, { color, intensity, range, flicker, lift } | null )` (a `game.itemLights` source),
  `pickUpAction( p, { label, time, check, before } )`, `hold( p )` / `release()` (a trap holding the player: speed 0
  through a wrapper on `survival.moveModifiers`).
- Records: `{ id, kind, item, pos: { x, y, z }, yaw, stack, data, born }`, saved in `save.world.placeables`
  (`registry.js` serializeRecord / loadRecord; fields starting with `_` are runtime only). Records of a kind nobody
  registered are kept aside and saved again. Each is drawn as a few meshes (its kind's `model()`, else the item model
  as the world items draw it, `fx.itemModel( def )`; placed shapes from `placedModel()` are merged per material once,
  `placeables/merge.js`: 1–5 draw calls a thing), hidden past 70 m (180 m for tents and barrels); a tent or a barrel
  adds a physics box. Lights go through `game.itemLights`, dimmed outdoors by day (`src.dim`).
- Kinds: `addPlaceable( kind, def )` from `placeables/registry.js` (Node-safe). def: `update( p, dt, game, dh )` (dt real
  seconds, dh game hours; 4 Hz within 60 m, every 2 s beyond), `frame( p, dt, game )` (every frame within 90 m),
  `actions( p, game ) -> [ { label, run } ]`, `label( p )`, `sub( p )`, `model( p )`, `show( p )` (after each build),
  `check( pos, game, spec, A )` (a placement reason; `A.floor` is the box under the ghost or null), `onPlace`,
  `onRemove`, `serialize`, `load`, `outdoors`, `soft`, `water` (true: may stand in water, `'only'`: must — a fish
  trap), `solid`, `solidBox`, `place: { time, gerund }`. F on a placed thing: a tap runs the first action, holding F
  (0.4 s) opens the list as a popover at the crosshair (number keys pick). The prompt is rebuilt when the record
  changes (`refresh`, an action), the inventory changes, or every quarter second. A barricaded door shows its planks'
  prompt instead of the door's; from the far side it reads "Open · Barricaded" and stays shut.
- Base kinds (`placeables/*.js`, numbers in `placeables/logic.js`):
  - `light`: lanterns, chemlights, torches, candles, tiki torches; burn down in game hours; rain puts out open flames.
  - `noise`: the alarm clock (set 20 s / 1 min / 3 min, rings 45 s, noise radius 50 every 2 s) and the radio (playing,
    radius 32 every 4 s, drains its batteries; the emergency radio cranks).
  - `collector`: rain barrel (120 L) and a rigged tarp (30 L, three times the catch) fill with `weather.rain` (none
    under a roof); F fills a carried container, drinks, tips out; stale (dirty) after 72 h without rain.
  - `trap`: wire snares catch a feral chicken, a mongoose (not on Kauaʻi) or a rat over game hours — likelier far from
    towns, in moist ground, at dawn and dusk, with bait, never while the player is within 20 m; the catch rots after a
    day. Spring traps snap on the first leg (zombie 45 leg damage and held 25 s, animal 70, the player 28 + a 35 %
    broken leg and held until "Pry open" is held), loud (noise 22). Whoever sets one can step off it; it arms once
    they are clear.
  - `stash`: a bag or tote whose contents stay in the item; with a shovel it is buried in soft ground (a mound) and
    dug up again. A shovel's "Dig stash" makes a bare hole (20 volume, `data.items`) that is filled in once empty.
    Food left in a stash, hole or tent goes off in game hours (`ageStored`; a cooler bag slows it).
  - `shelter`: a pitched tent (sleep, 40 storage) or a laid-out sleeping bag.
  - `barricade`: planks + 2 nails + a hammer on a closed door, up to 4 (90 hp each); each live door's `bash()` is
    wrapped so blows break planks first; planks come off with a hammer or crowbar. Windows: no API yet.
- Items (`defs/ext/placeables.js`): alarm_clock, snare, spring_trap, rain_barrel, stash_box, candle, tiki_torch,
  raw_small_game / cooked_small_game; `place` on lantern, chemlight(_red), torch, radio, tent, sleeping_bag, tarp.
  /summon: alarm_clock, radio_playing, rain_barrel, tarp_catcher, spring_trap, snare, lantern_lit, tiki_torch,
  tent_pitched, stash_box.
- Tests: `node test/placeables.mjs`.

## Sites (outdoor loot you can see)

Small scenes in the open with their loot lying on the ground as real world items (`game.items3d.spawn` with a stable
`key`, `persistent: false`). `game.sites` (`src/game/items/Sites.js`, a content module after the items module):

- Kinds (`sites/kinds.js`): roadside (a burst suitcase, a tipped shopping cart), bus_stop (a rural shelter on the
  highways), crash_car (a car in the ditch, on its roof or side), beach_camp (towels, umbrella, cooler, chair),
  campsite (dome or ridge tent, cold fire pit, logs, a tarp), hiker (a body on a slope, trekking poles), fishing_spot
  (rod holders, bucket, chair at the water's edge), checkpoint (police: canopy, table, cruiser, barriers, tape),
  military_checkpoint (sandbag nest, GP tent, crates under camo netting, razor wire), heli_crash (a smoking Black Hawk,
  rare), fema_camp (relief tents, cots, pallets, barrels, porta-potties, near towns), farm_stand (a fruit stand with a
  roof, crates, an honesty box), picnic, body, supply_drop (an event) and stash (buried). Each has a loot table
  `site_<kind>` (Node-safe, `sites/tables.js`, imported by `defs/index.js`) that domains extend with `extendLoot`, plus
  `site_stash_rich` for treasure-map caches.
- Placement (`sites/plan.js`, Node-safe, deterministic from `game.seed`): a 96 m cell grid; each cell probes a few
  points, classes the best one (road, beach, lot, street, shore, forest, open, town: roads, `hf` flags, beaches, sea
  distance, moisture, settlements, parking lots, buildings) and maybe places a kind that fits (footprint dry, gentle,
  off buildings, off the road unless it belongs on it; roadside kinds face the road, beach kinds the sea). A footprint
  stays inside its own cell and clear of the neighbouring cells' road scenes, helicopter wrecks and stashes, so no two
  sites overlap (the coarse grids are memoised on `env.memo`, shared with the runtime). Parking lots only get small
  finds (the street generator parks cars in their stalls); FEMA camps stand in town parks, on open ground near towns
  and beside highways. The roads'
  outbreak events carry loot too: roadblock → checkpoint, checkpoint → military_checkpoint, crash → crash_car,
  jam → roadside (layouts in the event's frame, so the road module's own props stay the scene). Helicopter crashes
  (2048 m grid, about one cell in three, away from roads and towns) and stashes (384 m grid, one in two, a quarter
  rich) use coarse grids so they can be found kilometres away. Site keys: `site:<ci>:<cj>:<n>`, `heli:<I>:<J>`,
  `stash:<I>:<J>`, `drop:<id>`; item keys append the slot index.
- Layouts (`sites/layout.js`, Node-safe): props, loot slots `{ x, z, h, p, table? }` (h above the ground: a table, a
  bench, a towel), decals, bodies, effects and interactions in the site's frame. Props are built by
  `sites/props.js` / `sites/vehicles.js` into a `Kit` (`sites/kit.js`) and merged into one mesh per material per site
  (matte, plastic, paint, metal, cloth, wood, print atlas, glow, decal: a handful of draw calls, castShadow within
  110 m), with physics boxes for what you bump into or put things on. Flat cloth (towels, clothes, blankets, a
  parachute) drapes over the terrain. Props, decals and loot stand on paved surfaces: `sites.lift( x, z )` gives a
  sidewalk's top (20 cm, from the street network's segments, so before the roads' colliders stream in) or a road's
  or lot's (7 cm).
- Streaming: props within 240 m; the camps that sit on parking lots and streets (FEMA camp, police and Army
  checkpoints) within 380 m, before the parked vehicles come (360 m), so their colliders keep cars out of them. A site
  is built a few props a frame and merged a few parts a frame (`Kit.begin` / `step( until )` / `end`; 4 ms a frame),
  and dropped 40 m further out with its geometry disposed. Loot and bodies come out within 120 m, one site a frame
  (cleared past 145 m). Bodies are the creatures module's dead (`game.zombies.spawn( as, pos, { victim: true, wait:
  true } )`, kept from its corpse cleanup while shown); without it a covered body or a body bag. A body's Search finds
  the same things however often it is shown again (`zb.lootItems`: rolled once from the creatures' table for its
  kind; one searched before a save is empty until the kind's respawn). A helicopter's smoke column is emitted through
  `game.fx` out to 1.8 km (laid out already formed when it first comes into range).
- Loot state (`sites/state.js`, saved in `save.world.sites`): taken keys with the game hour (the items3d taken
  listener), back after the kind's `respawn` hours (72–240) rolled anew; stashes and drops never refill. Interactions
  used, stashes dug, drops and the next drop time are saved with it.
- Interactions (F): Light fire (campsite fire pit, becomes a `game.crafting` campfire), Salvage (helicopter: aim at
  any of the hull, a crowbar or toolbox: scrap, wire, maybe a battery), Cut parachute (a blade: tarp and rope), Break
  open (the farm stand's honesty box: cash), Dig (a stash, a shovel or pickaxe: the cache comes up around an open
  tote). A layout's spot is a sphere (`r` at height `h`) or a box (`box: [ hx, hy, hz ]` in the site's frame); the
  prompt carries the site as its owner, so the site's own colliders never hide it.
- Supply drops: every 9–22 game hours a crate on a parachute falls 350–900 m from the player (toast, "Supply drop"
  map marker, the transport overhead), lands with a thud the infected hear and burns a red smoke flare for 15 min;
  it stays 72 h.
- Stash items: `stash_note` and `treasure_map` (`stash: true`, "Read"): the first read fixes a stash 200–2600 m away
  (treasure maps prefer rich caches) in `stack.data.site` and marks it on the map; a cairn and turned soil mark the
  spot on the ground.
- API: `reveal( kind, near, maxR? )` (marks the nearest site of a kind: radios, scanners, notes), `find( kind, near,
  maxR? )` (maxR 1500 m, 6000 m for helicopters), `readStash( stack )`, `supplyDrop( pos?, { alt } )`,
  `debugPlace( kind, pos, { yaw, seed, extra, items } )` (also
  `/summon site_<kind>`), `near( pos, r )`, `obstacles( x0, z0, size )` (site footprints in the vegetation's obstacle
  layout: `world/Vegetation.js` keeps trees and shrubs off them), `stats()`.
- Preview: `test/preview/sites.html` (every kind on flat ground with a roll of its loot; `?kinds=`, `?seed=`,
  `__focus( kind, yaw, pitch, dist )`). Tests: `node test/sites.mjs` (tables, layouts, placement on a stub and on the
  real world with no overlaps, the state; and `game.sites` on a stub game: streaming and disposal, the stepwise build,
  loot keys and respawn, bodies, the prompts through the real crosshair ray, salvage, the cash box, digging, a stash
  note, a drop from the sky to expiry, a save → load round trip).

## Mood and skills

Project Zomboid's moodles, gentler. `game.survival` (`src/game/Survival.js`) and `game.skills` (`src/game/Skills.js`,
made by the Survival constructor). Tests: `node test/mood.mjs`.

- Moods, 0–100, saved in `save.survival`: `boredom`, `stress`, `unhappy`, and `panic` (a fast spike).
  `survival.mood( { boredom, stress, unhappy, panic } )` adds deltas (negative = better), clamped; it does nothing in
  creative or god mode, which keep every mood at 0.
  - Boredom grows when idle, faster indoors (16 min standing about indoors to "Bored"). Moving about outdoors, a
    vehicle, fishing and a fight ease it.
  - Stress comes from the infected near you (hunting you counts most), wounds and bites, bleeding, fever, hunger,
    thirst, pain, an unsplinted leg, and the dark outdoors at night without a light. It eases when nothing presses:
    faster indoors, by a fire, with a drink, and with sleep.
  - Panic rises while the infected hunting you are within 9 m and fades about 15 s after they're gone. Stress makes
    it come faster; kills this life dull it. Stress above 90 keeps it at the edge (up to 50).
  - Unhappiness comes from long boredom or stress, being wet and cold, pain, hunger, sickness, and rotten or raw food.
    It lifts slowly when calm, with drink, cooked food, sleep and items' `fun`.
- Effects, all read in one place: `swayMul()` (aim sway in weapons/Hands: stress and panic shake, the aiming level
  steadies), stamina regen (stress), `healMul()` (natural healing) and `sleepQuality()` (unhappiness: an unhappy
  sleep gives back less energy, "Slept badly"), `noiseMul()` (footsteps, stealth level). Panic adds a racing
  heartbeat and the HUD's dark breathing edge.
- `survival.moodles()` → `[ { id: 'stress'|'unhappy'|'bored', label, kind: 'mild'|'warn'|'bad', level: 1–4, mood: true } ]`
  (levels start at 25 / 50 / 75 / 90), appended to `conditions()`: the HUD shows them as chips with four level pips,
  the Status screen with a value and a remedy. Messages: Bored, Very bored, Stressed, Very stressed, Unhappy,
  Depressed, Panicked.
- Sleep: Survival notices Game.sleep's clock jump and applies `slept( hours )` (calmer, less bored, cheered). Reading's
  time-lapse costs `passTime( hours )` (hunger, thirst, energy).
- `game.skills`: `xp( skill, n )` → level (a level-up toasts "Fishing 3" and emits `'skill' { skill, level }`),
  `level( skill )` 0–10, `progress( skill )`, `total( skill )`, `mul( skill, perLevel )` = 1 + level × perLevel (for
  small bonuses), `knows( key )` / `learn( key )` (the old guides' flags; `itemUse.knowledge` reads them),
  `readProgress( id )`, `craftSkill( recipe )`, `list()`. Skills: fishing, survival, foraging, first_aid, cooking,
  mechanics, carpentry, tailoring, electrical, aiming, reloading, maintenance, stealth. Cumulative xp for level n:
  round( 75 · n^1.6 ) (75, 227, 435 … 2986). Saved in `save.survival.skills`; they die with the character.
  - XP already granted: fishing (catches, misses), cooking (roasting, the pot, fire recipes), first_aid (treatments),
    crafting (`recipe.skill`, else inferred from what it is made of; `R( …, { skill, xp } )` sets them), repairs
    (maintenance, or tailoring for clothes and bags), tearing rags (tailoring), purifying water (survival), firearm and
    bow hits and kills (aiming), reloads (reloading), creeping near unaware infected (stealth), foraging.
  - Bonuses already read: fishing (bites, landing), first_aid (treatment time), cooking (less food sickness), aiming
    (sway), reloading (speed), stealth (footsteps), foraging (finds), maintenance and tailoring (mend per repair).
    Combos use `skill` / `xp` themselves.
- Items: `fun: { boredom, stress, unhappy, panic }` is applied by `game.itemUse.applyFun( def, k, { repeat, fallback } )`
  on eating (per portion), drinking (per portion), medicine, reading (as the pages turn), the ukulele's Play and the
  duck's Squeeze. A domain verb that cheers calls `ctx.use.applyFun( def, 1, { repeat: seconds } )` when it's done
  (`repeat` damps a thing used again soon, down to 15 %), and grants practice with `ctx.use.xp( skill, n )`.
- Reading: `read: { skill, xp, hours = 1, once }` (`once` defaults to true when it teaches). An old guide's
  `book.skill` reads as `{ skill, xp: 75, hours: 1, once: true }` plus its flag; any other `cat: 'book'` item is a
  half-hour read for fun (the newspaper a quarter hour). Reading is a time-lapse of 12 real seconds per game hour
  (the hours pass, food spoils); xp and fun come as the pages turn; stopping keeps the place ("Read 40%"); it needs
  light (day, a fire, a light carried or set down nearby) and is refused in water, at the wheel, in a panic and with
  the infected hunting you close by, which also interrupt it. A book read for fun again within an hour of play cheers
  less. A domain verb can read anything with `ctx.use.read( stack, { hours, xp, skill } )`.
- Chat: `/skill [skill] [level]`, `/mood [boredom|stress|unhappy|panic] [0-100]` (cheats outside creative, refused in
  hardcore).

## Rendering notes (ported from Tidewater)

- Lighting is physical: Hillaire atmosphere (src/render/Atmosphere.js, src/world/Sky.js) with one energy scale, auto exposure,
  ACES + grade, bloom, GTAO, haze and sun shafts, TAA + RCAS (`antialias: 'taa'`), cascaded sun shadows with PCSS, lens flare,
  optional motion blur. Settings keys: `exposure` (EV −2..2), `ao`, `shafts`, `lensFlare`, `motionBlur`, `antialias`.
  Settings carry a `version`; the v2 migration moves a saved 80° FOV to 62 and MSAA to TAA on high/ultra.
- `CSM_FALLBACK` (Materials.js): 1×1 depth textures bound to unused shadow-cascade slots — without them shadow quality
  'medium' (2 cascades) or switching shadows off left an invalid sampler and every lit draw failed.
- `NIGHT_GAIN` (Sky.js) scales moonlight, night sky glow and night ambient (not the exposure), so lamps and emissives tuned
  for night exposure stay put.
- `world.handVis`: sun visibility at the hands (cascade, cloud and hill shadow, read back asynchronously) — dims the
  first-person arms in shade. The view scene uses the world's key light and environment map rotated into camera space.
- `Game.grade().exposureBias` is only the indoor factor (1.35, eased ~0.5 s); World resets auto exposure on teleports
  (>80 m in a frame) and time jumps (>0.25 h).
- Title vistas all use hour 18.25 and hold the clock, matching the loader key art (public/ui/keyart.jpg).
- FX that must not ghost under TAA (tracers, sparks, muzzle flashes) go on `LAYER_OVERLAY` (Renderer.js), drawn after
  the TAA resolve.
- Anything that moves on its own in the world scene (creatures, vehicles, thrown things, door leaves) needs motion vectors
  for the TAA, or it ghosts / turns see-through while the camera holds still: `setDynamic( object )` (render/post/Motion.js)
  once on its root (skinned meshes use their bones; an InstancedMesh must keep each thing in the same slot). Alpha-blended
  layer-1 effects and instance batches re-sorted every frame: `setReactive( mesh, strength )` (0 turns it off). Both hold
  weak references; rigid meshes that didn't move are skipped, so parked or resting things cost nothing.
- `renderScale` < 1 with TAA renders the scene at that scale and the TAA resolve upsamples to the display (the low and medium
  presets); `renderer.width/height` is the render resolution, `renderer.outWidth/outHeight` the display. Settings v3
  moves players who kept the v2 low / medium values to the new ones.

## Shared item ids (so loot tables, NPCs and spawners agree)

Owned by Weapons (`src/game/items/defs/firearms.js`):
- Pistols: glock17, beretta_m9, m1911, sig_p226, desert_eagle, revolver_357, revolver_44, makarov, ruger_mk4, flare_gun
- SMGs: mp5, uzi, mp7, vector, mac10, ump45
- Rifles: m4a1, m16a4, hk416, ar15_civ, mini14, ak74, akm, sks, scar_l, g36, aug, fal, m14_ebr
- Precision / hunting: rem700, m24, cz527, lever_3030, mosin, svd, barrett_m82
- Shotguns: remington_870, mossberg_500, spas12, saiga12, double_barrel, sawed_off
- LMGs: m249, pkm      Bows: compound_bow, crossbow
- Ammo: ammo_9mm, ammo_45acp, ammo_357, ammo_44mag, ammo_50ae, ammo_22lr, ammo_9x18, ammo_556, ammo_545, ammo_762x39, ammo_308,
  ammo_762x54r, ammo_50bmg, ammo_12ga_buck, ammo_12ga_slug, ammo_3030, ammo_46x30, arrow, crossbow_bolt, ammo_flare
- Magazines: mag_glock17, mag_m9, mag_1911, mag_p226, mag_deagle, mag_makarov, mag_ruger22, mag_mp5, mag_uzi, mag_mp7, mag_vector,
  mag_mac10, mag_ump45, mag_stanag30, mag_stanag60, mag_mini14, mag_ak74, mag_akm, mag_akm_drum, mag_g36, mag_aug, mag_fal, mag_m14,
  mag_svd, mag_m82, mag_cz527, mag_saiga12, box_m249, box_pkm
- Attachments: optic_reddot, optic_holo, optic_2x, optic_acog, optic_hunting, optic_sniper, optic_pso1, supp_pistol, supp_rifle, supp_sniper, light_rail
- Melee: kitchen_knife, hunting_knife, combat_knife, machete, cane_knife, hatchet, fire_axe, baseball_bat, nailed_bat, crowbar, lead_pipe,
  sledgehammer, shovel, golf_club, katana, tire_iron, frying_pan, hammer, wrench, pickaxe, fishing_spear, canoe_paddle, police_baton, broken_bottle
- Throwables: grenade_frag, grenade_smoke, grenade_flash, molotov

Owned by Items (everything else), ids others rely on:
- Spawn kit: aloha_shirt, tshirt, tank_top, board_shorts, jeans, cargo_shorts, slippers, bandage_rag, road_flare, chemlight, water_bottle,
  crackers, granola_bar, macadamia_nuts; creative kit also uses backpack_hiking
- Hunting: raw_boar, raw_goat, raw_venison, raw_chicken, raw_fish, raw_shark (+ cooked_* versions), animal_hide, feathers, bone
- Vehicles: jerrycan (fuel, 20 L), gas_can (5 L), car_battery, spark_plug, tire, repair_kit, car_keys
- Tools others check: flashlight, headlamp, lighter, matches, can_opener, map_hawaii, compass, binoculars, fishing_rod, lockpick, toolbox, cooking_pot, canteen
