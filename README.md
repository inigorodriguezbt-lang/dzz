# Deadtide

A first-person survival game for the browser, set on all eight Hawaiian islands one week after an outbreak.
Scavenge towns and military bases, open every cupboard, fridge, locker and car trunk, find guns and ammo,
keep yourself fed, watered, warm and patched up, and cross the channels by boat or helicopter — from the red
dirt of Kauaʻi to the snow on Mauna Kea. Inspired by DayZ and Project Zomboid, with a GTA-sized open world, in
the style of [Tidewater](https://github.com/dgreenheck/tidewater).

Runs on three.js (WebGL 2) and Web Workers, no install.

```sh
npm install
npm run dev        # http://127.0.0.1:5190
npm run build      # static build in dist/
npm test           # core logic tests (Node)
```

More Node test suites: `node test/items.mjs`, `node test/weapons.mjs`, `node test/creatures-ai.mjs`,
`node test/vehicles.mjs`, `node test/vehicles-play.mjs`, `node test/buildings.mjs`, `node test/buildings-runtime.mjs`,
`node test/vegetation.mjs`, `node test/roads.mjs`, `node test/combos.mjs`, `node test/mood.mjs`,
`node test/placeables.mjs`, `node test/sites.mjs` and one per item domain (`node test/ext-tech.mjs`, `ext-kitchen`,
`ext-pharmacy`, `ext-outdoors`, `ext-arms`, `ext-gear`, `ext-leisure`). Headless screenshots run on Mesa's lavapipe (see `CLAUDE.md`).

## The world

- **Real Hawaiʻi.** Elevation and ocean depth come from the AWS Terrain Tiles open dataset (USGS 3DEP/NED,
  SRTM, ETOPO1, GMRT) for the whole chain, from Niʻihau to the Big Island, baked at 1:8 horizontally (people,
  buildings, roads and cars are full size). The world is about 76 × 51 km; Oʻahu is 7 km across, Hawaiʻi 13.
- **Climate and ground cover.** Rainfall is modelled from the trade winds (wet windward slopes, rain shadows,
  the dry summits above the inversion); lava flows are traced downhill from Kīlauea, Mauna Loa and Hualālai;
  old islands get red laterite; pineapple, sugar cane and ranch land where they grew.
- **Towns and cities.** 58 settlements at their real locations — Honolulu from Pearl City to Kaimukī, Waikīkī's
  hotels, Kāneʻohe, Kailua, Hilo, Kona, Kahului, Lahaina, Līhuʻe and dozens of villages — plus Schofield
  Barracks, Pearl Harbor, the Kāneʻohe Marine base, Pōhakuloa, the Pacific Missile Range, five airports with runways (Honolulu, Līhuʻe,
  Kahului, Kona, Hilo) and the Mauna Kea observatories. About 4,500 buildings with interiors — houses, walk-ups, shops, gas stations, police
  and fire stations, hospitals, schools, hotel and office towers with stairwells and upper floors, warehouses,
  barracks, the airport terminals — with doors (locked ones can be picked, pried or kicked), furniture, and
  cupboards, fridges, lockers and safes to search.
- **Roads.** Highways routed over the real terrain between the towns (H-1, H-2, H-3, the Pali, Kamehameha,
  Farrington, Hāna Highway, Saddle Road, the belt road around the Big Island…), graded and cut into the hills.
- **Ocean and sky.** Rendering ported from Tidewater: a physically based atmosphere with auto exposure, volumetric
  cumulus and cirrus with cloud shadows, sun shafts and haze, ambient occlusion, temporal anti-aliasing, cascaded
  soft shadows, surf running up the beaches over the real bathymetry, turquoise reef flats and deep blue
  channels, moonlit nights with stars, and trade-wind weather from clear skies to overcast Kona storms.

## Survival

Health, blood, hunger, thirst, stamina, energy, body temperature and wetness; bleeding, infected bites,
broken legs, food poisoning, drunkenness, drowning. Clothing decides what you can carry and how warm and
protected you are. Loot lies where it would be — on shelves, counters and floors — and inside containers.
Guns, ammunition and magazines, attachments, melee weapons, food and drink, medicine and tools; crafting,
fires and cooking; the infected, which follow noise and sight; wild boar, goats, deer, chickens and sharks;
cars, trucks, boats and helicopters.

## Items and what you can do with them

About 900 items, each a 3D model you can see lying in the world: on shelves, counters and floors, and outdoors.
- **Outdoor loot.** Sites you spot from the road: dropped bags and suitcases, bus stops, crashed cars, beach camps,
  campsites, dead hikers and survivors, fishing spots, police and military checkpoints, FEMA camps, farm stands,
  picnics, smoking helicopter wrecks, supply drops under a parachute, and buried stashes you find with a note, a
  treasure map or a metal detector and dig up with a shovel.
- **Mixes.** Drag one item onto another, or pick Combine, for over 160 mixes (plus 120 recipes): batteries into devices, duct tape
  and sewing kits on worn gear, spirits on rags for sterile bandages, a taped flashlight or a bayonet on a rifle,
  cocktails (rum and POG make a Mai Tai), shoyu on raw ahi for poke, herbs ground into poultices, dyes and patches on
  clothes.
- **Cooking.** Build dishes in a pot, a pan, a bowl or on bread from whatever you have ("Stew (taro, Spam,
  onion)"), then cook them at a fire or a stove. Salt and smoke meat to keep it, boil seawater down to salt, chill
  food with ice, slow-cook a pig in an imu.
- **Things you place.** Snares and spring traps, fish and crab traps, rain barrels, solar stills, smoking racks, tarp
  shelters and hammocks, a generator that lights and charges what's around it, solar panels, alarm clocks and can
  tripwires that draw or warn of the infected, buried stashes, planks across doors.
- **Mood and skills.** Boredom, stress, panic and unhappiness, with books, music, games, cigarettes, good food and
  surfing to fight them. Thirteen skills level up as you fish, cook, patch people up, craft, repair and shoot, and
  skill books speed them up.
- **More to deal with.** Box jellyfish at night, centipedes in the brush, sunburn at noon, heat stroke,
  leptospirosis from bad water and infected cuts, each with a cure. Scanners and CB radios mark camps, drops and
  crashes on your map; a satellite phone calls in a supply drop. Electronics dismantle into parts for repairs and
  builds.

## Controls

| Action | Key |
|---|---|
| Move / sprint / walk | W A S D / Shift / Alt |
| Crouch / prone / jump, vault | C / Z / Space |
| Lean | Q / E |
| Interact, pick up, open, drive | F |
| Fire / aim / reload | Left mouse / right mouse / R |
| Quick melee, fire mode, holster, throw | V / B / X / G |
| Flashlight, hold breath | L / N |
| Hotbar | 1 – 9, mouse wheel |
| Inventory / map / crafting / journal | Tab or I / M / O / P |
| Chat / command | T / / |
| Hide HUD / screenshot / debug | F1 / F2 / F3 |
| Vehicle camera / lights / horn (×2 siren) | F5 / L / H |
| Aircraft climb / descend / roll | Space / Ctrl / Q, E |

Every key can be rebound in **Options → Key bindings**.

## Options

Field of view, render distance, resolution scale, GUI scale, head bob, crosshair, graphics presets (shadows,
terrain detail, vegetation, grass, clouds, water, anti-aliasing incl. TAA, ambient occlusion, sun shafts, lens
flare, motion blur, bloom), exposure, night brightness, volumes, mouse
sensitivity and inversion, toggle / hold for crouch, aim and sprint, hit markers, damage direction and a
"realistic" mode where the map and compass need the items.

## Worlds

Worlds are saved in the browser (IndexedDB), autosaved every minute and on exit. From the world list you can
create worlds (seed, survival or creative, difficulty, hardcore, day length, starting island), rename,
duplicate, delete, **export** a world to a `.deadtide.json` file and **import** it again on any computer.

## Commands

Open chat with **T** (or **/**) — Tab completes commands, items and places; ↑/↓ recall history.

| Command | |
|---|---|
| `/give <item> [count]` | give yourself an item (`/give m4a1`, `/give "Spam musubi" 5`) |
| `/tp <x> <z>`, `/tp <place>`, `/tp ~dx ~dz` | teleport (`/tp hilo`, `/tp mauna kea`) |
| `/time set <day\|noon\|sunset\|night\|HH:MM>`, `/time add <h>`, `/time freeze`, `/time speed <min>` | time of day |
| `/weather <clear\|fair\|cloudy\|showers\|overcast\|storm> [lock]` | weather |
| `/locate <place\|building type>` | nearest gun store, hospital, police station, town… and a map marker |
| `/summon <entity> [count]` | infected, animals, vehicles, bandits in front of you |
| `/gamemode <survival\|creative>` | creative: fly (double-tap Space), invulnerable, item catalog |
| `/heal`, `/feed`, `/kill`, `/god`, `/fly`, `/noclip`, `/speed`, `/ammo`, `/repair`, `/killall`, `/clear`, `/pos`, `/seed`, `/difficulty`, `/save`, `/help` | |

## URL options

| Option | Effect |
|---|---|
| `?quick=1&mode=creative&at=X,Z&yaw=DEG&hour=H` | skip the menus and start a test world at world position X,Z |
| `&frames=N` | stop after N frames (headless screenshots, `node test/shot.mjs`) |

## Project layout

| Folder | |
|---|---|
| `tools/bake/` | the world bake: tiles → heights, rainfall, lava, land use, cities, highways, buildings |
| `public/data/` | the baked world: `terrain.bin.gz` (heights, surface maps, flags), `world.json` |
| `src/world/` | height field, streaming terrain, ocean, sky, vegetation |
| `src/render/` | render pipeline, atmosphere, shared materials, item models and icons, effects |
| `src/game/` | game loop, player, survival, inventory, items, physics, entities, interaction, commands, weather |
| `src/city/` | roads, street furniture, buildings and interiors |
| `src/weapons/`, `src/ai/`, `src/vehicles/` | the hands and guns, the infected and animals, vehicles |
| `src/ui/` | menus, HUD, inventory, map, chat |
| `src/workers/` | the world worker (terrain meshes, scatter, streets, map tiles) |
| `docs/ARCHITECTURE.md` | how the modules fit together |

## Credits

See [CREDITS.md](CREDITS.md). Code MIT. The look, UI and sound bank follow Tidewater (MIT, DRG Software
Solutions LLC, see `LICENSE-Tidewater.txt`).
