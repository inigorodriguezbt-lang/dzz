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
  `eat(stack)`, `drink(def, litres, liquid)`, `medicate(def)`, `useStamina(n)`, `stamina`, `health`, … 
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
- Shadows: one sun shadow map follows the camera (±85 m). Set `castShadow` / `receiveShadow` on your meshes. Alpha-tested
  foliage: `material.alphaTest` + `side: DoubleSide` works in the shadow pass too.
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
- Vehicles (`game.vehicles`): drivable entities (type 'vehicle'), `enter(v)`, `exit()`, `seatInteraction()`, camera while driving
  (sets game.camera), fuel / damage / lights / horn, trunk container, `damage(amount, info)`. /summon names: sedan, pickup, jeep, suv,
  police_car, van, sports_car, bus?, motorbike?, boat, speedboat, fishing_boat, jetski, helicopter, plane?. Spawns parked / abandoned
  vehicles near roads, harbours and airports; saves them in `save.world.vehicles`.
- City (`game.city`): `types()` (building type names for /locate), `locate(type, pos) -> {name, x, z}`, `doorAt(pos, r)`, `isIndoors(pos)`
  (also set `game.world.indoorTest`), interaction providers for doors and containers, loot spawn state in `save.world.looted/containers/doors`.
- Roads (`game.roads`): meshes for highways, streets, sidewalks, runways, markings; street props; wrecked cars (static, some lootable
  trunks via `rollLoot('car_trunk')` + `ui.openContainer`), colliders for props.
- UI (`game.app.ui`): `openContainer(container)`, `openInventory()`, `toast`, `showDeath(info)`; icons come from `src/render/Icons.js`.

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
