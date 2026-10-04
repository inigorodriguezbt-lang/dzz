# Handoff: where Deadtide stands

Read this at the start of every session, then carry on as if it were the same conversation. The user moves between
devices (phone, a cloud session, their Windows desktop). They may open a fresh session and just say "hello".

Last updated: 2026-10-04, at the end of the cloud session that built the game.

## When the user says hello (or anything else first)

- Answer as if you'd been there all along. Say hello, then give 3–5 short lines on where things stand (from
  "Status" below), then ask which next step they want. Offer the options from "Next steps", and keep the NPC build
  among them. Don't paste this file at them.
- Check the folder first: `git status`, `git log --oneline -3`. If there's no `.git` (they downloaded a ZIP), see
  "Git on the desktop" below before you change any code.
- Don't redo finished work. Don't start the NPC build until they say go.

## The user

- Writes short, casual messages, sometimes with typos ("averyhting", "temrinal"). Answer the same way: short and
  plain, with numbered steps for anything they have to do themselves. No essays.
- Uses Windows (Command Prompt / PowerShell). At first they had no Node.js ("npm is not recognized"). They got the
  code as the GitHub ZIP `dzz-claude-hawaii-survival-game-o34w3f.zip` and tried to `cd` into the ZIP. Expect to
  walk them through terminal basics.
- Wants the game "perfect" and wants to play it. They got 28 fps on the default High preset. They were told how to
  lower settings (Preset Medium/Low, Resolution 75%, Sun shafts and AO off, Shadows Medium, and making Chrome use
  the real GPU in Windows Graphics settings). They were offered automatic quality detection plus dynamic resolution
  and haven't answered yet.
- Gave full creative control on the NPCs ("this must be the best NPC system ever").

## The project

Deadtide is a DayZ / Project Zomboid-style survival game on all the Hawaiian islands, running in the browser. It
uses Three.js r186 (WebGL2), Vite, and Web Workers for terrain, ocean and shore. Its look is ported from
dgreenheck/tidewater. The repo is private: `inigorodriguezbt-lang/dzz`, branch `claude/hawaii-survival-game-o34w3f`.

| Doc | What's in it |
|---|---|
| README.md | Features, controls, options, chat commands, URL options, project layout |
| docs/ARCHITECTURE.md | Module contracts, ownership, shared item ids |
| docs/UI_DAYZ.md | The DayZ-style UI direction (wins over docs/UI_SPEC.md where they differ) |
| docs/ITEMS_PLAN.md, docs/ITEMS_CORE_API.md | The equipment expansion and the core item APIs (hooks, combos, placeables, sites) |
| docs/NPC_PLAN.md | The full NPC design, about 3,400 lines. Designed, **not built** |
| docs/fidelity/PLAN.md | The Tidewater rendering port plan |

## What the user asked for, in order

1. The original brief: a Tidewater-looking survival game like DayZ / Project Zomboid on all the Hawaiian islands,
   with:
   - looting, guns, clothing, food and melee;
   - saves with export/import, options, chat commands and a creative mode;
   - "everything must be perfect".

   Built.
2. "Can you make the ui more like dayz". Done (docs/UI_DAYZ.md).
3. "add a shit ton of equipment with unique interactions and super polished overworld models. Also super polished
   existing equipment and objects on the overworld".
   - Equipment is done: kitchen, tech, pharmacy, outdoors, gear, leisure, arms, mobility and senses.
   - The polish is mostly done; see Status.
4. The NPC request, verbatim:
   > When that finishes you are going to add super good NPCs, both good and bad. The idea is to have them follow you
   > and settle with them somewhere, where they can work on stuff and are self sufficient provided there's food and
   > water. You need to add different factions good and bad, which spawn on some areas and also randomly. Bad ones
   > are aggro and good ones want to join you (they also act aggro if you attack them) also randomly single NPCs can
   > follow you. Each faction has custom equipment and group size varies, with their settlements being a good place
   > to raid and loot with your companions. NPC companions must also help you shoot and stuff. Don't make npcs
   > overpowered where they don't miss a shot and can detect you from anywhere. You have full creative control but
   > this must be the best NPC system ever. You may add whatever you think is best.

   The design is in docs/NPC_PLAN.md.
5. "Ok leave the npcs on standby I wanna play the game when I get home". **The NPC build is on standby until they
   say go.**
6. They wanted to play without any setup, so a private Artifact link was published (see "The play link").
7. "how can i make it run better its just 28 fps". They got settings advice (see "The user").
8. "push the npc plan and everything else ... i wanna just say hello and the new session picks right up". That's
   this file.

## Status

### Done (all pushed)

- **World and engine.**
  - Real baked Hawaiian terrain (all islands) with streaming terrain and workers.
  - Sky and atmosphere, FFT ocean with shore waves and surf, vegetation with impostors.
  - Buildings with interiors and furniture, roads with street props and car wrecks, an airport.
