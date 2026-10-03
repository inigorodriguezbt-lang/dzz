# Item expansion plan

The brief: "add a shit ton of items (must be visible in the overworld to loot) with cool interactions and mixes like
Project Zomboid and DayZ, be imaginative." The game already has 474 items (ItemDB.js schema, src/game/items/defs/*.js)
with procedural 3D models, loot tables, crafting at fires, and an item-use menu. This plan adds roughly 350–400 items
and the systems that make them interesting to find and combine.

Every new item must:
1. be a real 3D model that reads as the thing at a glance, on a shelf, on the floor and as an inventory icon (icons are
   rendered from the model). Reuse an existing builder with a new spec where it fits (labels on `can`, `box`, `bag`,
   `bottle`, `jar`…); write a new builder when the shape is new;
2. be **visible in the world to loot**: it rolls from a table that spawns loose items you can see (the building loot
   spots on shelves, counters and floors, or the outdoor sites in `Sites.js`), unless it is only ever made (crafted,
   cooked, mixed). Containers you open in a menu don't count as "visible" on their own;
3. do something: be eaten, worn, used, combined, placed, thrown, read, burned, repaired with, or crafted into
   something. Pure junk is allowed only when it feeds a mix or a recipe (PZ style: a tin can, a spring, a sock);
4. follow CLAUDE.md: tabs, `fn( a, b )` spacing, short comments that explain why, and short plain player-facing text
   (verbs for menu items, a few words for toasts, no flavour text in descriptions: `desc` is one short functional
   line, e.g. "Stops bleeding. Reusable.").

## Rules for every agent

- **Own your files.** Edit only the files listed for your part below. For shared files, use only the hook calls in
  "Contracts". If something you need is missing from a shared module, add the smallest hook and say so in your report.
- Use Edit (exact replacements), never Write, on any file you didn't create — other agents work in the same tree.
- **Don't commit or push.** The lead commits between phases.
- **One browser at a time.** `test/lib/browser.mjs` `launch()` takes a machine-wide lock and waits for it. Keep
  browser runs short, close the browser as soon as you have your shots, and never leave a browser running. To look at
  your models, prefer the item preview page over a full game boot:
  `node test/preview/items-sheet.mjs "http://127.0.0.1:5190/test/preview/items.html?ids=a,b,c&cols=8" /tmp/<you>/sheet.jpg`
  (`?mode=icons&ids=…` for the icon sheet, `?tag=x`, `?q=substring`, `?cat=food`). The dev server runs on port 5190
  (`npx vite --host --port 5190` if it's down; check with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5190/`).
  For in-game checks use `test/preview/session.mjs` with a steps file. Screenshots are JPEG, under your own /tmp
  directory.
- Node checks must pass before you finish: `node test/items.mjs` (every def, loot table and recipe), plus the tests of
  the systems you touch (`node test/logic.mjs`, `node test/weapons.mjs`, `node test/creatures-ai.mjs`, and
  `node test/combos.mjs` once it exists).
- Ids are snake_case and unique across the whole catalogue: check `getItem( id )` / grep before adding. Reuse
  existing ids where they fit instead of adding near-duplicates.
- Hawaiʻi first: the setting is the Hawaiian islands a week into an outbreak. Local brands are invented (no real
  trademarks on labels; "SPAM" and similar already exist and are fine), local food, local plants, surf and fishing
  culture, plantation towns, tourists, the military bases, Mauna Kea's observatories.

## Contracts

### Item definitions (ItemDB.js)

The schema at the top of `src/game/items/ItemDB.js`, plus these optional fields (the core systems read them):

- `fun: { boredom, stress, unhappy }`: mood changes on use, eat, drink, read or play (negative = better; 0–100
  scales). Applied by `game.survival.mood( fun )`.
- `read: { skill, xp, hours, once }`: a skill book or magazine. Reading takes `hours` of game time in small chunks,
  and grants `xp` to `skill`. Skills are listed under "Skills" below.
- `place: { kind, … }`: the item can be placed in the world (see "Placeables").
- `noise: { radius, seconds, delay }`: the item makes noise when used, thrown or placed; zombies within `radius` m
  come to look (`game.events.emit( 'noise', { pos, radius, source, kind } )`).
- `stash: true`: a stash note or treasure map (see "Sites").
- `dismantle: [ [ id, qty ], … ]` with optional `dismantleTools: [ kinds ]`: a "Dismantle" verb that breaks the
  item into parts (PZ scrapping).
- `evolved: { … }`: cooking bases and ingredients for the evolved dishes (see "Kitchen").

### Registration hooks (call these from your own files)

- `defineItems( [ … ] )` in `ItemDB.js`.
- `extendLoot( table, entries )` / `defineLootTable( name, { rolls, items } )` in `Loot.js`. Entry forms are documented
  at the top of `Loot.js`. Tag entries (`{ tag, cat, not, w }`) pick up new items automatically, so tag your items well.
- `addRecipes( [ R( id, name, out, inputs, opts ) ] )` in `recipes.js` (the crafting panel; see the format at its top).
- `addUseActions( ( stack, def, ctx ) => { … } )` in `hooks.js`: right-click verbs. `ctx.add( verb, run, notes, combos )`,
  `ctx.first( … )` (the double-click default), `ctx.game`, `ctx.use` (game.itemUse helpers: `consumeOne`,
  `noiseMaker`, …), `ctx.inv`. `combos`: the mixes the verb already does, left out of the item's Combine list.
- `addSystem( ( game ) => { … } )` in `hooks.js`: a domain's runtime (`game.register( system )`), started with the items
  module before the save loads. `addSpoilHook` is for food ageing only.
- `addCombos( [ … ] )` in `combos.js` (built in phase A): item-on-item mixes, format below.
- `register( reg )` in `src/game/items/models/ext/<domain>.js`: `reg( 'type', ( spec, def ) => Object3D )` for new model
  types. Model conventions are at the top of `src/render/ItemModels.js` and the helpers in `models/lib.js` (`M`,
  `MAT`, label textures, rounded boxes). Existing types (don't redefine them; reuse them with new specs): ammo_box mag
  gun attachment melee throwable shirt pants shoes hat mask glasses vest gloves belt backpack tin can bag cup jar box bar
  fruit dish meat fish bottle carton roll parts kit spray pillbottle blister syringe tube splint ivbag flashlight
  headlamp lantern phone chemlight stick lighter bundle stove map compass binoculars rangefinder watch gps rod toolbox
  canopener multitool lockpick sewing whistle battery canteen pot radio stuffsack folded firewood plank wire rope scrap
  stone paper hide feathers bone carbattery sparkplug tire keys jerrycan propane flare cash jewelry lei ukulele tiki
  duck laptop book nvg pipe surfboard trash. Prefix a new type with your domain when the name is generic
  (`kitchen_wok`, not `wok`… unless clearly unique).

### Combos (item-on-item mixes), `src/game/items/combos.js`

Drag item A onto item B in the inventory (either way round), or pick "Combine" in A's right-click menu, which lists
every partner you carry. Data, Node-safe:

```js
addCombos( [ {
	id: 'sharpen_machete',           // unique
	verb: 'Sharpen',                 // the drag and menu verb: "Sharpen Machete"
	a: { tag: 'whetstone' },         // matcher for one side
	b: { cat: 'melee', fn: ( s, d ) => d.melee.kind === 'blade' },
	use: { a: 0, b: 0 },             // units each side uses up (0 kept, n, or 'all'); default { a: 1, b: 1 }
	liquid: { side: 'b', kind: 'fuel', litres: 0.5 },   // drawn from a container on that side (optional)
	out: [ 'id', qty, data? ],       // or [ [ id, qty, data? ], … ]; into the inventory, else onto the ground
	repair: { b: 0.25, max: 0.95 },  // condition change on a side (optional)
	wear: { a: 0.02 },               // condition lost by a side used as a tool (optional)
	tools: [ 'cut' ], station: 'fire',   // further needs beyond A and B (tool kinds as in recipes)
	time: 4,                         // seconds of a progress action (0 = instant)
	sound: 'craft',                  // item sound name (optional)
	label: 'Sharpen blade',          // menu label when the verb + B's name isn't right (optional)
	check: ( ctx ) => null,          // returns a short reason string to refuse ("Needs water"), or null
	run: ( ctx ) => {},              // custom effect after the standard ones
} ] );
```

Matchers: an id string; `{ id }`; `{ ids: [] }`; `{ tag }`; `{ cat }`; `{ tool: kind }` (a tool kind, a tool's
`provides`, or a melee weapon's `tools`); `{ liquid: kind, min: litres }` (a container holding it); `{ fn( stack, def ) }`;
`{ any: [ matchers ] }`; `{ not: matcher }`. Fields in one object combine with AND. The `ctx` given to `check` and
`run`: `{ game, inv, a, b, A, B /* defs */, consume( stack, n ), give( id, qty, data ), replace( stack, id, data ),
toast( text, kind ), sound( name ), survival, player, skills }`.

### Mood and skills (phase A)

- `game.survival.boredom`, `.stress` and `.unhappy` run from 0 to 100. Boredom grows when nothing is happening.
  Stress grows from fights, bites, darkness and hunger. Unhappiness grows from rotten food, a bad night's sleep and
  long boredom or stress. `game.survival.mood( { boredom, stress, unhappy } )` adds deltas. High values cost
  something: stress shakes your aim, unhappiness slows healing and sleep, and boredom feeds unhappiness. The HUD shows
  moodle icons as they rise.
- `game.skills`: `xp( skill, amount )`, `level( skill )` from 0 to 10, and `knows( key )` (the old one-off "knowledge"
  flags from guides keep working). The skills are fishing, survival, foraging, first_aid, cooking, mechanics,
  carpentry, tailoring, electrical, aiming, reloading, maintenance and stealth. Domains grant xp from their actions
  and read levels for small bonuses: a better yield, a faster action, less wear.

### Placeables (phase A), `src/game/items/Placeables.js`

An item with `place: { kind, … }` gets a "Place" verb. It shows a ghost of the item's model in front of the player
(green or red for valid), and a click puts it down. Each placed thing is persistent (saved), has an F-interaction menu
and an update tick. Kinds are registered with `addPlaceable( kind, { update( p, dt, game ), actions( p, game ) ->
[ { label, run } ], onPlace, onRemove, serialize, load } )`; the record `p` has `pos`, `yaw`, `stack` and `data`.
Phase A ships the framework and these kinds: `trap` (snares and spring traps that catch small game and hurt
zombies), `noise` (alarm clocks, radios and timers that draw zombies), `collector` (rain barrels and tarps that fill
with rain), `stash` (a buried or hidden box, from the "Stash" verb), `light` (lanterns, candles, chemlights left as
lights), and `barricade` (planks on a door or window, using the buildings' door API where possible). Domains add kinds.

### Outdoor loot sites (phase A), `src/game/items/Sites.js`

Loot you can see outdoors, streamed around the player by cell (deterministic per seed, persistent looted state,
respawning slowly like the building loot spots). Site kinds, each with props and a loot table named `site_<kind>`
that domains extend:

- `roadside`: a dropped bag or a spilled suitcase.
- `bus_stop`: a bench with a bag.
- `crash_car`: a car's spilled cargo.
- `beach_camp`: a towel, an umbrella, a cooler.
- `campsite`: a tent and a fire pit, in forest and parks.
- `hiker`: a body with a backpack, on trails and slopes.
- `fishing_spot`: a bucket, a rod holder and a chair, at the shore.
- `checkpoint`: police cars, cones and barriers.
- `military_checkpoint`: sandbags, crates and a tent.
- `heli_crash`: wreckage, smoke and military loot, rare.
- `fema_camp`: tents, cots and supply pallets, near towns.
- `farm_stand`: fruit and produce.
- `picnic`: a table at a park.
- `body`: a dead survivor with their gear.
- `supply_drop`: a crate under a parachute; occasional, announced by a flare.
- `stash`: buried. A stash note or treasure map item marks it on the map, and a shovel digs it up.

Sites register their loot as world items (game.items3d.spawn with a stable key), so everything is visible on the
ground. `game.sites.reveal( kind, near )` puts a map marker on the nearest site of that kind, for radios, notes and maps.

## Domains (phase B)

Each domain agent owns these files, and only these, for its domain:
- `src/game/items/defs/ext/<domain>.js`: defs, loot placement (`extendLoot`), recipes, combos and use verbs.
- `src/game/items/models/ext/<domain>.js`: new model builders.
- optional runtime helpers in `src/game/items/ext/<domain>/*.js`.

The seed lists below show the ambition. Be imaginative beyond them, and cut anything that would be a near-duplicate.
Target 45–70 new items per domain, every one with a model, a place to find it, and something to do with it.

### kitchen (~70)
Hawaiian pantry and kitchen, condiments, cooking and drinks.
- **Condiments.** Shoyu, furikake, li hing powder, chili pepper water, Hawaiian salt (ʻalaea), sugar, flour, sweet
  chili, oyster sauce, guava jam, mayo, ketchup, hot sauce, coconut milk, a bag of sea salt.
- **Ingredients.** Taro leaves (lūʻau), ti leaves, ginger, garlic, green onion, Hawaiian chili peppers, limu
  (seaweed), ʻopihi, crab, lobster, a whole pig, Portuguese sausage, bread loaves, tortillas, mochiko, ramen bricks.
- **Prepared food.** Kalua pig, laulau, lomi salmon, haupia, kulolo, chicken long rice, beef stew, fried rice, saimin
  bowls, poke bowls, shave ice, manapua, Spam fried rice, chocolate haupia pie, li hing gummies, mochi crunch.
- **Drinks.** Kona coffee (beans, grounds, brewed), māmaki tea, kava (ʻawa), cocoa, POG, cocktails (a Mai Tai,
  Blue Hawaiʻi, a Lava Flow), local beers, coconut rum, energy shots.
- **Cookware.** A wok, a rice cooker (needs power or works at a fire), a cast-iron skillet, a cutting board, bowls,
  plates, a thermos, a mixing cup, a grill grate, an imu (an earth oven: a placeable you dig, fill and slow-cook in).
- **Evolved cooking, PZ style.**
  - Cooking bases: a pot of water for stews and soups, a wok or skillet with oil for stir-fries and fried rice, a
    bowl for salads and poke, bread for a sandwich, a rice ball for musubi.
  - Adding ingredients to a base is a combo. It records them in `stack.data.dish = { base, items: [ … ], kcal,
    water, … }`, names the dish after them ("Stew (taro, Spam, onion)"), and adds up the nutrition. Spices add
    `fun` and a small bonus.
  - Cook the dish at a fire or stove. The cooking skill adds kcal and reduces the sickness chance.
- **Mixes.**
  - Cocktails are combos: rum + POG gives a Mai Tai, coconut rum + pineapple juice + ice gives a Lava Flow.
  - Sugar or milk into coffee. Li hing powder on fruit gives li hing mango.
  - Shoyu + raw ahi gives poke.
  - Salt + meat gives salted meat, which keeps far longer.
  - Smoking fish over a fire, a jerky drying rack, pickling with vinegar in a jar.
  - Boiling seawater down gives sea salt.
  - Rotten food + a bucket gives compost or bait.
- **Spoilage play.** A cooler with ice slows spoilage, ice melts, freezer packs.

### pharmacy (~40)
Medicine, herbal remedies, conditions, and sterile versus dirty dressings.
- **Pharmacy.**
  - Rubbing alcohol, hydrogen peroxide, burn cream, eye drops, an inhaler, antihistamine, sleeping pills.
  - Beta blockers (steady aim, PZ), antidepressants (stress and unhappiness), cough syrup.
  - Cold packs and heat packs, a crutch (move with a fracture), an arm sling, ORS packets, glucose gel, vitamins C
    and D, sunscreen, after-sun.
  - A stethoscope (shows your stats exactly), a thermometer, a blood pressure cuff (flavour-free: it just reads out).
  - A trauma kit, a field surgery kit, a defibrillator (rare; revive from "downed" if that exists, else a big heal).
- **Herbal and Hawaiian.**
  - ʻŌlena (turmeric) root for infection, noni fruit (a slow heal, tastes awful: unhappiness), ʻawa root (pain and
    stress, sedation).
  - Kukui nut oil for burns and sunburn, māmaki leaves for tea, ti-leaf wraps (a weak bandage), aloe (exists),
    ʻuhaloa root for coughs, pōpolo berries.
  - A mortar and pestle grinds herbs into poultices and salves (combos).
- **Sterile versus dirty dressings, PZ style.**
  - Boiling rags or bandages, or soaking them in alcohol, makes sterile ones.
  - Dirty dressings raise the infection risk, and used bandages come off dirty.
  - Disinfecting a wound with alcohol, iodine or vodka is a combo or a use.
- **Conditions,** added to Survival.js (this domain owns those edits in phase B):
  - Box jellyfish stings (in the sea at night; vinegar fixes them), centipede bites (in the brush), sunburn (fierce at
    noon without a hat, shirt or sunscreen), heat stroke, leptospirosis (from drinking stream water untreated),
    infected cuts.
  - Each has a short status message and a cure item. Keep the numbers gentle and readable.

### outdoors (~55)
Camping, survival craft, fishing, hunting and traps.
- **Camp.** A ferro rod, a magnifying glass (lights a fire in the sun), a signal mirror, a flare gun with flares
  (shared with arms; coordinate by ids), paracord, a carabiner, an emergency blanket, a hammock, a sleeping pad, a
  bedroll, a tarp shelter (placeable), a camping chair, a mosquito net, bug spray (mosquitoes are a mood and stress
  thing at dusk).
- **Water.** A water filter straw, a gravity filter, a solar still (placeable), a rain barrel (placeable collector),
  a bucket, a canvas water bag, a filter of sand and charcoal in a bottle (a combo).
- **Fishing, Hawaiian style.** A throw net (ʻupena: cast at the shore for small fish), a Hawaiian sling or spear gun,
  a fish trap (an ʻie basket, placeable, catches overnight), a crab or lobster trap, lures, bone hooks (makau,
  craftable), squid jigs, fishing line, a fish stringer, a dive knife, snorkel gear.
- **Hunting.** Game snares, a deer call, a pig trap (placeable), skinning knives, a meat hook, a game bag, a smoking
  rack (placeable: smokes meat over time), a tanning frame (hide into leather).
- **Craft from the wild.** Coconut fibre cordage (sennit), a coconut-shell bowl, a bamboo water container, a bamboo
  spear, a stone adze (koʻi), an obsidian or basalt blade, a bow drill fire kit, a fern-frond bed, palm-thatch.
- **Placeables** this domain registers or uses: a fish trap, snares, a smoking rack, a solar still, a tarp shelter,
  a rain barrel, a hammock (sleep anywhere).

### arms (~45)
Improvised melee, Hawaiian museum weapons, gun care and attachments, simple ranged weapons, noise distractions,
armour. Game items only, with no real-world construction detail (no explosives, no home-made gun parts).
- **Improvised melee, PZ.**
  - A spiked plank, a barbed-wire bat, a pipe wrench, a machete lashed to a pole, a screwdriver shiv, a hockey
    stick, a sharpened shovel, a pool cue.
  - A rolling pin, a meat cleaver, a sickle, a cane knife variant, a cricket bat.
- **Hawaiian weapons** (rare, in museums and pawn shops): a leiomano (shark-tooth club), a pāhoa dagger, a newa war
  club, a koa spear.
- **Gun care and attachments,** as combos onto firearms:
  - Gun oil and a cleaning rod (condition), parts kits by class (pistol, rifle, shotgun) that repair condition.
  - A rifle sling, a taped-on flashlight (light attachment), a bayonet (adds a stab), a stock wrap.
- **Ranged.** A slingshot with steel balls and stones, throwing knives, a flare gun with flares.
- **Distractions** (noise that draws the infected away), using the existing noise events and throwables:
  - Firecracker strings (New Year): a long burst of noise.
  - A thrown alarm clock or radio, a party horn.
  - A tripwire of cans (placeable): it rattles when the infected walk through.
- **Armour, PZ.**
  - Magazine armour taped to the forearms (`armor.bite`), a welder's mask, a riot shield, a butcher's chainmail
    glove.
  - Sports pads belong to gear: reuse them.

### tech (~60)
Electronics, power, tools, materials and the junk economy.
- **Power.** AA batteries, D cells, 9 V, a power bank, a solar panel (placeable, charges carried devices), a
  portable generator (placeable: runs on gasoline, powers nearby lamps and a rice cooker or fridge, makes noise),
  a car battery charger, a hand-crank radio.
- **Devices.** A CB radio, a scanner (picks up broadcasts that reveal sites via `game.sites.reveal`), a portable
  TV, a Walkman, a Game Boy-style handheld (boredom), a digital camera (flash blinds zombies a moment), a drone (rare;
  a short scouting view if feasible, else a "reveal sites nearby" use), a metal detector (finds buried stashes and
  scrap), a thermal scope (rare attachment, coordinate with arms), an e-reader.
- **Tools.**
  - A hacksaw, bolt cutters (cut chains and padlocks on gates and lockers if they exist; else they're a tool for
    recipes), a screwdriver set, pliers, a pipe wrench, a socket set, a soldering iron, a blowtorch, a welding kit.
  - A sledge (exists), a nail gun, a staple gun, a hand drill, a level, a tape measure, a caulking gun.
- **Materials.**
  - Glue, epoxy, zip ties, screws, bolts, springs, sheet metal, metal pipe, a garden hose, chain, a padlock, wood
    glue, fabric, thread, leather, a tin can, an empty jar, a plastic bottle.
  - Electronics scrap, copper wire, circuit boards, a magnet, sandpaper, motor oil, WD-40,
    bleach (never drink it), vinegar, charcoal (exists).
- **The junk economy, PZ.** "Dismantle" on electronics, furniture-like items and vehicles' parts gives materials
  (`dismantle`). Materials feed recipes and combos for repairs and builds. Glue, epoxy and duct tape fix things to
  different caps. Disassembling a radio gives electronics scrap and a speaker.
- **Vehicles.** A fuel siphon hose (drain a wreck's tank into a can; coordinate with the vehicles module via its
  existing API only), motor oil, a car jack, jumper cables, a spare headlight. Keep vehicle edits to calls into its
  API.

### gear (~55)
Clothing, carrying, containers and protection.
- **Clothing.**
  - Hawaiian: a pāʻū skirt, a lavalava, kapa, a holokū, a palaka shirt, an aloha dress, a lauhala bag, a feather lei
    hat band.
  - Rain and work: a poncho, a raincoat, a fishing smock, a rash guard (exists), a dive skin, a beekeeper suit,
    coveralls (exist).
  - Military and police: a ghillie hood, a boonie with netting, a tactical vest variant, a pilot's helmet, a gas
    mask variant, a bandolier (ammo carry).
  - Sports: a motocross set (helmet, chest pad), a hockey mask, a bike helmet, a skate pad set.
- **Carrying.** A rolling suitcase (big, slow when carried: a weight penalty), a briefcase, a lunch box, an ammo can,
  a tackle bag, a drawstring bag, plastic grocery bags (tiny and fragile), a trash bag (big, rips), a sling bag, a
  waist pack, a leg rig, a rifle case, a gun case, a camera bag, a hydration pack, a messenger bag.
- **Clothing mixes, PZ.**
  - Patch with denim, leather or fabric for armour and insulation (combo, `tailoring`).
  - Dye with tie-dye, black or camo (combos with dye or a marker).
  - Sew pockets: a utility belt + pouches.
  - Rip into rags (exists). Cut jeans into shorts. Wet clothes dry at a fire.
- **Accessories.** Sunglasses variants, a wristwatch (exists), a dog tag, a lanyard with keys, body armour inserts
  (plates into a carrier as a combo), knee pads.

### leisure (~50)
Mood items, skill reading, collectibles, toys and vices.
- **Reading.** Skill books and magazines for each skill in "Skills": a fishing magazine, "Island Mechanic", a
  carpentry guide, the Hawaiian plants field guide (exists?), a first aid manual (exists), a sewing pattern, a
  cookbook, an electronics manual, a gun digest. Also comics, novels, newspapers (exists), a surf magazine and a
  travel guide, for boredom.
- **Toys and games.** Playing cards, dice, a hanafuda deck, a ʻukulele (exists: make "Play" work for mood), a
  harmonica, a yo-yo, a Rubik's cube, a handheld game (coordinate with tech: one of you owns it), a frisbee (a
  throwable distraction), a bodyboard, a surfboard (big; "Surf" at the shore for a big boredom and unhappiness
  drop, flavour-free).
- **Vices.**
  - Cigarettes (packs and cartons), cigars, a vape, chewing tobacco: less stress, but needs a light (a lighter or
    matches).
  - Alcohol beyond the kitchen's: a flask (fill with any spirit). Coffee and energy drinks belong to the kitchen.
- **Collectibles and valuables.**
  - Souvenirs: a snow globe of Waikīkī, a hula girl dashboard figure, a koa bowl, a shell lei, a whale-tooth pendant
    (a replica), a Hawaiian quarter set, a surf trophy, a Duke Kahanamoku poster, a signed baseball, a vinyl record.
  - Valuables: a pocket watch, a gold coin, a Rolex.
  - These fill a "collection" use: putting a set in a stash gives a small permanent happiness? Keep it light, or
    make them barter-free trophies with a fun "Admire" verb that lowers boredom once a day.
- **Seasonal.** Firecrackers belong to arms. Fun, short things here: a party popper, a glow stick bracelet.

## Phase A (core): owners

- **combine**: `src/game/items/combos.js`, `src/game/items/Combine.js` (game.combine: `find( a, b )`,
  `partners( stack )`, `run( combo, a, b )`, timed actions, consumption and outputs), the inventory hooks in
  `src/ui/InventoryUI.js` (drag A onto B shows the verb; a "Combine" submenu), `test/combos.mjs`. It also seeds about
  20 obvious combos for existing items so the system is exercised:
  - batteries into devices;
  - duct tape onto worn gear;
  - a sewing kit onto clothing;
  - water into a pot;
  - alcohol onto rags (sterile);
  - fuel and rags onto a bottle (molotov);
  - a lighter onto a torch;
  - rum onto juice (a cocktail);
  - and more.
- **mood**: `src/game/Survival.js` (the boredom, stress and unhappiness model, `mood()`, the effects), `src/game/Skills.js`
  (game.skills, xp and levels, saved), the HUD moodles (`src/ui/HUD.js`, `src/ui/css/hud.css`), and reading in
  ItemUse.js (`read` for skill books, which keeps the old `book.skill` knowledge). It makes `fun` work everywhere an
  item is consumed or used (eat, drink, medicate, use verbs).
- **placeables**: `src/game/items/Placeables.js` and `src/game/items/placeables/*.js`: the framework, the base kinds
  above, persistence, the interaction provider, AI hooks (noise via events; traps that damage zombies through the
  creatures module's existing damage API).
- **sites**: `src/game/items/Sites.js` and `src/game/items/sites/*.js`: site placement against roads, beaches,
  forest, terrain and buildings; site props (their own model builders in their own files); `site_<kind>` loot
  tables; persistence and respawn; stash notes and digging; supply drops and heli crashes; map markers; performance
  (draw calls, memory).

## Phase C: integration

All tests pass. An in-game session shows each site kind and a sample of the new items in place, and screenshots
are judged. A combo and cooking walkthrough works in a real session. Loot is balanced (no flood of rares, every new
item reachable). Draw-call and memory checks. Docs: the ARCHITECTURE.md item contracts and the README features list.

## Shared vocabulary (phase B)

Domains run two at a time, in this order: tech, kitchen, pharmacy, outdoors, arms, gear, leisure. A combo or recipe
should refer to an id that exists already, or to one from its own domain. To refer to another domain's things, use
**tool kinds** and **tags**, so the order doesn't matter.

**Tool kinds** (`tool.kind` or `tool.provides`, and melee `tools`):
- Existing: cut, chop, pry, dig, open_can, skin, hammer, saw, toolbox, sewing, tape, cleaning, pot, canopener,
  lighter, matches, fishingrod.
- New, owned by tech: screwdriver, pliers, wrench, hacksaw (cuts metal and pipes), boltcutter, solder, weld, drill,
  glue (an adhesive used as a tool).
- New, owned by kitchen: pan (a skillet or wok), bowl, grater, peeler.
- New, owned by pharmacy: grind (a mortar and pestle).
- New, owned by gear or tech: needle (tailoring; a sewing kit provides needle).
- New, owned by arms: whetstone (sharpening; the existing stone sharpens too).

**Material tags** on items:
- cloth, leather, denim, rubber, plastic, glass
- metal_sheet, pipe, spring, fastener (nails, screws, bolts), wire, cordage (rope, paracord, sennit)
- electronics, battery_aa, battery_d, battery_9v, adhesive (glue, epoxy, tape)
- fuel, oil, spirit (drinkable spirits, which work as a disinfectant), sugar, spice, herb, fruit, vegetable, meat, fish
- seed, bait, paper, wood, bone, shell, stone

**Ownership where the domain seed lists overlap:**
- flare gun: arms
- spear gun and Hawaiian sling: outdoors
- handheld game, frisbee, surfboard, flask: leisure
- firecrackers and thrown noise makers: arms
- alarm clock: tech, unless placeables already made it
- bug spray and snorkel gear: outdoors
- sunscreen: pharmacy
- cocktails, coffee and tea: kitchen
- bolt cutters and hacksaw: tech
- bags and containers: gear
- dyes: gear
- the cookbook: leisure (it grants cooking xp; the kitchen domain reads `game.skills.level( 'cooking' )`)

**Where loot shows:**
- **Building tables** feed both the loose loot spots you see on shelves, counters, tables and floors, and the
  furniture containers. Most of them do this: house_*, fridge, grocery, convenience, pharmacy, hospital, clinic,
  hardware, toolbox, clothing_store, sports, surf, market, pawn, gunstore, police, fire_station, military,
  military_armory, military_locker, hangar, garage_shop, gas_station, restaurant, restaurant_kitchen, fastfood, bar,
  office, desk, school, church, bank, post, hotel_room, warehouse, observatory and farm.
- **The `site_<kind>` tables** feed outdoor ground loot, which is always visible.
- **car_trunk, car_glovebox and zombie_* are menus only.** An item found only there doesn't count as visible.