- **Gameplay.**
  - Player, survival (health, blood, food, water, temperature, energy, mood), combat, zombies and animals.
  - Vehicles: cars, boats and aircraft.
  - Looting, crafting and combining, placeables, sites (crashes, camps, checkpoints, supply drops, stashes).
  - Saves with export/import, options, chat commands, creative mode and the map.
- **DayZ-style UI**: notifiers, badges, stamina bar, quickbar, grid inventory with a 3D character preview.
- **Equipment expansion.** The domains are kitchen, tech, pharmacy, outdoors, gear, leisure, arms, mobility and
  senses. Each has its own:
  - defs, models and runtime code;
  - Node test, `test/ext-*.mjs`.

  That's 978 item ids in total.
- **Model polish.**
  - Clothing and packs; tools, devices, medical and food (printed packaging).
  - Weapons: 46 firearms, attachments, magazines, ammo, 24 melee and throwables. They share one palette shader in
    `src/weapons/models/kit.js`, and the weapons review is done.
  - Street props and car wrecks: `src/city/roads/*`.

### In progress (the cloud session ended partway through these)

| Track | Files | Done | Left to do |
|---|---|---|---|
| Site props polish | `src/game/items/sites/` kit.js, layout.js, models.js, props.js, vehicles.js | Kit upgrades, the props redone, a lofted helicopter fuselage with a door opening, glazing, skids, torn panels and soot, car details | Check every site kind in game, day and night, near and far; perf before/after |
| Street review fixes | `src/city/roads/` cars.js, materials.js, models.js | An open hood shows the modelled engine bay (in progress) | Open car doors read as flat black slabs edge-on: they need a deeper inner door card and a lighter inner colour. On the far and low car LODs a broken rear window shows the dark cabin block at medium range. The boom-gate base is a plain box. |

- `test/roads.mjs` prints vertices/3 as "tris". That's wrong now that prop geometry is indexed.
- The open items from the street-props agent:
  - The 2-line far-LOD hook in `src/city/Roads.js` (around line 179) was added outside that agent's file list.
    Keep it: without it the prop LODs do nothing.

### Last checks (commit after b5c3387)

- **Node suites:** all pass.

  | Suite | Result |
  |---|---|
  | logic | 41 |
  | items | 19,183 |
  | weapons | 2,785 |
  | combos | 1,937 |
  | mood | 132 |
  | placeables | 259 |
  | sites | 1,655 |
  | vehicles | 241 |
  | ext-arms | 530 |
  | ext-gear | 1,948 |
  | ext-kitchen | 645 |
  | ext-leisure | 510 |
  | ext-mobility | 393 |
  | ext-outdoors | 638 |
  | ext-pharmacy | 556 |
  | ext-senses | 442 |
  | ext-tech | 592 |
  | roads | ok |
  | buildings | ok |

  `test/creatures-ai.mjs` is sometimes flaky because it is timing-based.
- **Boot check:** see "Boot check of this commit" at the end.

## Next steps (offer these)

1. **Build the NPCs** when the user says go. Follow docs/NPC_PLAN.md:
   - §13 work packages: WP0 "spine and contracts" lands first, then WP1–WP13 by milestone M1–M5;
   - §14 test and balance plan;
   - §15 decisions. The villains show as "Black Reef" (id `mano`) and "Ash Crew" (id `pele`); there is no heiau. An
     offline raid takes at most 25% of food, water and materials and never takes equipment.

   Fairness rules that must hold:
   - detection capped at 150 m;
   - at most 85% hit chance;
   - at most 3 NPCs aiming at the player at once.

   The previous session built big features with multi-agent workflows. Use them only if the user opts in (the word
   "ultracode" or "use a workflow").
2. **Run better on their PC.** On first launch, detect the GPU and pick a preset (low/medium for integrated
   graphics). Add dynamic resolution that holds a target fps by moving `renderScale` (the TAA resolve already
   upsamples). The settings live in `src/core/Settings.js` (QUALITY_PRESETS) and the options UI in `src/ui/Menus.js`.
3. **Finish the polish** in the in-progress table above. Then boot-test, take before/after shots, and commit a "tested
   snapshot".
4. **Refresh the play link** after any change the user should see (see below).

## The play link

- https://claude.ai/artifact/4mz7mUypiJHFMfk4Qq9FQT is a private Artifact: the built game, playable in a desktop
  browser with nothing to install. The page is titled "Deadtide v0.1.0".
- It is built from **b5c3387** (Artifact version 3, label "v0.1.0 (b5c3387)").
  - Version 2 was built from b04e927, where weapons dropped on the ground drew white. b5c3387 fixes that with a white
    1×1 roughness map on the weapon palette material in `src/weapons/models/kit.js`.
- Saves made through the link live in that browser only.

To rebuild and republish:

1. Build into a scratch folder:
   ```
   git archive <commit> | tar -x -C <tmp>/src
   ```
   Link or copy `node_modules` into it, then run:
   ```
   npx vite build --outDir <tmp>/play
   ```
   The result is about 254 files and 47 MB, under the Artifact limits of 255 files and 64 MB per publish.
2. Change the `<title>` in `<tmp>/play/index.html` to `Deadtide v<version>`.
3. Publish with the Artifact tool:
   - `file_path`: `<tmp>/play/index.html`
   - `root`: `<tmp>/play`
   - `files`: every other file mapped to its relative path
   - `url`: the link above, so the same link updates
   - `label`: `v<version> (<sha>)`
4. Artifacts refuse `.gz`, `.bin` and `.glb`. Map those three with `{ "from": path, "contentType": "application/wasm" }`.
   The game reads them as raw bytes, so this works: `data/terrain.bin.gz`, `models/characters/anims.bin` and every
   `models/characters/*.glb`.
5. The page runs without cross-origin isolation. HeightField falls back to plain buffers, and saves fall back to
   memory when IndexedDB is blocked.
6. Test the build before publishing:
   ```
   node test/artifact-smoke.mjs <tmp>/play <outdir>
   ```
   It serves the build the way the link does and saves the menu and an in-world screenshot. For b5c3387 it reported
   no errors and the world loaded.

## Running on a desktop

- **Playing locally.** Install Node.js LTS from https://nodejs.org and open a NEW terminal. Then, in the repo
  folder, run:
  ```
  npm install
  npm run dev
  ```
  and open http://127.0.0.1:5190 in Chrome or Edge.
  - If PowerShell blocks scripts, use `npm.cmd`.
  - `npm run dev` serves with COOP/COEP (see vite.config.js), so the workers share one terrain buffer.
- **Headless tests on a desktop.**
  1. Run `npx playwright install chromium` once.
  2. `test/lib/browser.mjs` then uses the real GPU through ANGLE: d3d11 on Windows, metal on macOS. This path is
     **untested on Windows**. If WebGL fails, set `SWIFTSHADER=1` to use the CPU (slow).
  3. The browser lock is in the OS temp folder on Windows.
- **Node suites** (all `node test/<name>.mjs`):
  - logic, items, weapons, combos, mood, placeables, sites, vehicles, roads, buildings;
  - ext-arms, ext-gear, ext-kitchen, ext-leisure, ext-mobility, ext-outdoors, ext-pharmacy, ext-senses, ext-tech.

  Also, slower and some with a browser:
  - creatures, creatures-ai, vegetation, buildings-interior, buildings-runtime, buildings-walk;
  - vehicles-play, roads-probe.
- **The quick start URL:** `/?quick=1&mode=creative&at=<x>,<z>&yaw=<deg>&hour=<h>`. Some useful spots:
  - Honolulu street: -4020,-10090
  - a site test spot: -2620,-9850
  - Waikīkī: -3880,-9660

  The globals are `window.__app` and `__app.game`. Dropping an item looks like:
  ```
  const { makeStack } = await import( '/src/game/items/ItemDB.js' );
  __app.game.items3d.drop( makeStack( 'akm', 1, { full: true } ), pos );
  ```
  Sites spawn with `__app.game.spawnables[ 'site_heli_crash' ].spawn( pos, { yaw } )`.

## Git on the desktop

- A GitHub ZIP has no `.git`, so a session there can't commit or push. The easiest fix is GitHub Desktop: File →
  Clone repository → `inigorodriguezbt-lang/dzz`, branch `claude/hawaii-survival-game-o34w3f`.
- Or install Git for Windows and run:
  ```
  git clone -b claude/hawaii-survival-game-o34w3f https://github.com/inigorodriguezbt-lang/dzz.git
  ```
  It asks them to sign in to GitHub because the repo is private.
- To turn the unzipped folder into a repo instead, run these in the folder:
  ```
  git init
  git remote add origin https://github.com/inigorodriguezbt-lang/dzz.git
  git fetch origin claude/hawaii-survival-game-o34w3f
  git reset --soft FETCH_HEAD
  git checkout -B claude/hawaii-survival-game-o34w3f
  ```
  Then check that `git status` is clean.
- Commit on `claude/hawaii-survival-game-o34w3f` and push there. No PRs unless asked, and no model names in commits.

## Boot check of this commit

The game code is b5c3387. The handoff commit changed only docs and `test/lib/browser.mjs`. The check was one
headless boot on lavapipe.

- **Run:**
  - Start: `?quick=1&mode=creative&at=-4020,-10090&yaw=60&hour=10`. Ready after 34 s.
  - Steps:
    1. Dropped an AKM, M4A1, Glock 17, Remington 870, katana and fire axe 4 m ahead.
    2. Spawned `site_heli_crash`, `site_crash_car` and `site_military_checkpoint`.
    3. Switched to night (21:30).
- **Results:**
  - No page errors.
  - Dropped weapons show their real finishes (wood, dark metal), not white.
  - The helicopter wreck, camo net, tent and crashed car render by day and by night.
  - The stats read 483 draws and 2.5M triangles at that spot, at 14–29 fps on the software renderer (not a real
    measure).
- **Not checked yet:**
  - close-ups of every site kind;
  - perf before/after for the sites and street polish;
  - the street-review fixes listed above.
