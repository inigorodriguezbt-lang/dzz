# Deadtide NPC plan: people, factions, companions and settlements

This is the design of record for the NPC system (task #115). It replaces the three proposals (experience-first,
systems-first, world-first). The build follows the work packages in section 13. Every tunable number here goes into
`src/npc/constants/*.js` (one file per area, written by WP0), so balance passes edit numbers, not code.

Checked against the repo before writing (Node scripts on the real data):

- **Item ids.** Every item id in this document exists in the catalogue. The one exception is the new item `marked_map` (3.6).
- **Coordinates.** Town coordinates come from `public/data/world.json`.
- **Roads.** Roadblock and checkpoint positions come from `buildNetwork()`: 23 roadblocks and 10 checkpoints.
- **Anchors.** Anchor buildings were counted per town from the baked buildings. Land-use centroids come from `hf.surfaceAt`.
- **Aim and sight tables.** These come from Monte Carlo and integration of the exact formulas in section 5.
- **APIs (critic pass).** Every API named in 12.4 was re-read in the source. Corrections are folded in:
  - `physics.near( x, z, r, out )`; `physics.boxes` is a Map.
  - `survival.medicate( def )` stops bleeding; `treat()` does not.
  - `'vehicle:exit'` is already emitted.
  - Creatures hides avatars beyond 110 m on low quality.
  - `Crafting`'s `FUEL` is private: use `crafting.fuelValue( id )`.
  - Interiors exist only within about 90 m of the player.
  - The Commands "creativeOnly" list only blocks in hardcore and marks survival saves as cheated.

---

## 0. Scores and synthesis

Each proposal is scored from 1 to 10 per criterion.

| Criterion | Experience | Systems | World |
|---|---|---|---|
| Coverage of the brief | 10 | 8 | 9 |
| Fun and depth | 10 | 7 | 9 |
| Fairness (not overpowered, not omniscient) | 9 | 10 | 8 |
| Technical soundness on this engine and budget | 7 | 10 | 8 |
| Buildability by parallel agents | 8 | 9 | 8 |
| **Total (of 50)** | **44** | **44** | **42** |

**Experience-first.**
- Strengths:
  - It has the best moment-to-moment play: standoffs, stick-ups, recruitment demands, shadows and scouts, downed and revive.
  - Trust and traits you can hear.
  - The witness rule.
  - A pacing director with an intensity meter.
- Weaknesses:
  - It is heavier on the engine: pre-materialised static camps at 150–220 m, a scope glint, many props per actor.
  - Its reinforcement travel times do not match its walking speeds.

**Systems-first.**
- Strengths:
  - It has the best skeleton: tiers A/B/C, a squad commander plus a utility brain, pure seeded modules, and a "belief only" rule (brains never read the true position).
  - Line-of-fire maths without raycasts, near-miss suppression read from `ballistics.list`, rationed cover and LOS.
  - A fairness charter with one test per rule.
- Weaknesses: thinner on geography, on faction identity and on the player-facing social layer.

**World-first.**
- Strengths:
  - It has the best world: factions on real places, toll gates from real roadblock events, and a 512 m territory grid.
  - Bands on the road graph, off-screen fights, homes changing hands.
  - A ledger-authoritative economy with real items, crops from existing produce, works, captives and world events.
- Weaknesses:
  - Its aim model is a probability table converted back into a spread, so it is weak against moving targets.
  - Barter that rolls back on close is fragile.

**Backbone: Systems.** The brief's two hard constraints are "not overpowered, not omniscient" and the 4-CPU, software-rendered
test budget, and projects of this size fail on those. The Systems architecture is the one that makes them testable.

**Grafts:**
- From World: the cast and its places, territory, bands and routes, posts on roadblocks, the settlement ledger and
  jobs, crops, works, home stock counters, captives, world events and radio chatter.
- From Experience:
  - the encounter protocol and standoffs, recruitment with demands, shadows and scouts;
  - trust and traits, gestures versus spoken orders on J, downed and revive, the witness rule;
  - the pacing director, subtitled barks with procedural voices, and the companions' death and respawn policy.

**New in this plan:**
- One retuned aim model, with a hard floor on spread and a mid-torso aim point (5.6).
- One sight model, with base 115 m and a cap of 150 m (5.3).
- Six factions plus drifters, merged from the 6 + 7 + 7 proposed.
- Attack tokens: at most 3 hostiles fire aimed shots at the player at once (5.6).
- Draw parity: anyone who can shoot you is drawn on every quality setting. A zoomed view (binoculars, scope) lets you
  scout a home from 260 m (9.4).

---

## 1. The brief as a checklist

Every point of the brief, where this plan answers it, and the check that proves it is done.

| # | Brief point | Answered in | Done when |
|---|---|---|---|
| 1 | Add NPCs, both good and bad | 3 | Every faction spawns via `/summon` and in the world; good and bad behave differently on identify (test npc-ai §B) |
| 2 | They follow you | 6.4 | A companion follows a 150 m course through a door room at jog speed, lag ≤ 20 m, never teleported in view |
| 3 | You settle with them somewhere | 7.1 | "Make camp" with ≥ 1 companion founds a camp (board, store, marker); companions become residents |
| 4 | At the settlement they work on stuff | 7.3, 7.5 | Residents hold jobs with visible work poses near the player; the ledger produces real item stacks |
| 5 | Self-sufficient provided there's food and water | 7.4 | The balanced worked example survives 30 game days with no player input; remove water and people leave or die within 2–5 days |
| 6 | Different factions, good and bad | 3.1 | 2 good, 2 neutral, 2 bad factions plus drifters, each with its own kit, look, behaviour and homes |
| 7 | Factions spawn in some areas | 3.2, 3.3, 9.1 | Deterministic homes and posts on the real islands; territory patrols drawn from home rosters |
| 8 | …and also randomly | 3.4, 9.2 | Random encounter director: one band every 7–11 real minutes on the move, weighted by territory |
| 9 | Bad ones are aggro | 3.8 | Manō and Ka Pele attack on identify (Manō sometimes robs first); bad drifters ambush |
| 10 | Good ones want to join you | 6.1 | Seekers walk up and ask; ʻOhana members ask at Friendly; rescued people join |
| 11 | Good ones turn aggro if you attack them | 3.10 | The grievance rule: grazes are forgiven with a warning; deliberate hits turn the group hostile and cut reputation |
| 12 | Random single NPCs can follow you | 6.1 | Good drifters tail you at 25–40 m and ask "Can I come?"; shadows; bad scouts tail you to find your camp |
| 13 | Each faction has custom equipment | 3.6, 3.7 | Kits by real item ids, real loaded guns, faction armour and pockets; bodies drop exactly what was carried |
| 14 | Group size varies | 3.5 | Per faction and band kind ranges, from a single drifter to 24-strong strongholds |
| 15 | Their settlements are good places to raid and loot | 8 | Stores, armory, leader's footlocker and real bodies; alarm, reinforcements and consequences |
| 16 | …with your companions | 6.5, 8.6 | J orders (Wait, Guard, Attack, Quiet, Loot) make a squad raid playable |
| 17 | Companions help you shoot and stuff | 6.5–6.9 | They fight with the same honest model, call out contacts, revive, treat bleeding, loot, carry and guard |
| 18 | Not overpowered: they miss | 5.6 | Hit rates per tier and distance never above 85 % at any range; TTK floors; at most 3 aimed shooters on you at once (test npc-ai §C) |
| 19 | Not omniscient: can't detect you from anywhere | 5.3–5.5 | Awareness builds over time, range capped at 150 m, light, rain, stance, camo and cover matter, belief-only targeting; every shooter is drawn on screen (9.4) |
| 20 | Full creative control: best NPC system ever | 2, 3.8, 6, 8, 9.3 | Extras: standoffs, tolls, stick-ups, shadows and scouts, captives and rescues, homes that change hands, radio chatter, crops and works, named enemies, barter, a job board |

---

## 2. Experience pillars and core loops

### 2.1 Pillars

| # | Pillar | What it means in play | Hard rule that enforces it |
|---|---|---|---|
| 1 | **Read the world, not the HUD** | No nameplates, health bars or dots over heads. You tell friend from foe by armband colour, kit, posture, voice and what they do. | No per-NPC screen element except the F prompt within reach and the bottom-left squad strip. |
| 2 | **Fair is scary** | NPCs are as blind in the dark, as deaf through walls and as shaky under fire as you. Every detection has a tell; every hit comes from someone you could have seen. | Brains read only their own beliefs (`contact.est`). No shot beyond 150 m. A stare comes before every detection beyond 10 m. |
| 3 | **People are worth keeping** | Companions have a name, a background, one strength, one flaw, needs, trust and a voice you learn. Losing one hurts. | Death is permanent and never silently undone. Bodies of named people persist 2 game days. |
| 4 | **The world simulates people; the camera only shows them** | Factions, homes, bands and settlements live as data in game hours whether you are there or not. | One ledger per place, authoritative online and offline. Visible work is a representation of the ledger, never a second economy. |
| 5 | **Places have owners and consequences travel** | Every camp belongs to someone, has a routine you can learn and a stockpile worth taking. Killing a patrol thins its home. Emptying an armory starves their war parties. | Tier A deaths and thefts write back to home records immediately. |
| 6 | **Stories, not quests** | No quest log or objective text. Witnesses, trust, scouts, surrender, captives, raids and radio make the plot. | Player-facing text is only prompts, menus, 1–4 word barks and 1–3 word toasts. |

### 2.2 Core loops

| Loop | Seconds to minutes | Session (30–90 min) | Long term (game days) |
|---|---|---|---|
| **Meet** | Notice someone, read them (armband, weapon, posture), decide: avoid, talk or shoot. Standoffs at gunpoint. | Several encounters across a town or road; tolls and checkpoints. | Faction reputation; named enemies who remember you. |
| **Recruit** | Talk, meet their demand (food, water, a bandage, ammo), "Take in". | Build a squad of 1–4. | Trust grows; skills improve; desertion if neglected. |
| **Squad** | Follow, stance mirroring, callouts, covering sectors, fighting together, revives, looting. | Move through dangerous ground with your people. | People with history; deaths; burials. |
| **Raid** | Scout, count, wait for the shift change, distract, strike, loot bodies and stores. | One home raid with the squad. | Intel (`marked_map`) leads to the next target; claim a cleared home. |
| **Settle** | Make camp, assign jobs, stock the store, sleep under guard. | Supply runs to fix the food and water balance; build works. | Self-sufficient camps, raids on your camp, expeditions, captives to rescue. |
| **Lose and rebuild** | A companion goes down and bleeds out; a raid takes the store. | Recover the body and gear; take revenge. | The camp survives your death and keeps what you stored. |

---

## 3. Factions

### 3.1 Roster

There are six factions plus unaffiliated drifters. Player-facing names are short; the Group panel adds a plain
descriptor ("Manō · raiders").

| id | Name | Alignment | Flavour (one line) | Islands |
|---|---|---|---|---|
| `ohana` | **ʻOhana** | Good | Families, farmers and fishers holding villages together. Avoid fights, trade food, want help, join readily. | Oʻahu, Kauaʻi, Molokaʻi, Lānaʻi, Maui, Hawaiʻi |
| `kiai` | **Kiaʻi** | Good, lawful | Ex-police, firefighters, nurses and medics. Safe zones with rules, relief camps, radios, the job board. | Oʻahu, Kauaʻi, Molokaʻi, Maui, Hawaiʻi |
| `paniolo` | **Paniolo** | Neutral, territorial | Ranchers and hunters. "Kapu" land: warn, warning shot, then shoot. Trade meat; hire out hunters. | Molokaʻi, Maui, Hawaiʻi |
| `koa` | **Koa** | Neutral, isolationist | Task Force Koa: what is left of the Guard and Marines on the bases. Best kit, radios, fireteam tactics, restricted zones. | Oʻahu, Kauaʻi, Hawaiʻi |
| `mano` | **Manō** | Bad | The Manō Crew: raiders running the warehouse yards and the road tolls. Ambush, rob, extort, take captives. | Oʻahu, Kauaʻi, Lānaʻi, Maui, Hawaiʻi |
| `pele` | **Ka Pele** | Bad, fanatic | Fire cult out of Puna. Ash-smeared, torches at night, melee rushes and molotovs. **The infected ignore them.** | Hawaiʻi (core), Maui, Kauaʻi, Oʻahu (cells) |
| `drifter` | **Drifters** | Mixed (60 % good, 25 % neutral trader, 15 % bad) | Lone survivors and small families: the main recruit pool, the robbers who feign surrender, the traders on the road. | Everywhere on land |

Islands differ in danger. Oʻahu is the most contested. Molokaʻi is the quiet island: no Manō or Ka Pele homes, so a
good place to settle. Lānaʻi is small, with one ʻOhana town and a Manō outpost.

### 3.2 Homes on the real islands (territory)

Homes are planned deterministically at install by `world/planner.js` from the anchor list in `data/homes.js`. The id
format is `<faction>:<place>`.

- **How the planner places a home.**
  - **Building anchors.** The planner takes the anchor building of that type in that town (e.g. the police station) as
    a compound, plus a 25–40 m yard.
  - **Label and land-use anchors.** It searches within 600 m for a spot that passes `sites/plan.js fits()`. The spot must
    be of class open, forest or beach, with slope < 0.26, off roads and lots, and ≥ `FOOT[kind]` + 20 m from planned sites.
- **Sizes.**

  | Size | Population | r |
  |---|---|---|
  | outpost | 3–6 | 25 m |
  | camp | 6–12 | 40 m |
  | stronghold | 12–24 | 60 m |

  At most 12 residents are ever materialised at once. The rest are abstract reserves inside. A home's own range in the
  table below overrides these defaults (Waipiʻo is a small stronghold).

| Home id | Place (x, z) | Anchor | Size, population |
|---|---|---|---|
| **ʻOhana** | | | |
| `ohana:waianae` | Waiʻanae, Oʻahu (−8585, −12064) | village houses, shore | camp 6–10 |
| `ohana:haleiwa` | Haleʻiwa, Oʻahu (−7530, −14151) | fishing village, shore | camp 6–10 |
| `ohana:laie` | Lāʻie, Oʻahu (−5211, −14903) | village, shore | camp 5–9 |
| `ohana:kalaupapa` | Kalaupapa peninsula, Molokaʻi (label 7035, −8586) | label, shore | camp 6–10 |
| `ohana:lanai` | Lānaʻi City (7882, −3520); pineapple land centroid (7804, −3208) | village + land use 1 | camp 6–12 |
| `ohana:paia` | Pāʻia, Maui (15047, −4648); cane land (14170, −3635) | church + land use 2 | camp 6–10 |
| `ohana:hana` | Hāna, Maui (19997, −2546) | church, shore | camp 5–9 |
| `ohana:hanalei` | Hanalei, Kauaʻi (−25729, −22653) | village, shore | camp 5–9 |
| `ohana:koloa` | Kōloa, Kauaʻi (−25286, −18368); cane land (−25086, −18995) | land use 2 | camp 6–10 |
| `ohana:waipio` | Waipiʻo Valley, Hawaiʻi (label 25078, 6470) | taro valley | stronghold 8–14 |
| `ohana:hawi` | Hāwī, Hawaiʻi (22042, 4689) | village | outpost 4–6 |
| `ohana:captaincook` | Captain Cook, Hawaiʻi (20935, 14986) | police station + shore | camp 6–10 |
| **Kiaʻi** | | | |
| `kiai:hilo` | **Hilo Safe Zone** (31722, 11967) | police + hospital + fire (all in Hilo) | stronghold 14–24 |
| `kiai:kaimuki` | Kaimukī Station, Oʻahu (−3582, −9852) | police + fire + clinic | stronghold 12–18 |
| `kiai:wailuku` | Wailuku, Maui (13314, −4383) | police station | camp 6–10 |
| `kiai:lihue` | Līhuʻe, Kauaʻi (−24035, −19523) | clinic + school | camp 6–10 |
| `kiai:hanapepe` | Hanapēpē, Kauaʻi (−26927, −18576) | police station | outpost 4–6 |
| `kiai:kaunakakai` | Kaunakakai, Molokaʻi (6540, −7194) | police station | outpost 4–6 |
| `kiai:relief:<siteKey>` | every `fema_camp` site on an island with a Kiaʻi home, attached lazily (deterministic per site key) when `game.sites.near( pos, 600 )` first returns it, so install never plans every cell. Sites within 1.5 km of a hostile home stay plain loot sites. | the site's own props | outpost 3–6 (medics) |
| **Paniolo** | | | |
| `paniolo:waimea` | **Parker Ranch**, Waimea, Hawaiʻi (24179, 7681); ranch land (24807, 7981) | school + land use 3 | stronghold 12–18 |
| `paniolo:maunaloa` | Maunaloa Ranch, Molokaʻi (4065, −7806); ranch land (5383, −7891) | land use 3 | camp 6–10 |
| `paniolo:pukalani` | Pukalani (upcountry), Maui (15464, −3660) | church | camp 6–10 |
| `paniolo:waikoloa` | Waikoloa, Hawaiʻi (22472, 9114) | open land | outpost 3–5 (hunters) |
| **Koa** | | | |
| `koa:schofield` | Schofield Barracks, Oʻahu (−6996, −12788) | mil_hq + 13 barracks | stronghold 16–24 |
| `koa:mcbh` | Kāneʻohe Bay Marine Base, Oʻahu (−2957, −12120) | armory + 3 barracks | stronghold 12–18 |
| `koa:pmrf` | Pacific Missile Range Facility, Kauaʻi (−29377, −20246) | armory + 2 barracks | stronghold 10–16 |
| `koa:pta` | Pōhakuloa Training Area, Hawaiʻi (25664, 11382) | 3 barracks + mil_tent ×5 | stronghold 14–24 |
| `koa:maunakea` | Mauna Kea Observatories (26745, 10464) | observatory | outpost 3–5: **radio relay** (destroying it cuts Koa radio on Hawaiʻi to voice only for 7 game days) |
| `ruin:pearlharbor` | Pearl Harbor Naval Base, Oʻahu (−5471, −10812) | armory + 4 barracks | **fallen base**: no garrison, infected nest (spawnHorde 12–20 on approach), military loot |
| **Manō** | | | |
| `mano:waipahu` | **Waipahu Yards**, Oʻahu (−6318, −11327) | 24 warehouses | stronghold 14–24 |
| `mano:ewa` | ʻEwa Beach, Oʻahu (−6253, −10339) | police station + gun store | camp 8–12 |
| `mano:lahaina` | Lahaina, Maui (11008, −4202) | gun store + school | stronghold 12–18 |
| `mano:kihei` | Kīhei, Maui (14004, −2574) | gun store | camp 6–10 |
| `mano:kapaa` | Kapaʻa, Kauaʻi (−23384, −20872) | gun store | camp 6–10 |
| `mano:kona` | Kailua-Kona, Hawaiʻi (19997, 13038) | fire station + gas | camp 8–12 |
| `mano:garden` | Garden of the Gods, Lānaʻi (label 7426, −4216) | open rock | outpost 3–5 |
| **Ka Pele** | | | |
| `pele:pahoa` | **Pāhoa heiau**, Hawaiʻi (33598, 15028) | open, Puna | stronghold 12–18 |
| `pele:volcano` | Volcano, Hawaiʻi (29833, 15905) | open, Kīlauea | camp 6–12 |
| `pele:kau` | Kaʻū Desert, Hawaiʻi (label 27944, 17324) | lava desert, no water | camp 6–10 |
| `pele:naalehu` | Nāʻālehu, Hawaiʻi (25273, 20998) | village edge | outpost 3–5 |
| `pele:haleakala` | Haleakalā crater rim, Maui (16571, −1879) | open, high | camp 6–10 |
| `pele:napali` | Nā Pali, Kauaʻi (label −27292, −22334) | forest | camp 6–10 |
| `pele:kaena` | Kaʻena Point, Oʻahu (label −9849, −13915) | shore | outpost 3–5 |

That is 41 homes, plus the Pearl Harbor ruin and the relief outposts.

**Spacing rules** (the planner's test asserts them):
- ≥ 1.0 km between homes of non-hostile different factions.
- ≥ 0.8 km between hostile homes.
- Posts, relief outposts and the Pearl Harbor ruin are exempt.

**Front lines.** These are the deliberately close hostile pairs where "distant firefights" happen and war pushes start:

| Island | Front line |
|---|---|
| Kauaʻi | Kapaʻa–Līhuʻe road |
| Oʻahu | the ʻEwa plain (Waipahu–ʻEwa versus Kaimukī) |
| Maui | Kīhei–Wailuku |
| Hawaiʻi | Hilo–Keaʻau–Pāhoa |

**Territory grid** (`world/territory.js`).
- 512 m cells, land only: 1,027 cells. Each cell stores `owner:Uint8`, `strength:Uint8` and `infected:Uint8` (from `pop.density`).
- Strength = Σ over the homes of `power × exp( −d / falloff )`, where `power = live population × (0.5 + mean tier weight)`.
- Falloff by faction:

  | Faction | Falloff |
  |---|---|
  | ʻOhana | 1.5 km |
  | Kiaʻi | 2.5 km |
  | Paniolo | 2.5 km (×1.5 on ranch land) |
  | Koa | 3 km |
  | Manō | 2.5 km |
  | Ka Pele | 3 km (×1.3 at night) |

- The grid is derived, never saved. It is rebuilt when a home changes owner, falls, or loses more than 30 % of its population (< 30 ms).

**Territory you can read without UI.** Border markers are made with the sites Kit (`sign_board`, `flag_pole`,
`razor_wire`, `cairn`, decals), 1–3 per road crossing a territory edge with strength > 0.4, streamed like site props:

| Faction | Border markers |
|---|---|
| Manō | shark tags on walls and road signs |
| Koa | RESTRICTED AREA boards and razor wire at base radius + 150 m |
| Paniolo | KAPU boards at gates |
| Kiaʻi | SAFE ZONE boards |
| Ka Pele | red handprints and lit cairns at night |
| ʻOhana | nets and floats on fences, produce stand |

### 3.3 Posts on the roads

All 33 road events of type roadblock or checkpoint (23 + 10, from `buildNetwork()`) become 32 posts of 3–4 people.
The two kihei-wailea roadblocks 85 m apart are one post. Posts reuse the event's own props, plus 1 canopy and 1 crate. A post is occupied on a given game day with probability 0.6 when its faction's manpower is
≥ 50 %, and 0.3 below that.

| Faction | Posts (road event name, position) | What happens there |
|---|---|---|
| Manō (11 tolls) | kapolei-nanakuli (−7776, −10814), h3mid-kaneohe (−4434, −11185), waimanalo-kailua (−2560, −10917), lahaina-olowalu (11373, −3852), kapalua-kaanapali (10919, −5154), kihei-wailea (14156, −2030; two events 85 m apart = one post), kapaa-kilauea (−23361, −21333), lihue-kapaa (−23561, −20464), kona-koa (19655, 12452), kealakekua-kona (20387, 13524), checkpoint koa-waikoloabeach (19591, 11287) | **Toll:** "Pay or turn back." at 80 m. Pay = items worth ≥ 20 value (6.9 value function) into the toll crate, then free passage for 2 game days. They fire if you come inside 30 m unpaid. |
| Kiaʻi (8 checkpoints) | kahala-hawaiikai (−2940, −9833), hanapepe-kalaheo (−26663, −18646), waimeak-hanapepe (−27656, −18993), hilo-saddleeast (31000, 12245), checkpoints honomu-hilo (31600, 11178), lihue-kapaa (−23677, −19983), kihei-kahului (13927, −3640), paia-kahului (14600, −4563) | "Lower your weapon." If you are Friendly you pass, and they trade medicine. |
| ʻOhana (4 barricades) | sunset-haleiwa (−7236, −14589), haiku-paia (15411, −4738), kipahulu-hana (19975, −2195), lanaicity-manele (7783, −3120) | "Hey." If you are not hostile you pass; they ask for news and give hints ("Manō at Waipahu"). |
| Paniolo (3 gates) | maunaloa-hoolehua (4398, −7963), waimeabi-honokaa (24645, 7468), checkpoint kahului-pukalani (14544, −4176) | Kapu warning ladder (3.8). |
| Koa (5 checkpoints) | haleiwa-wahiawa (−7214, −13244), pmrf-kekaha (−29122, −19964), kekaha-waimeak (−28159, −19370), pta-saddlewest (25201, 11261), saddlemid-pta (26044, 11429) | Restricted-zone warning ladder (3.8). At Neutral or better they trade ammo for meds and food at the gate. |
| Ka Pele (1 gate) | keaau-pahoa (32653, 13565) | Attack on identify; at night the gate is lit with tiki torches. |

### 3.4 Random spawns per faction

The director (9.2) draws random bands from the faction mix of the player's cell. A faction's share is its territory
strength within 3 km on this island, plus a base weight. Drifters are always available.

| Faction | Base weight | Where its random bands appear | When |
|---|---|---|---|
| Drifters | 1.0 | Anywhere on land; towns by day, coast, campsite / beach_camp / fishing_spot sites | Day ×1.0, night ×0.5 |
| ʻOhana | 0.3 | Rural roads, farm land, coast, near infected towns (refugees) | Day only |
| Kiaʻi | 0.2 | Within 2.5 km of a station; roads between stations and relief camps (caravans) | Day ×1.0, night ×0.4 (patrols with torches) |
| Paniolo | 0.2 | Ranch land and wild cells within 5 km of a ranch home (hunters, riders on foot) | Dawn and dusk ×1.5 |
| Koa | 0.15 | Within 3 km of a base; the H-1/H-2 corridor and Saddle Road | Any; night with NVG |
| Manō | 0.5 | Roads, gas stations, town edges, road jam and crash events (ambush), within 6 km of a Manō home | Day ×1.0, night ×0.7 |
| Ka Pele | 0.3 | Within 6 km of a Ka Pele home on its island; coast and forest | **Night ×1.6, day ×0.3** |

### 3.5 Group sizes

| Faction | Roaming bands | Posts | Homes |
|---|---|---|---|
| Drifters | lone 60 %, pair 30 %, family of 3 10 % | – | hideout (house) 2–4 |
| ʻOhana | patrol 2–3; refugees 2–5 (1–2 armed); caravan 2–3 + 1 guard; hunters 2 | barricade 2–3 | outpost 4–6, camp 5–12, stronghold 8–14 |
| Kiaʻi | patrol 2–4; relief caravan 2–3 + 1–2 escort | checkpoint 3–4 | outpost 3–6, camp 6–10, stronghold 12–24 |
| Paniolo | hunters / riders 2–4 | gate 2–3 | outpost 3–5, camp 6–10, stronghold 12–18 |
| Koa | fireteam 4; squad 8 (2 fireteams, reinforcements only) | checkpoint 3–5 | outpost 3–5, stronghold 10–24 + abstract reserve |
| Manō | patrol 3–5; scavengers 2–3; ambush 3–5; stick-up 2–4; war party 5–8; scout 1 | toll 3–4 | outpost 3–5, camp 6–12, stronghold 14–24 |
| Ka Pele | night pack 4–7; raid 6–10 | gate 3–4 | outpost 3–5, camp 6–12, stronghold 12–18 |

Random Manō band size = round( 2 + 0.75 × squad size ) ± 1, clamped to the band range. Homes are **never** scaled
to the player: dangerous places stay dangerous.

### 3.6 Custom equipment (kits by item id)

Kits are built by `data/kits.js` into a real `PlayerInventory` per person. They are seeded by
`rng( hash32( seed, uid ) )`, so an untouched member's kit is a pure function of the seed.

**How kits are built:**
- Guns use `makeStack( id, 1, { full: true } )`, so they come loaded and chambered.
- Spare magazines come from `bestMagazine`.
- Ammo comes from `ammoIdsFor( caliber )`.
- Clothing is `WORN[ avatar ]` plus the faction pieces.
- Pockets are `rollLoot( 'npc_<fid>_pockets', R, 1–3 )`.
- **Condition** is rolled per piece, so raiding does not flood the world with pristine gear:

  | Faction | cond |
  |---|---|
  | Drifters | 0.25–0.6 |
  | ʻOhana | 0.3–0.7 |
  | Manō | 0.3–0.7 |
  | Ka Pele | 0.2–0.5 |
  | Paniolo | 0.4–0.8 |
  | Kiaʻi | 0.5–0.85 |
  | Koa | 0.55–0.9 |

  Legendary and epic pieces (m249, m24, hk416, nvg_goggles) roll at most 0.6.

| Faction | Primary (weight) | Sidearm | Melee | Armour and wear | Carried extras |
|---|---|---|---|---|---|
| Drifters | 40 % carry a gun: glock17 3, revolver_357 2, makarov 2, ruger_mk4 2, double_barrel 2, remington_870 1, lever_3030 1 | – | kitchen_knife, machete, baseball_bat, golf_club, crowbar | WORN only | backpack_school or backpack_hiking; 1–3 food; 6–24 rounds; `zombie_civilian` roll |
| ʻOhana | 60 % armed: double_barrel 3, mossberg_500 3, lever_3030 2, ruger_mk4 2, cz527 1 | revolver_357 (leaders) | cane_knife, machete, hatchet | palaka_shirt, work_gloves (20 %) | taro, poi, smoked_fish, banana; fishing_rod / throw_net (fishers); bandage 40 % |
| Kiaʻi | glock17 3, beretta_m9 3, remington_870 3, mp5 2, ar15_civ 2 | glock17 | police_baton | police_vest 60 %, riot_helmet 30 % | bandage 100 %; gauze; antibiotics (medics); first_aid_kit (medics); walkie_talkie (leader + 1); zip_ties; flashlight |
| Paniolo | lever_3030 4, rem700 2 (marksmen), cz527 2, mossberg_500 2 | revolver_44, revolver_357 | hunting_knife, cane_knife | paniolo_hat 70 %, hunting_vest, bandolier, work_gloves | salt_meat, smoked_meat; rope; binoculars (leader) |
| Koa | m4a1 4, m16a4 3, hk416 1 (leaders), m249 (1 per 2 fireteams, strongholds and reinforcement squads only), m24 (1 per 6, marksman) | beretta_m9, sig_p226 (officers) | – | plate_carrier 60 % else chest_rig; military_helmet 90 %; nvg_goggles on 1 in 3 at night; backpack_military | grenade_frag 1 + grenade_smoke 1 per fireteam leader; walkie_talkie per fireteam; mre; ifak; dog_tags |
| Manō | akm 3, sks 2, ak74 1, uzi 2, mac10 1, sawed_off 2, ar15_civ 1 | makarov, m1911, glock17 | machete, nailed_bat, barbed_bat | tactical_vest_scrap 35 %; leaders tactical_vest_plated; hockey_mask or balaclava 20 % | molotov 20 %; cigarettes, cash, gold_chain, okolehao, canned_beans; zip_ties (captive takers) |
| Ka Pele | 40 % ranged: compound_bow 3, crossbow 1, double_barrel 2, flare_gun 1 | – | **leiomano** (leaders), koa_spear, machete, pahoa, bamboo_spear, machete_spear | none (ash-smeared skin) | molotov (2 per pack leader, 1 per 3 others), road_flare, tiki_torch (lit at night), rags, cooking_oil, okolehao, ti_leaves |

**Ammo carried:**

| Faction group | Rounds |
|---|---|
| Koa, Kiaʻi | 1–3 spare magazines |
| Manō, Paniolo | 0–2 spare magazines + 8–30 loose rounds |
| ʻOhana, drifters | 6–20 loose rounds |

Ammo is consumed for real (5.6 reload rules). Their bodies give back exactly what is left.

**Loot tables** are defined from `src/npc/data/loot.js` with `defineLootTable`. All ids exist. Loot.js has no
`extends` keyword: "extends `police_locker`" means `items: [ ...LOOT_TABLES.police_locker.items, …extra ]`, copied at
install.

| Table | Entries |
|---|---|
| `npc_ohana_stores` | taro, sweet_potato, banana, poi, smoked_fish, raw_fish, pineapple, cabbage, onion, water_jug, firewood, rope, fishing_rod, throw_net, ti_leaves, bandage, ammo_12ga_buck, ammo_3030, ammo_22lr |
| `npc_kiai_stores` | canned_beans, canned_tuna, mre, water_bottle, bandage, gauze, antibiotics, first_aid_kit, ifak, splint, ammo_9mm, ammo_12ga_buck, ammo_556, walkie_talkie, flashlight, zip_ties |
| `npc_kiai_armory` | extends `police_locker` + glock17, beretta_m9, remington_870, mp5, ar15_civ, police_vest, riot_helmet, police_baton, grenade_flash |
| `npc_paniolo_stores` | salt_meat, smoked_meat, raw_boar, raw_goat, rope, hunting_knife, ammo_3030, ammo_308, ammo_44mag, ammo_357, paniolo_hat, work_gloves |
| `npc_koa_stores` | mre, water_bottle, ifak, first_aid_kit, bandage, ammo_556, ammo_9mm, dog_tags, walkie_talkie, nvg_goggles (epic weight) |
| `npc_koa_armory` | extends `military_armory` |
| `npc_mano_stores` | cigarettes, cash, gold_chain, okolehao, canned_beans, canned_tuna, beer_bottle, whiskey, ammo_762x39, ammo_9mm, ammo_12ga_buck, ammo_45acp, tactical_vest_scrap, molotov, rags, zip_ties, lanyard_keys |
| `npc_mano_armory` | extends `gunstore` + akm, sks, ak74, uzi, mac10, sawed_off |
| `npc_pele_stores` | rags, cooking_oil, empty_bottle, okolehao, road_flare, ti_leaves, molotov, tiki_torch, taro, poi, firewood, koa_spear (rare), leiomano (epic weight) |
| `npc_<fid>_pockets` | the faction's carried extras at low counts |

**New items: one.**
- `marked_map` (misc, uncommon, "Marked map").
  - It is defined from `src/npc/data/items.js` through `defineItems` at install, before saves load.
  - Its use verb is "Read", added through `addUseActions`. Reading it reveals 1–2 homes of the issuing faction as map
    markers.
  - Leaders carry one.
- The armory key is the existing `lanyard_keys` with `stack.data.home = '<homeId>'`.
- Captives are bound with existing `zip_ties`.

Armbands stay a visual prop, not an item. The armband equip slot (UI_DAYZ lists one) is a later Items and lead change
(13, WP12 later list).

### 3.7 Looks

Worn clothing is not rendered on NPC avatars. Identity comes from the avatar choice, `setLook` tint, hue, dirt and
aloha, one **armband** prop, one head prop for factions that have one, and the merged gun model.

| Faction | Avatars (existing ids) | setLook | Armband (1 draw, cloth band on `lUpper`) | Head prop |
|---|---|---|---|---|
| Drifters | any loaded civilian / tourist / runner avatar | random hue ±0.1, dirt 0.3–0.5 | none | none |
| ʻOhana | m_flannel, m_overalls, f_casual1, f_casual2, m_casual1 | warm aloha palettes 0, 3, 5 on shirt avatars; palaka blue / denim tint; dirt 0.2 | yellow | none |
| Kiaʻi | m_police1, m_police2, m_security, m_fire, f_nurse, m_medic | uniforms untinted; navy hue on civilians; dirt 0.1 | white (medics: white with red stripe) | none |
| Paniolo | m_worker, m_flannel, m_overalls | rust / leather tint; dirt 0.3 | brown leather | `paniolo_hat` (buildItemModel, merged) |
| Koa | m_army1, m_army2, f_army | untinted; dirt 0.15 | olive with white star | `military_helmet` (buildItemModel, merged) |
| Manō | m_casual2, m_casual3, m_casual4, m_security | **black aloha with red flowers (palette 2)**; charcoal tint; dirt 0.3–0.5 | red | red bandana band (members carrying a hockey_mask or balaclava show a mask prop instead) |
| Ka Pele | m_casual4, m_overalls, f_casual3, m_flannel | **ash: dirt 0.6–0.8, grey skin tint, red-orange cloth hue** | none | lit `tiki_torch` held at night (left hand, light via `game.itemLights`, ≤ 2 real lights) |

The infected have the infect shader and the living do not, so a living Koa soldier never reads as an infected soldier.

### 3.8 Behaviours (identify response and signature)

The identify response is what happens when the faction's awareness of you reaches 1.0, given your reputation tier (3.10).

| Faction | On identify (by reputation) | Signature behaviour |
|---|---|---|
| Drifters | Good: greet; 35 % are **seekers** who walk up and ask to join. Trader: "Trade?". Bad: rob or ambush, feign surrender (hands up, then draw at 6 m, 30 %) | Scared: weapon up if you aim at them; run from hordes; 1 in 3 good drifters tail you (6.1) |
| ʻOhana | Friendly and up: greet, often ask "Can we come?" (low-morale members); Neutral: greet at a distance; Wary: challenge; Hostile: defend | Avoid fights, flee hordes, warning shot before fighting, trade food, ask for help against threats near home ("Manō hit us.") |
| Kiaʻi | Friendly: greet, trade, jobs. Neutral: challenge "Lower your weapon." Inside a safe zone a drawn weapon gives 6 s to holster, then Wary; aiming at a member: hostile | Best fire discipline of the good factions; radios (1.5 km); medics heal Friendly players; run the job board |
| Paniolo | Kapu ladder on their land (at or below Neutral): "Turn back." at 100 m → deliberate warning shot 4–6 m wide at 70 m → engage at 40 m or 2 s after you aim at them. Off their land: neutral | Hunters at dawn and dusk; good at range; trade meat and salt_meat; hire out a hunter |
| Koa | Restricted zone (base radius + 150 m, and checkpoints): "Turn around." at 150 m → warning shot at 100 m → engage at 60 m or 2 s after you aim. At Friendly they let you to the gate. | Fireteams: bounding overwatch, flanking, called grenades, smoke when retreating; NVG at night; radios (1.5 km, and Big Island 4 km via the relay) |
| Manō | Hostile: attack on identify. **Stick-up** 35 % of the time (6.12) when ≥ 2 have LOS, within 25 m, and you are not aiming at them. **Toll** at posts. **Ambush** at jam and crash events (crouch behind wrecks, open fire ≤ 35 m). Wary (only reachable through tolls and tribute, cap −20): they challenge with "Pay or turn back." and a toll demand instead of shooting, and fire if you refuse and close inside 30 m | Loot bodies mid-fight; take captives (zip_ties) from beaten groups; extort player camps; scouts trail you home; morale breaks; surrender 35 % |
| Ka Pele | Attack on identify. Silent until the charge, then scream 1–2 s before sprinting at 5.5 m/s | Night packs with lit torches (a fair tell visible from > 100 m); melee rushes from cover; at most one molotov per pack every 20 s at 10–25 m; never surrender while their leader lives (10 % after); **not in `creatures.npcs`, so the infected ignore them and their camps sit among wandering infected**. They never attack the infected either: `Zombie.damage` turns an infected on whoever hurt it |

### 3.9 Relations matrix (faction to faction, −100..100)

Relations drift with world events: war pushes move a pair by −5, and homes taken by −10.

| | ʻOhana | Kiaʻi | Paniolo | Koa | Manō | Ka Pele |
|---|---|---|---|---|---|---|
| **ʻOhana** | — | +60 | +20 | 0 | −80 | −80 |
| **Kiaʻi** | +60 | — | +20 | +10 | −90 | −90 |
| **Paniolo** | +20 | +20 | — | 0 | −50 | −70 |
| **Koa** | 0 | +10 | 0 | — | −70 | −80 |
| **Manō** | −80 | −90 | −50 | −70 | — | −40 |
| **Ka Pele** | −80 | −90 | −70 | −80 | −40 | — |

Drifters use a per-person disposition:
- Good drifters count as +20 with good factions and −60 with bad ones.
- Bad drifters count as −10 with Manō and −60 with everyone else.
- Traders are 0 with everyone.

Two NPCs fight when their relation is ≤ −50 and one identifies the other.

### 3.10 Player reputation

**Tiers** (per faction, −100..100):

| Tier | Range | Behaviour |
|---|---|---|
| Hostile | ≤ −50 | Attack on identify |
| Wary | −49..−10 | Challenge and warn; attack if you close inside 40 m with a weapon up, aim at them, or ignore two warnings; no trade |
| Neutral | −9..+24 | Greet at a distance; trade at ×1.5 price; desperate ʻOhana may still join |
| Friendly | +25..+59 | Trade at ×1.2; recruit individuals; walk inside their homes; jobs; rest (sleep is safe there) |
| Allied | ≥ +60 | Trade at ×1.0; their patrols join your nearby fights; 2–4 defenders come to your camp's raids within 3 km; lend 1–2 fighters for 2 game days |

**Starting reputation:**

| Faction | Start | Limit |
|---|---|---|
| ʻOhana | +10 | – |
| Kiaʻi | +5 | – |
| Paniolo | −5 | – |
| Koa | −20 | – |
| Manō | −60 | capped at −20: tolls and tribute can make them Wary, never Neutral |
| Ka Pele | −90 | capped at −50: always hostile |

**Reputation deltas** (witnessed events only, see the witness rule below):

| Event | Δ with that faction | Spillover |
|---|---|---|
| Kill a member | −40 (leader −60) | +3 with its enemies |
| Deliberate injury (grievance ≥ 40, below) | −15 | – |
| Grievance 15–40 ("Last warning") | −3 | – |
| Kill a surrendered member | −20 | −15 with every good faction that witnessed it |
| Steal from their store, seen / found later | −25 / −5 | – |
| Kill their enemy near them (in their sight) | +5 (cap +20 per game day) | – |
| Help a fight they are losing (they survive) | +10 | – |
| Gift (via Give) | + value / 50 (cap +10 per game day) | – |
| Trade | +1 | – |
| Free a captive of theirs | +15 | – |
| Let a surrendered member go | +5 | – |
| Return loaned fighters alive | +5 | – |
| Finish a job | +10 to +20 | – |
| Pay a toll (Manō) | +3 | – |
| Raid their home (enter with alarm raised and kill ≥ 2) | set to −100 | +10 with their enemies within 3 km |
| Unwitnessed kill, body found within 24 game h near their land | −5 ("suspicion") | – |

**Spillover:**
- Allies of the faction (relation ≥ +40) get 30 % of the change.
- Enemies (relation ≤ −50) get −20 % of it.
- Killing Manō in Kiaʻi land nudges Kiaʻi up.

**Drift.** Reputation drifts back by 1 per game day toward the starting value. Hostile homes that you raided drift
toward −30 and no higher.

**Witness rule.** No omniscience for reputation either. An incident is attributed to you only if, at that moment,
another living member of that faction meets one of these:
- it had LOS to you or the victim within 60 m;
- it heard the unsuppressed shot **and** already had awareness ≥ 0.35 of you.

Otherwise the body found later raises that territory's alert for a game day (more patrols, sentry alertness ×1.25)
but costs only the suspicion delta. Silent, unseen kills are a real stealth option. Your Principled companion still
saw it (6.3).

**Grievance: good NPCs turn hostile if attacked, with a tolerance for accidents.**

- Each non-hostile NPC keeps `griev`, in damage-equivalent points, decaying 2 per real minute.
- Every hit whose source is the player adds `damage × w`. The same applies to the player's vehicle as driver
  (`Vehicles` passes source = driver):

  | Hit | w |
  |---|---|
  | Deliberate: crosshair within 4° of this NPC in the last 1.5 s, or any melee hit | 1.0 |
  | Stray: a hostile within 3 m of the shot line, or the player damaged a hostile in the last 3 s | 0.3 |
  | Explosion or fire splash | 0.6 |
  | Vehicle under 15 km/h | 0.2 |

- Reactions:

  | Grievance | Reaction |
  |---|---|
  | < 15 | bark "Watch it." · trust −4 |
  | 15–40 | "Last warning." · weapons up at you for 6 s (standoff, 6.12) · trust −10 · rep −3 |
  | ≥ 40, a melee hit while they are not fighting something else, or a kill | that NPC and every group mate who witnessed it turn hostile to you · rep −15 (−40 kill, −60 leader) |

- **Your companions act for you.** Their hits and kills count as yours for grievance, reputation and witnesses: w 1.0
  on an Attack order, else 0.5. A companion never fires at a non-hostile NPC unless ordered to Attack it, or that
  NPC has turned hostile to the squad. Their line of fire protects every non-hostile NPC (5.7).
- Companions use the same thresholds, doubled when trust ≥ 50. At the hostile threshold:
  - trust < 20: the companion turns hostile;
  - trust 20–69: they leave ("I'm done.") and become a loner record;
  - trust ≥ 70: they bark "Stop that." and lose 20 trust.
- **De-escalation.** Lower or holster your weapon and stay > 40 m away for 30 s, with that faction's rep ≥ −20.
  Hostile good NPCs then fall back to Wary and keep away.
- **Threat display.** Aiming at a non-hostile NPC within 25 m (crosshair within 4°, with a firearm in hands, ADS or
  within 15 m) for 2 s starts a standoff (6.12). Unarmed NPCs raise their hands; armed ones level their weapon and
  bark "Lower it." Koa and Paniolo engage after 2 s.

---

## 4. NPC model

### 4.1 Records (plain JSON, the authority)

Everything that lives in the world is a record. An entity (`Human`) is a temporary view of a record near the player
and writes back into it when it dematerialises or when the game saves.

**Person** (`people` map, keyed by `uid`):

| Field | Meaning |
|---|---|
| `uid` | Stable id `n<counter>`. `Entity.id` is a session counter and is never saved. |
| `name`, `sex`, `fid` | From `data/names.js`, seeded; `fid` is the faction id, or `drifter` |
| `bg` | Background (4.4) |
| `av`, `look` | Avatar id (pinned once materialised); `[ hue, r, g, b, dirt, aloha ]` |
| `voice` | `[ rate, detune ]`: rate 0.85–1.2, detune ±0.05 |
| `traits` | 1 strength + 1 flaw (20 % two strengths, 10 % two flaws) |
| `skills` | `{ aiming, first_aid, cooking, fishing, foraging, carpentry, mechanics, survival, stealth }` xp values (Skills-compatible) |
| `hp`, `bleed`, `wounds` | 0..100; bleeding wound count 0..3; `[ 'leg' \| 'arm' ]` with expiry hours |
| `needs` | `[ hunger, thirst, energy ]` on the Survival scale (0..100, 100 = full) |
| `morale`, `trust`, `griev` | 0..100 personal morale; 0..100 trust in the player; grievance (3.10) |
| `inv` | `PlayerInventory.serialize()`, or `null` while untouched (regenerated from seed) |
| `st` | `'home:<id>'`, `'band:<id>'`, `'squad'`, `'camp:<id>'`, `'loner'`, `'prisoner:<homeId>'`, `'riding'`, `'away'` (expedition), `'dead'` |
| `role`, `job`, `order` | Squad role (5.1); camp job (7.3); standing order (6.5) |
| `pos`, `yaw` | Last known position (rounded to 0.1 m) |
| `mem` | Memory of the player (4.5) |
| `grudge` | 0..2 for named enemies (4.5) |

**Touched people only.** A person record is stored in full only once the person is *touched*:
- met within 10 m;
- recruited, or a settler;
- a captive;
- a named enemy;
- a body carrying items;
- someone who survived a fight with the player.

Every other faction member is a count in its home or band. When one materialises, it gets a generated person from
`rng( hash32( seed, strHash( homeId ), slot ) )`, with the same name, look and kit on every load.

**Record cap.** At most 200 person records. Strangers who were only met (no other touch reason) expire after 5 game
days unseen; their slot goes back to a count. Pruning drops the oldest such strangers first. Squad members, settlers,
captives, named enemies and bodies with items are never pruned. A touched person stores `inv` only once it differs
from the seeded kit.

**Band** (moving group):

```js
{ id: 'b41', f: 'mano', kind: 'patrol'|'scav'|'war'|'caravan'|'refugees'|'hunters'|'reinf'|'traveller'|'pack',
  isl: 3, x, z, route: [ [ x, z ], … ], ri: 3, speed: 1.3, goal: { t: 'home'|'camp'|'point'|'player', id, x, z },
  n: 6, seed, hurt: [ 0, 0, 35, 0, 0, 0 ], ammo: 0.8, kcal: 2400, st: 'move'|'camp'|'fight'|'loot', t, ppl: [ uid… ] }
```

**Home** (faction settlement). The plan (place, size, layout seed) is derived from the seed and `data/homes.js`. Only
the deltas are stored:

```js
{ own: 'mano', man: 0.8 /* manpower 0..1.2 */, pop: 14, lost: 3, stock: { kcal, water, ammo: { '7.62x39': 640 }, meds, mats, val },
  alarm: 0, raided: -1, cleared: -1, taken: [ 'stores:0', 'armory' ], captives: [ uid ], known: 0|1, lastH }
```

**Camp** (player settlement): see 7 and 11.

### 4.2 The runtime entity (`agent/Human.js`)

`class Human extends Entity` has type `'npc'`. It flips to `'corpse'` on the update after the kill event, as Bandit
does, so stats see `'npc'`.

| Group | Fields |
|---|---|
| Identity | `rec`, `uid`, `fid`, `role`, `band`, `home`, `tier` (green / average / veteran / elite) |
| Body | `inst` (CharacterInstance), `body` (HumanBody), `mover` (Steer Mover), `props` (armband, head, torch), `gunView` |
| Kit | `inv` (PlayerInventory), `gun` (`{ stack, def, slot, mode, burstLeft, cycleT, reloadT, roundsCache }`) |
| Mind | `aware` (fixed array of ≤ 6 `{ key, a }`), `contacts` (≤ 6, 5.5), `S` (suppression), `morale`, `action`, `actionT`, `commitT`, `react` (`{ t, target }`), `mode` (5.2) |
| Squad | `squad` (runtime ref), `slot` (formation index), `trailI` (own trail index), `lofBlockedT` |
| LOD | `thinkDt`, `thinkT`, `animEvery`, `slotFrame`, `distCam`, `lodTier` (near / mid) |

**Hooks implemented** (all are already called by other modules):

| Hook | Behaviour |
|---|---|
| `damage( amount, info )` | Armour per zone, headshot rule, grievance, downed, morale, suppression, retarget gated by relations (5.8) |
| `hitTest( o, d, maxT )` | Cylinder prefilter, then the body capsules → `{ t, zone }` |
| `stagger( dir, amt )` | Flinch, plus a 0.4 s action interrupt |
| `knockback( dir, s )` | Ragdoll above 6 m/s, then rise |
| `stun( sec )` | The flashbang calls this (it calls `e.stun?.()` today and nobody implements it). No awareness gain, σ ×4, stagger, crouch, turn away. |
| `ignite( sec )` | Panic run 3–6 s, `hitEntity` kind `'fire'` at 6/s, roll after 3 s |
| `alertTo( pos, target, urgent )` | The laser-lure path in senses: treated as a heard noise at `pos` |
| `centre( out )`, `label`, `lootItems()` | For the existing corpse Search provider. `label` is the first name if known, else the faction noun ("Manō"). `lootItems()` returns the real inventory's stacks. |
| `dispose()` | Releases the instance (`lib.release`), detaches props and the gun view, releases the shell to the pool |

### 4.3 Needs

Needs mirror Survival's field names and scale, so item helpers accept an NPC needs object.

The **basis is game hours**, the same as every production rate in the economy. At the default 48-minute day this
equals the player's drain exactly.

| Need | Drain per game hour | Restored by | Effects |
|---|---|---|---|
| Hunger | 2.3 × activity (≈ 46 kcal: 1,100 kcal a game day) | food: `kcal / 20` points; dishes from `stack.data.dish` (never the def kcal) | < 40: eats from own pack (kneel `eat` act 2 s) when out of combat. < 20: morale −2/h, work ×0.8. 0 for 24 h: −10 hp/day, work ×0.5. Leaves after 72 h at 0 (companions and settlers). |
| Thirst | 3.12 × activity × heat (≈ 1.25 L a game day); heat = 1 + 0.05 × max( 0, °C − 28 ) | drink: 60 points per litre | < 40: drinks from own bottles. 0 for 24 h: −25 hp/day; leaves after 36 h at 0. |
| Energy | 1.08 awake; +12.5 asleep in a bed, +8 on the ground | sleep (8 h in 24) | < 15: σ ×1.2, sentries doze 10 %/h (alertness 0). |
| Health | +1 hp/h when hunger and thirst > 30; +2 with a medic; +10/h with food after a revive (limping until 70) | meds, rest | Bleeding: −0.25 hp/s per wound (Tier A); Tier B/C resolves bleeding as −10 hp |
| Morale | drifts toward a target (5.6 in combat, 7.6 in camp) | food, rest, a fire at night, wins, the player's visits | Thresholds in 5.6 (combat) and 7.6 (camp) |

Activity: asleep 0.6, idle 0.8, light work or walking 1.0, heavy work 1.35, combat 1.5.

The NPCs do not get infected. The infected's melee on NPCs stays plain damage, which keeps the companion loop clean.

### 4.4 Skills, background, traits, personality

**Aim tier** comes from the aiming skill level (Skills curve, 0..10):

| Level | Tier |
|---|---|
| 0–1 | green |
| 2–4 | average |
| 5–7 | veteran |
| 8–10 | elite |

Faction tier mixes (green / average / veteran / elite %) set the level at generation:

| Faction | Green | Average | Veteran | Elite |
|---|---|---|---|---|
| Drifters | 70 | 25 | 5 | 0 |
| ʻOhana | 55 | 40 | 5 | 0 |
| Kiaʻi | 15 | 50 | 30 | 5 |
| Paniolo | 10 | 45 | 40 | 5 |
| Koa | 0 | 30 | 55 | 15 |
| Manō | 35 | 55 | 9 | 1 |
| Ka Pele (guns) | 70 | 25 | 5 | 0 |

- Leaders are one tier above their faction's mode.
- Companions gain aiming xp from their own hits (+6 xp) and kills (+25 xp), so they visibly improve. Levels come from
  the pure `levelFor( xp )` in `Skills.js` (75 · n^1.6 per level): about 9 kills take a green companion to average.
  There is no `Skills` instance per person.

**Backgrounds** (companion-relevant; set at generation by avatar and faction):

| Background | Avatars | Skills at start | Kit bias |
|---|---|---|---|
| Fisher | m_swim, m_sport, m_casual2 | fishing 3 | fishing_rod, throw_net |
| Cook | any civilian | cooking 3 | cooking_pot |
| Nurse / medic | f_nurse, m_medic, m_surgeon | first_aid 3 | bandage ×3, first_aid_kit |
| Mechanic | m_overalls | mechanics 3 | toolbox |
| Builder | m_worker | carpentry 3 | hatchet, nails |
| Ranch hand | m_flannel | aiming 2, foraging 2 | lever_3030 |
| Cop / guard | m_police1, m_police2, m_security | aiming 3 | glock17, police_vest |
| Soldier | m_army1, m_army2, f_army | aiming 5 | m4a1, chest_rig |
| Firefighter | m_fire | first_aid 1, carpentry 1 | fire_axe |
| Surfer, tourist, office worker, pilot | the rest | none | none |

**Traits** (one strength and one flaw). Each has a mechanical effect and shows through behaviour and bark
frequency, never through text:

| Strength | Effect | Flaw | Effect |
|---|---|---|---|
| Brave | morale losses ×0.6; bleed-out 120 s | Nervous | morale losses ×1.5; first-shot settle ×1.3 |
| Sharp-eyed | sight R ×1.2; calls out contacts first | Hothead | in Return-fire mode, opens fire on an aware hostile within 15 m |
| Steady | σ ×0.85 beyond 40 m | Clumsy | step noise ×1.4 |
| Quiet | step noise ×0.6; half the barks | Chatty | 2× idle barks (never in Quiet mode) |
| Medic | heals 2×; revives in 2.5 s | Glutton | eats ×1.3 |
| Hard worker | job output ×1.25 | Lazy | job output ×0.75 |
| Loyal | trust losses ×0.5 | Greedy | trust −3 after each raid unless given one looted item |
| Scrounger | Loot area finds +1 stack; scavenger trips +30 % | Principled | trust −15 when you execute a surrendered NPC, rob good people or raid good homes; refuses to raid good homes |
| — | — | Shady (surrendered Manō only) | at trust < 30: 20 % per night to steal 2–5 store stacks and leave; 5 % to tip off Manō (camp becomes known). Telegraphed: keeps distance, barks less. |

### 4.5 Memory

- **Short-term (combat) memory** is the contact list (5.5). It is runtime only.
- **Person memory of the player** (`mem`, saved for touched people):

  ```js
  mem: { met: hours, gifts: valueTotal, saved: count, hitByYou: count, alliesKilledSeen: count, lastSeenH, demand: 'food'|'water'|'meds'|'ammo'|null, demandMet: 0|1 }
  ```

  It drives trust, greetings and grudges.
- **Faction memory:** `rep`, an incident log (last 8: `[ hours, kind, homeId ]`) and `knownCamps` (player camps this
  faction knows, 7.7).
- **Named enemies.** A hostile who sees you and escapes (retreat, flee, or let go) is promoted to a touched record with
  `grudge 1`.
  - It appears in 30 % of later encounters with that faction within 3 km of its home.
  - It barks "You." and targets you first.
  - After surviving 2 encounters (grudge 2) it gains one aim tier.
  - Named enemies are listed under Known in the Group panel ("Makoa · Manō").

### 4.6 Inventory and equipment

- Every touched person has a real `PlayerInventory`: equip slots, weapon slots, 4 pockets plus worn containers. It is
  serialised in the save.
- **Guns and ammo are real**, through `weapons/ops.js`:
  - `consumeRound` on every shot;
  - `bestMagazine` / `loadMagazine` on reloads;
  - `loadInternal` for tubes and cylinders;
  - `reserveFor` / `findAmmo` to know what is left.
- **Auto-equip** runs on `'container:close'` of their pack, and every 10 s while idle:
  - the best gun with matching ammo, by score `damage × rpmTier × rangeTier × (rounds > 0)`;
  - then armour by `armor.bullet` × cond, per slot;
  - then the bigger backpack.
  Overflow drops at their feet with `game.dropStack`.
- **Armour for NPCs is per zone, not the player's max-of-all** (5.8).
- **Spoilage.** Companion packs and settlement stores age hourly through `ageStored( g, items, dh, k )`. It skips the
  container open on screen.

---

## 5. Brain

### 5.1 Architecture: squad commander plus individual utility brain

Two layers, both mostly pure:

1. **Squad commander** (`brain/squad.js`, 1 Hz per squad, staggered, pure over data).
   - It picks a **posture**: idle, travel, patrol, defend, assault, search, withdraw, regroup.
   - It assigns **roles** from weapon and traits:

     | Role | Who |
     |---|---|
     | leader | highest tier |
     | gunner | LMG or auto rifle |
     | rifle | default |
     | flank | shotgun, SMG or Brave |
     | marks | scoped or bolt rifle |
     | medic | medic background or medical kit |

   - It also assigns **formation slots**, shares contacts, and reserves cover spots.
   - For companions, the player's orders replace the commander's posture (6.5).
2. **Individual utility brain** (`brain/utility.js`), at the think cadence (9.4).
   - It scores actions as a product of consideration curves in 0..1 times a weight.
   - The current action gets +15 % inertia and a minimum commit time: 0.6 s for combat micro-actions, 3 s for moves
     to cover.
   - Each action is a small state machine (`start / update / end`) in `brain/actions/*.js`.

| Action | Score (main factors) | Gate |
|---|---|---|
| Engage(target) | threat × √P̂hit × ammoK × (1 − 0.6·S) × posture | LOS this think, weapon ready, orders allow, P̂hit ≥ 0.05 |
| Suppress(est) | role base-of-fire × conf × (1 − S) | ammo > 50 %, conf > 0.6, posture assault or defend, ≤ 3 s per burst |
| TakeCover | exposure × (S + 0.2·visible threats) × (1 − inCover) × (1 / brave) | a cover spot exists (5.6) |
| Reload | (1 − mag / cap)² × (inCover ? 1 : 0.4); forced at 0 | spare ammo |
| HealSelf | bleeding × safety | bandage, gauze, rags or a medical kit |
| Revive(ally) | ally downed ≤ 25 m × safety × (medic 1.5) | med item |
| Grenade | target in cover ≥ 6 s, 12–35 m, conf > 0.6 | no friend or player within 12 m of the impact; squad cooldown 45 s; faction allows |
| Melee | target < 2 m, or no ammo and target < 6 m | melee weapon or fists |
| Withdraw / Flee | morale curve (5.6) | – |
| Surrender | morale < 10, enemy < 10 m, and (legs hit or no retreat path) | faction allows |
| Investigate | aware 0.35..1, or a heard contact | – |
| Search | contact conf < 0.4 | – |
| Follow / Formation / Wait / Guard | order and distance to slot | companions, travel |
| Work / Eat / Sleep / Idle | schedule × need | homes, camps |
| Loot | post-combat bodies within 20 m; ammo for own calibre, meds, food | companions on order; hostiles (5.9) |
| Talk / Standoff | encounter protocol (6.12) | non-hostile identify |

**Target choice:** `threat = 2·(shooting at me) + (1 − d/60) + visible + 0.3·(target hurt) + order mark`.
- The player gets **no** bonus beyond +0.2 from hostiles: no player aimbot.
- **Spread fire.** At most 2 shooters per target when 2 or more targets are known. Companions therefore draw fire,
  which makes them worth having.
- **Attack tokens** (5.6). Aimed fire at the player needs one of the player's tokens.

### 5.2 States and transitions

`mode` is the coarse state. In combat the utility brain picks actions inside `engage`.

```
calm:     idle ─ work ─ patrol ─ travel ─ follow ─ wait ─ guard ─ sleep ─ talk ─ trade
            │ aware ≥ 0.35 (sight) or heard step/noise
            ▼
alert:    notice (stop, head turns, "Hm?") ──aware ≥ 0.7── weapon up ──aware ≥ 1.0── IDENTIFIED
            │ heard gunshot / told by a mate                       │
            ▼                                                      ├─ relation ≤ −50 or rep Hostile ─▶ engage (after reaction time)
          investigate ── nothing found 45 s ──▶ calm (alert ×1.25 for 2 min)
                                                                   ├─ Wary / warning ladder ─▶ challenge ─▶ standoff ─▶ warning shot ─▶ engage
                                                                   ├─ Neutral+ ─▶ greet ─▶ talk (or seeker: approach)
                                                                   └─ Manō stick-up roll ─▶ stickup
combat:   engage { cover, suppress, reload, flank, bound, heal, revive, grenade, melee }
            ├─ contact conf < 0.4 ─▶ search (45 s) ─▶ alert
            ├─ morale < 25 ─▶ withdraw (bound back to the rally point)
            ├─ morale < 10 ─▶ flee, or surrender if cornered
            └─ hp ≤ 0, non-head, overkill < 50, eligible ─▶ downed (bleed-out timer) ─▶ revived | dead
terminal: surrender (hands up, weapon dropped) ─ captive (kneeling, bound) ─ downed ─ dead (→ corpse)
```

Transitions run at think time, except damage, stun and ignite, which interrupt at once.

### 5.3 Perception: sight

Pure functions in `brain/perception.js`. LOS and smoke are injected, so tests stub them.

```
R = min( 150, 115 m × V × light × weather × conceal × diff.sense × alert )

V        player: creatures.pi.visibility (stance 1 / 0.55 / 0.28 × still 0.7 / moving 1 / sprint 1.3 × torch at night
         (1 + 3.2·night) × camo 0.65–1.3; vehicle 1.5; swimming ×0.8)
         NPC target: same formula from its stance, speed, torch and camoFactor( equip, night )
light    1 − 0.68·night. Observer with NVG: 1 − 0.2·night. Target fired in the last 1.5 s: night counts as 0.
weather  1 − 0.3·rain (weather.rain near the player; weather.state far away)
conceal  target in a wild cell (sites/plan probe cls 'forest', or hf.wildness > 0.5, not road or street flags;
         cached per 32 m cell): standing 0.9, crouched 0.7, prone 0.5. Bushes have no colliders; this is the stand-in.
alert    asleep 0 (hearing only), working or idle 0.75, patrol or travel 1.0, sentry on post 1.15,
         alert or searching 1.25, combat 1.3. Sharp-eyed ×1.2.

cone (from the HEAD direction, body.look; sentries sweep ±60° every 3–6 s):
         focus ≤ 40° → 1 · peripheral 40–80° → 0.4 · 80–110° → 0.2, only within 12 m and only if the target moves ·
         beyond 110° → nothing beyond 3 m

rate (per second, while d < R, LOS eye 1.6 m → target chest, and no smoke):
         v = 1 − d / R
         rate = cone × ( 0.2 + 0.8·v ) × min( 1, 4·v ) / ( 0.35 + d / 30 )
aware += rate·dt;  aware −= 0.2·dt out of sight;  touch within 1.3 m = identified
tells:   0.35 notice (stop, head turns, "Hm?", lookW 0.8) · 0.7 weapon up · 1.0 identified
```

**Time to identify** in seconds (patrol alertness, focus cone, normal difficulty; "–" = longer than 30 s or never).
These are computed from the formula above:

| Player | R | 5 m | 10 m | 20 m | 30 m | 45 m | 60 m | 80 m | 100 m | 130 m |
|---|---|---|---|---|---|---|---|---|---|---|
| Walking, open, day | 115 | 0.5 | 0.7 | 1.2 | 1.7 | 2.7 | 4.0 | 6.8 | 23 | – |
| Standing still, day | 81 | 0.5 | 0.8 | 1.3 | 1.9 | 3.3 | 5.8 | – | – | – |
| Sprinting, day | 150 | 0.5 | 0.7 | 1.1 | 1.6 | 2.4 | 3.5 | 5.3 | 7.9 | 29 |
| Crouch-walking, day | 63 | 0.6 | 0.8 | 1.4 | 2.2 | 4.3 | – | – | – | – |
| Crouched still, day | 44 | 0.6 | 0.8 | 1.6 | 2.9 | – | – | – | – | – |
| Crouched still in forest | 31 | 0.6 | 0.9 | 2.1 | – | – | – | – | – | – |
| Prone crawling, day | 32 | 0.6 | 0.9 | 2.0 | 19 | – | – | – | – | – |
| Prone still, day | 23 | 0.6 | 1.1 | 7.8 | – | – | – | – | – | – |
| Ghillie, prone still, forest | 7 | 1.1 | – | – | – | – | – | – | – | – |
| Walking, heavy rain | 81 | 0.5 | 0.8 | 1.3 | 1.9 | 3.3 | 5.8 | – | – | – |
| Walking, night, no light | 37 | 0.6 | 0.9 | 1.8 | 5.3 | – | – | – | – | – |
| Crouch-walking, night | 20 | 0.6 | 1.1 | – | – | – | – | – | – | – |
| Walking, night, torch on | 150 | 0.5 | 0.7 | 1.1 | 1.6 | 2.4 | 3.5 | 5.3 | 7.9 | 29 |
| Walking, night, vs NVG | 92 | 0.5 | 0.7 | 1.2 | 1.8 | 3.0 | 4.9 | 19 | – | – |
| In a vehicle | 150 | 0.5 | 0.7 | 1.1 | 1.6 | 2.4 | 3.5 | 5.3 | 7.9 | 29 |

- **Peripheral vision** (cone 0.4) gives a walking player 1.8 / 4.3 / 10 / 17 s at 10 / 30 / 60 / 80 m.
- **A working settler** (alertness 0.75) identifies a walking player at 30 m in 1.9 s and never beyond ~86 m.
- **The notice tell** (0.35) comes 0.3 / 0.6 / 1.4 / 2.4 s after first sight at 10 / 30 / 60 / 80 m.
- **Compared with today's bandits**, which identify instantly at up to 95 × V m (142 m against a car), at ±84°, and
  see behind themselves once in combat.

**NPC versus NPC sight** uses the same function with the target NPC's own V, and the rate ×1.5 (NPCs do not stalk
each other carefully). It is checked only for hostile pairs within 120 m, and draws on the shared LOS budget (9.5).

### 5.4 Hearing

Input is `game.events` `'noise'` `{ pos, radius, source, kind }`, through the NPC system's own listener.

```
heard if d < radius × hear × indoorMismatch × ( 1 − 0.25·rain ) × diff.sense × ( 1 + 0.3·night )
hear: asleep 0.4 · working 0.8 · patrol 1.0 · sentry 1.2
indoorMismatch: 0.5 when exactly one of source and listener is indoors (city.isIndoors), as Creatures.onNoise does
```

| Noise (kind) | Effect | Position error of the estimate |
|---|---|---|
| Player steps (`step`: 14 default jog / 5.6 walk key / 5 crouch / 2 prone / 26 sprint × noiseMul, from `Player.js STANCE`) | only within 0.6 × the heard radius (8.4 / 3.4 / 3 / 1.2 / 15.6 m): aware += 0.4, capped at 0.9 (hearing alone never identifies); turn head and body to the bearing | bearing ±30°, distance ±25 % |
| Unsuppressed gunshot (`gunshot`, f.noise 220–550 m) | alert; contact `src: 'heard'`, conf 0.5; squad alert; within 120 m → engage the estimate (move to cover facing it) | 5 m + 10 % of d |
| Suppressed gunshot (radius × 0.3) | alert only; position unknown beyond 30 m | 25 % of d |
| Explosion | alert all; morale −10 within 30 m | 10 % of d |
| Door, glass, bash, metal, impact, firecracker, alarm clock, thrown can, radio, horn | investigate with 1 member (2 if loud), the rest watch | 20 % of d |
| `voice` (NPC barks and spoken orders: talk 25 m, shout 40 m) | aware += 0.5 at the source; investigate | 15 % of d |
| `alarm` (camp bell, home alarm, r 120–170 m) | alert all; residents go to defence spots | – |
| Own faction's or allies' noises, except gunshots and alarms | ignored | – |

**Near misses become contacts.**
- Once a frame, the system scans `game.ballistics.list` read-only. For each round not fired by a friend, it takes the
  segment from `pos − vel·dt` to `pos` against every awake Tier A NPC within 30 m, with a bounding check first.
- Effects:
  - closest distance < 2 m: S += 0.15;
  - < 0.6 m: a further +0.3;
  - the shooter becomes a contact `src: 'shot'`, along the reversed path at the true distance × (0.7..1.3).
- Cost: about 50 rounds × 20 NPCs, roughly 10 µs.

### 5.5 Memory, search and group alerting

**Belief-only rule.** Brain code reads only `contact.est`. It never reads `pi.pos` or a target's true position,
except in the think where perception returned *visible*. Code review enforces this, and the omniscience test (14) checks
it. It fixes Bandit.js aiming at the true position through walls.

| Contact field | Rule |
|---|---|
| `est` | Set to the true position only while seen. Dead-reckons with the last velocity for ≤ 1.5 s, then freezes. |
| `u` (uncertainty) | 1 + 1.5·age m, capped at 30 m |
| `conf` | seen 1 → −0.08/s; heard 0.5; told 0.7; shot-at 0.6 |
| Search | conf < 0.4: go to `est` cautiously (crouch-walk the last 15 m), then sweep 3 points 10–20 m around it, biased toward the target's last direction of travel. Give up after 45 s; stay alert (×1.25) for 2 minutes. |
| Forget | 60 s; sentries 180 s; the squad stays `alert` for 5 minutes |

**Group alerting:**

| Channel | Who receives | Delay | Error | conf |
|---|---|---|---|---|
| **Voice** (call-out bark + `voice` noise r 40 m; the player and the infected hear it too) | squad mates within 40 m | 0.5–1.0 s | σ 2 m + 10 % of d | 0.7 |
| **Radio** (Koa and Kiaʻi with a `walkie_talkie`; squelch audible within 15 m) | the whole faction within 1.5 km (Koa on Hawaiʻi: 4 km while the Mauna Kea relay stands) | 1.5 s | the sender's own `u` + 5 m | 0.7 |

Told and heard contacts decay like seen ones (−0.08 conf a second), so a radio report sends people to search an area.
It does not lock them on you.
| **Home alarm** (a sentry identifies you and is not dropped within 2 s) | everyone at the home; `'alarm'` noise r 170 m (it also draws infected) | 2 s | – | – |

**Told is not seen.** A receiver must get its own sight before aimed fire. Until then it may only lay suppressive fire
at `est`, and only if all hold:
- its role is base-of-fire;
- its ammo is > 50 %;
- conf > 0.6;
- each burst lasts ≤ 3 s.

### 5.6 Fair combat

**Reaction time** (identify → first trigger pull):

| Tier | Base | Turning > 60° | Weapon lowered | Relaxed or working (surprise) |
|---|---|---|---|---|
| Green | 1.0–1.6 s | +0.5 s | +0.25 s | +0.4 s |
| Average | 0.7–1.2 s | +0.5 s | +0.25 s | +0.4 s |
| Veteran | 0.5–0.9 s | +0.5 s | +0.25 s | +0.4 s |
| Elite | 0.4–0.7 s | +0.5 s | +0.25 s | +0.4 s |

- Retargeting adds 0.3–0.6 s.
- A hit on the shooter delays its next shot by 0.6 s: a hit-reaction window for you.

**Aim error model** (`brain/aim.js`). The NPC computes the shot direction with its own seeded rng and fires through
`ballistics.npcShot( this, gunId, muzzle, dir, { spread: 2·σ / d, visual: muzzle } )`. Rounds stay real: drop,
penetration, walls, armour. (`coneDir` draws a Rayleigh radius whose per-axis σ is `spread / 2` rad, so this maps σ
exactly. Pass `spread`; `npcShot`'s default is the gun's own hip spread.)

```
σ (metres, per axis, at the target) =
    max( 0.22, sqrt( L² + (s·d)² + (lag · v_lateral)² ) × settle × stance × move × light × supp × wound × burst / diff.attack )
    (the 0.22 m floor applies after every multiplier, difficulty included)
aim point: target pos + 0.6 × target height (mid torso)
lead: aim at est + vel · tof · leadSkill (green 0.3 · average 0.6 · veteran 0.85 · elite 1.0); drop compensated 70–100 % by tier

tier       L (m)   s (mrad)   lag (s)   settle τ (s)
green      0.33    17.0       0.12      1.6
average    0.28    13.2       0.10      1.2
veteran    0.245   10.5       0.08      0.9
elite      0.22     8.6       0.06      0.7

settle  1 + 1.2·e^(−t/τ), t = time since this target was (re)acquired
stance  shooter crouched 0.85 · braced on cover 0.75
move    shooter walking 1.8 (pistol, SMG and shotgun only, < 25 m; others stop to fire) · running: no fire
light   × 1.6 at full night when the target is unlit (no torch, no muzzle flash in 1.5 s; NVG removes it)
supp    1 + 0.8·S
wound   1 + 0.6·(1 − hp/100); arm hit × 1.3 for 15 s
burst   1 + 0.3·k for the k-th round of a burst (k from 0)
weapon  pistol beyond 25 m × 1.4 · bow and crossbow × 1.5 (plus drop) · scoped rifle beyond 60 m × 0.8
```

**Fairness multipliers** (applied by hostile shooters, never by companions):
- **First burst ×2.0 minimum.** The first burst at a target this squad has not fired at in the last 8 s is
  deliberately wide. You hear the crack before the hits. This applies to every target: you, your companions and your
  settlers.
- **Post-hit grace.** For 0.7 s after the player takes a hit, every hostile's σ is ×1.4, which gives time to react.
  It protects the player only.
- **Attack tokens.** At most 3 hostiles fire aimed shots at the player at once: 2 on easy, 3 on normal, 4 on hard.
  - A token is taken when a shooter starts a burst or an aimed single.
  - It is released 0.5 s after the burst ends, or when the shooter loses sight.
  - Shooters without a token suppress `est` (σ × 2.5, base-of-fire roles only), move to cover, or flank.
  - Tokens are per target. A companion has 2.
- **No fire under P̂hit 0.05,** except suppression. P̂hit is computed analytically from σ against the target box. Nobody
  wastes rounds at 200 m.
- **Hard range cap 150 m** for everyone. Living humans are drawn to 170 m on **every** quality setting (their own LOD,
  9.4; Creatures hides the infected beyond 110 m on low), so you can always see who shoots you.
- **Shotguns.** σ places the centre of the pattern; the pellets spread around it (`pelletSpread`). The 85 % cap is for
  the pattern centre: within 15 m at least one pellet can land more often than that, which is what shotguns are for.
  NPC shotguns never fire beyond 35 m.
- **A player in a vehicle** is not hit by rounds (`Ballistics` skips the player while `player.vehicle` is set). NPCs
  shoot the vehicle entity, aiming at its centre with the same σ, and its own damage model does the rest.

**Hit probability per shot** (%, settled, standing shooter, normal difficulty; at 10 / 30 / 60 / 100 m; Monte Carlo
of the formula above against the Ballistics player cylinder, r 0.32 m):

| Target situation | Green | Average | Veteran | Elite |
|---|---|---|---|---|
| Standing still | 59/34/14/6 | 69/45/21/9 | 77/55/29/14 | 82/65/37/19 |
| Walking across (1.6 m/s) | 53/32/13/6 | 63/42/20/9 | 72/53/29/14 | 79/62/37/19 |
| Jogging across (4.3 m/s) | 32/23/12/5 | 41/31/17/8 | 51/41/24/13 | 63/51/33/18 |
| Sprinting across (6.6 m/s) | 20/16/10/5 | 26/22/14/7 | 35/30/20/12 | 48/41/29/16 |
| Crouched still | 54/27/10/4 | 65/37/15/6 | 74/49/23/10 | 80/59/31/14 |
| Crouch-moving (2.1 m/s) | 42/23/9/4 | 53/34/15/6 | 64/44/22/10 | 74/55/29/14 |
| Prone | 33/14/5/2 | 43/21/8/3 | 53/29/12/5 | 61/38/16/7 |
| Only head showing (peeking) | 10/4/1/0 | 14/6/2/1 | 18/8/3/1 | 23/12/4/2 |
| First burst (×2.0–2.2) | 22/9/3/1 | 29/14/5/2 | 36/19/8/3 | 42/25/11/5 |
| Night, target unlit | 35/17/6/2 | 44/24/9/4 | 51/32/14/6 | 58/40/19/8 |
| Shooter suppressed (S 0.6) | 38/18/7/3 | 47/26/10/4 | 55/34/15/7 | 62/43/21/9 |
| Shooter walking (pistol / SMG) | 30/13/5/2 | 38/19/8/3 | 46/27/11/5 | 52/34/16/7 |
| Easy (÷ 0.8) | 47/25/9/4 | 57/34/15/6 | 65/44/21/9 | 72/52/28/13 |
| Hard (÷ 1.2) | 69/43/19/8 | 78/55/28/13 | 85/66/38/19 | 85/74/47/26 |

- **No cell exceeds 85 %.** The σ floor of 0.22 m caps every shot at about 85 % even at 10 m on hard.
- For comparison, a settled bandit today scores about 92/22/3/1: lasers up close, useless far away.

**Time to kill** (seconds from identify to 100 damage; one shooter with an AKM, 48 per hit, player unarmoured,
normal difficulty; median and 10th percentile, computed):

| Tier | 10 m still | 30 m still | 30 m jogging | 30 m crouched | 30 m night unlit | 60 m still |
|---|---|---|---|---|---|---|
| Green | 4.1 (p10 1.7) | 6.7 (3.0) | 9.2 (3.9) | 8.4 (3.8) | 11.9 (4.8) | 14.5 (5.8) |
| Average | 2.9 (1.2) | 4.9 (2.3) | 6.7 (3.0) | 5.9 (2.5) | 8.0 (3.3) | 9.7 (4.0) |
| Veteran | 2.3 (0.9) | 3.7 (1.8) | 4.9 (2.0) | 4.4 (2.0) | 6.0 (2.3) | 7.1 (2.9) |
| Elite | 2.1 (0.7) | 3.1 (1.4) | 3.9 (1.7) | 3.3 (1.6) | 4.7 (1.8) | 5.5 (2.2) |

**Balance target:** one average rifleman at 30 m needs a median of ≥ 4.5 s to down a still, unarmoured player.
Cover, movement and armour are the answer, which is the point. Difficulty acts twice: σ ÷ `diff.attack` (0.8 / 1 /
1.2) here, and `Survival.hurt` × `dmgIn` (0.6 / 1 / 1.35). So hard is about 1.6× deadlier than normal and easy about
0.5×. The TTK table is for normal.

**Trigger discipline:**

| Weapon and range | Pattern |
|---|---|
| Automatic, < 25 m | bursts of 3–5 |
| Automatic, 25–60 m | bursts of 2–3 |
| Automatic, > 60 m | semi singles |
| Pause between bursts / singles | 0.7–1.3 s / 0.4–0.8 s |
| Semi rifles and pistols | aimed singles every 0.35–0.8 s |
| Pump, lever and bolt | `boltTime` respected (Bandit ignores it today) |
| LMG suppressing | bursts of 4–8 at `est` |
| Shotgun (buckshot) | pump 0.7–1.0 s; no fire beyond 35 m |

**Reload** is real:

| Feed | Reload time |
|---|---|
| Magazine | `f.reload` × (green 1.15, average 1.05, veteran 0.95, elite 0.9) |
| Tube or cylinder | `perRound` × rounds, interruptible after any round |

- Reloads happen behind cover when possible, with the mag_out / mag_in sounds and the "Reloading." bark.
- When out of ammo they switch to the sidearm, then melee, then flee. Companions bark "Out of ammo."

**Muzzle origin.** The shot comes from the gun view's muzzle point. If the LOS from chest to muzzle is blocked (the
barrel is through a wall), it comes from chest + 0.3 m forward. `canShoot` is checked from the real muzzle height
(kneeling ≈ 1.04 m), so nobody fires into their own low cover. This fixes two Bandit bugs.

**Cover** (`brain/cover.js`, a port of Bandit `_firingSpot`, fixed):
- **Candidates:**
  - boxes from `physics.near( x, z, 16, reused )`;
  - boxes 0.6–1.3 m tall are low cover (crouch, rise to fire);
  - boxes > 1.6 m are high cover (step out from the corner side);
  - spot points are 0.6 m out on the side away from the threat estimate, plus the two corner points.
  - Results are cached per 8 m cell, keyed by `physics.boxes.size` (a Map) to catch interior stream-in.
- **Score:**

  ```
  protection by box.mat (concrete / rock / metal 1, wood 0.4, glass / foliage 0) × 3
  + hidden from est at crouch height (LOS est → chest blocked) × 3
  + can fire from it (LOS muzzle → est when up) × 2
  − |d to threat − idealRange| / 10 − travel / 8 − 0.5 per known threat with LOS to the path midpoint
  − 2 if reserved by a squad mate − 3 if in an ally's line of fire + 1.5 × flank angle (assault posture)
  ```

- **Ideal range by weapon:**

  | Weapon | Ideal range |
  |---|---|
  | shotgun | 12 m |
  | SMG | 25 m |
  | pistol | 18 m |
  | rifle | 45 m |
  | marksman | 90 m |
  | bow | 25 m |

- **Budget:**
  - 1 cover query per frame globally (a queue);
  - ≤ 12 candidates and ≤ 6 LOS rays each;
  - NPCs beyond 90 m use cached spots only.
  - Homes pre-bake cover points from their layouts (sandbags, crates), so defenders get them free.

**Tactics:**
- **Bounding** (assault, 3+ members). Half the squad moves 6–12 m to the next cover point, at most 4 s exposed, while
  the other half fires or suppresses. Then they swap. Koa and Kiaʻi bark "Moving."
- **Flanking.**
  - Trigger: the target has had no LOS for > 4 s while still firing, and conf > 0.5.
  - One flanker for squads of 3–4, two for 5 or more.
  - Goal: a point 60–90° off the base-of-fire axis around `est`, at ideal range, reached cover-to-cover with `steer`.
    A path plan is taken only when `nav.budget ≥ 2` (9.5).
  - The rest suppress `est` at half cadence with σ ×1.5. Manō bark "Flank him."
- **Grenades** (Koa frag and smoke, Kiaʻi flash only):
  - Thrown with `game.throwables.launch( def, { origin, vel, cooked: 0, source: this } )` on a ballistic solution,
    with impact error σ 2.5 m at 20 m (×1.6 for green).
  - Always shouted first, "Grenade." (or "Flash."), with a 0.8 s wind-up. That is your tell.
  - Smoke covers retreats, revives and crossings of > 20 m of open ground.
- **Grenade evasion.** NPCs read `game.throwables.list` (live throwables with `pos`, `fuse`, `t`, `kind`) every think.
  A live frag or molotov within 8 m makes them sprint away, if they saw it land or heard the shout.
- **Molotovs** (Manō 20 % of members, Ka Pele): 10–25 m, error σ 1.5–3 m, at most one per 20 s per group.
- **Melee:**
  - Telegraphed wind-up of 0.45 s (green 0.6 s), with `body.act( 'swipeR', 0.6 )` or a procedural overhead swing.
  - It lands at the end of the wind-up if the target is within 1.9 m and ±35°. Step back and it misses.
  - Damage is the melee def's damage × 0.8: `hitEntity` for entities, `survival.hurt( d, 'melee', { source } )` for
    the player.
  - Lone infected within 6 m are fought with melee when the NPC holds a blade or bat and is not Nervous: they know
    gunfire pulls hordes.
- **Ka Pele charge.** A scream 1–2 s before the sprint at 5.5 m/s, in a loose line, using cover until 15 m.

**Morale** (per NPC, 0–100; start: Koa 85, Kiaʻi 70, Paniolo 70, Manō 60, ʻOhana 55, drifters 45, Ka Pele 95 with
floor 40 while the leader lives):

| Event | Δ |
|---|---|
| Ally killed, seen / heard | −20 / −10 |
| Leader killed | −25 to all |
| Self hit | −0.3 × damage |
| Suppressed (S > 0.6) | −6 per second |
| Outnumbered (known enemies > 1.5 × friends) | −2 per second |
| Explosion within 30 m | −10 |
| Enemy killed | +8 |
| Reinforcements arrive | +15 |
| Out of combat | +1 per second back to the start value |

Brave ×0.6 on losses; Nervous ×1.5.

| Morale | Behaviour |
|---|---|
| < 45 | cautious: cover ×1.5, half the peeks |
| < 25 | withdraw: bound back toward the rally point (home, or cover 40 m behind), firing now and then, "Fall back." Fleeing groups can lead you to their home. |
| < 10 | break: flee; if cornered (enemy < 10 m, legs hit or no path), surrender |

**Surrender odds** when breaking and cornered:

| Faction | Odds |
|---|---|
| ʻOhana | 60 % |
| Drifters | 60 % |
| Manō | 35 % |
| Kiaʻi | 30 % |
| Paniolo | 30 % |
| Koa | 15 % |
| Ka Pele | 0 % while the leader lives, 10 % after |

**Surrender itself.**
- The NPC drops its gun as a saved world item (`items3d.spawn( stack, pos, { persistent: true, settle: true } )`),
  kneels with hands up (procedural pose) and stays until you are > 40 m away or 120 s pass.
- F options on a surrendered NPC: Let go, Search, Recruit (6.1).

**Suppression S** (0..1):

| Gain | Amount |
|---|---|
| Near miss < 2 m / < 0.6 m | +0.15 / +0.3 more |
| Hit | +0.4 |
| Explosion within 15 m | +0.6 |

- Decay: 0.25 per second (veteran and elite 0.35).
- Above 0.5 they hold in cover 1–3 s and do not peek. Above 0.6, 40 % duck instead of firing.

### 5.7 Friendly fire avoidance (`brain/lof.js`)

This is checked before every shot and every burst. It uses plain vector maths with no raycast, so it is safe from the
re-entrancy problem of `entities.raycast` (about 0.5 µs per check).

1. Segment: muzzle → aim point, extended 5 m beyond the target (rifle rounds pass through bodies at 45 %).
2. **The player** blocks the shot when the closest distance between the player's body line (`pos` to
   `pos + height`) and the segment is < 0.9 m + 0.015 × the along-distance. This applies to companions and to every
   NPC not hostile to the player.
3. **Friends** (same faction, allies at ≥ +40, squad mates and companions) within 40 m, through
   `entities.near( muzzle, d + 2, 'npc', reused )`, block under the same test with 0.8 m. For companions, every NPC
   not hostile to the squad counts as a friend, so a bystander drifter is never hit by your people.
4. Blocked for 0.4 s → sidestep 2 m perpendicular, or crouch or stand to change height. Blocked for 1.5 s → a new
   firing spot. Companions bark "Hold fire." (at most once per 8 s).
5. Grenades: never thrown with a friend or the player within 12 m of the predicted impact.

**Strays never start infighting.** If a round from a friend still hits (spread, penetration), `damage()` logs it as
accidental: no retarget and no morale loss beyond the hit itself. Allies retarget each other only after ≥ 3 hits from
the same source within 10 s. This fixes the measured bandit infighting: 544 frames of mate-targeting and one death
from a single stray.

### 5.8 Damage model (NPCs)

- **Health** is 100 for everyone. Armour does the work, not hit-point padding.
- **Zones** come from the body capsules × `Ballistics.ZONE`, which is unchanged: head 4, neck 2.5, torso 1, limbs 0.6.
- **Torso** damage × (1 − vest `armor.bullet` × cond), from the real worn vest:

  | Vest | armor.bullet |
  |---|---|
  | plate_carrier | 0.6 |
  | tactical_vest_plated | 0.55 |
  | police_vest | 0.45 |
  | tactical_vest_scrap | 0.25 |
  | stab_vest | 0.1 |

- **Head** damage × max( 0.3, 1 − 1.5 × helmet `armor.bullet` × cond ). military_helmet 0.35 gives ×0.475; riot_helmet
  0.1 gives ×0.85.
- **A head hit kills outright only if ≥ 60** after armour. Bandit kills on any head hit today; the infected need 45.

  | Head hit | Damage | Lethal? |
  |---|---|---|
  | 5.56 into a military helmet | 40 × 4 × 0.475 = 76 | yes |
  | One buckshot pellet, bare head | 14 × 4 = 56 | no |
  | 9 mm, bare head | 30 × 4 = 120 | yes |

- **Limb effects:**
  - legs: speed ×0.6 and limp (`style.limp`) for 20 s;
  - arms: σ ×1.3 for 15 s.
- **Bleeding:** a bullet hit causes a wound with 60 % chance, up to 3 wounds, each −0.25 hp/s. Bandaging takes 4 s
  kneeling.
- **Downed**, instead of dead, when hp ≤ 0 from a non-head hit with overkill < 50, no explosion ≥ 80 and not burning:

  | Who | Chance | Bleed-out |
  |---|---|---|
  | Companions | always, when the conditions above hold (a lethal head hit, a big blast or fire still kills) | 90 s (Brave 120 s) |
  | Leaders, Kiaʻi, Koa | 35 % | 45 s; crawl mode; may surrender |
  | Others | never: they die | – |

  - The revive rules are in 6.8.
  - Hostiles do not shoot downed NPCs during a fight. Manō "check the bodies" afterwards, which gives you a window.
- **Stealth takedown.** Melee from behind (> 110° off their facing) on an NPC with aware < 0.35 deals ×3 damage, lethal
  with any blade or bat. Melee noise r 10 m.
- **Death:** ragdoll (`body.ragdoll`), then `'corpse'` the next update. The existing Creatures Search provider works
  unchanged.
- **Kills by NPCs carry `source: actor`**, so they do not inflate the player's stats or hitmarkers. Squad kills are
  counted in `npcs.stats().squadKills`.

### 5.9 Medkits, food and looting bodies

- **Self-care.** Bleeding plus safety (no visible hostile for 3 s, or in cover) → bandage, gauze or rags (4 s, kneel).
  hp < 50 with a first_aid_kit or ifak → +30 hp over 10 s.
- **Treating others.** Medic-background or Medic-trait NPCs treat downed or bleeding friends within 25 m when safe.
  Kiaʻi medics heal a Friendly player on request (Talk → Heal), consuming their own items.
- **Food** is eaten from their pack at the thresholds in 4.3, outside combat, with the kneel `eat` act. Dishes read
  `data.dish`.
- **Looting bodies.** They take items from the corpse's `items` array, and from world items through
  `items3d.remove( item, { taken: true } )`, so building and site loot state stays in sync.

  | Who | When | What they take |
  |---|---|---|
  | Hostiles, after a fight | 60 s "check the bodies" window | guns, ammo, meds |
  | Hostiles, mid-fight | 25 % chance when no enemy has been aware of them for 5 s and the body is within 8 m | – |
  | Companions | on the Loot order, or automatically after a fight for ammo of their own calibre and meds | – |

### 5.10 The infected

- **Infected hunt NPCs.**
  - Live Tier A NPCs, except Ka Pele, are pushed into `game.creatures.npcs` every frame, after `Creatures.update`
    (which clears it).
  - The infected then chase, claw and bite them through the existing code (`Zombie.js` lines 245–254, 536–539) and
    retarget NPC shooters.
- **NPCs fight the infected.**
  - They see the infected through `entities.near( pos, 40, 'zombie', reused )` plus LOS within 30 m, with no awareness
    ramp: the infected don't hide.
  - Threat = 1 − d/30, ×2 when the zombie targets this NPC.
- **Gunfire noise stays real.** NPC firefights pull the infected (`Creatures.onNoise` pull), so raids become loud,
  three-way events. Abstract (off-screen) fights emit no noise.
- **Ka Pele** never target the infected (see 3.8).
- **Legacy bandits.** Entities from `/summon bandit` (Bandit.js) count as Manō for relations, so NPCs fight them.
- **Animals.** A charging boar or a dog that targets an NPC is fought like an infected within 15 m. Other animals are
  ignored. Live hunting is a later addition (M5); hunters hunt in the ledger.

### 5.11 Fairness charter (each line has a test, 14.2)

1. No detection beyond R (cap 150 m), behind beyond 3 m, or through walls or smoke.
2. A notice tell comes before every identification beyond 10 m, by ≥ 0.25 s.
3. After LOS is lost, belief error grows: > 4 m after 5 s if the player moved. No aimed fire while hidden. Suppressive
   fire at `est` (σ × 2.5) may still land through thin wood or foliage; such hits are logged as `supp` and stay
   ≤ 10 % of NPC damage to the player.
4. Reaction ≥ 0.4 s after identify. The first burst is ≥ 2× wider. Hit rates stay inside the table bands. Never 100 %
   over 30 shots at ≥ 10 m.
5. TTK median ≥ 4.5 s (one average rifleman, 30 m, normal).
6. Zero companion rounds land on the player in scripted crossfire. No retargeting among squad mates after one stray.
7. Hostiles can be heard: footsteps within 30 m (sound only), barks, radio squelch near Koa and Kiaʻi posts, torches
   at night.
8. Nobody shoots beyond 150 m, and every shooter within 150 m is drawn on screen, on every quality setting.
9. At most 2 / 3 / 4 hostiles (easy / normal / hard) fire aimed shots at the player at once.

---

## 6. Companions

### 6.1 Meeting and recruiting

**Where companions come from:**

| Source | How it happens | Start trust | Notes |
|---|---|---|---|
| **Seekers** | 35 % of good drifters walk up after greeting and bark "Got room for one more?". Prompt `[F] Take in` (alternative: Turn away). | 40 | Demand waived |
| **Drifters and ʻOhana by talk** | Talk → they state their situation in ≤ 4 words ("Need food.", "Looking for a group.", "Just passing."). The hold menu offers "Ask to join"; they name one **demand**. | 30 (+10 when the demand is met) | ʻOhana need Friendly, or Neutral with home morale < 35 |
| **Kiaʻi volunteers** | At Friendly, one volunteer per home per 7 game days (Talk → Ask for help) | 45 | Leaves if you kill good NPCs in their sight |
| **Hire** (Paniolo hunter, Kiaʻi guard) | Talk → Hire: 2 game days for items worth ≥ 40 value (6.9), e.g. 45 rounds of 5.56, 4,000 kcal of food or a rifle | 35 | Leaves at the end of the contract unless trust ≥ 60 |
| **Rescue** | A director encounter: drifters chased by 3–6 infected (9.2). Once saved they join on their own: "Thanks. I'll come." | 55 | The first rescue is guaranteed 20–40 min into a new character |
| **Downed survivor** | Encounter: "Help me." Revive them (6.8) | 50 | – |
| **Freed captives** | Hold F → Free at a Manō or Ka Pele home | 50 | Or they go home: +15 rep with their faction |
| **Surrendered Manō** | F → Recruit: 40 % accept | 10 | Always the **Shady** flaw; never leaders |
| **Loaned allies** | Allied faction: Talk to the leader → Ask for help: 1–2 fighters for 2 game days | 50 | +5 rep when returned alive |
| Koa | Never recruit. 1 in 20 soldier-looking drifters is a deserter. | – | – |

**Demands:**

| Demand | Share | Met by |
|---|---|---|
| Food ("Need food.") | 30 % | any food stack moved into their pack |
| Water ("Thirsty.") | 15 % | a drink, or a container with ≥ 0.5 L |
| Bandage or meds ("I'm hurt.") | 15 % | bandage, gauze, rags, first_aid_kit, ifak |
| Ammo for their gun, or any gun if they have none ("No ammo.") | 15 % | ammo of their calibre, or a firearm |
| Nothing | 25 % | – |

Giving is the existing InventoryUI verb "Move to Kai". When the demand is met they bark "Okay." and join.

**Join rule:** trust ≥ 30, and their faction tier allows it (above). **Squad cap: 4 following.**
- Recruits beyond the cap go to your camp ("Go to camp").
- With no camp: toast "No room".

**Random singles who follow you** (the brief's point 12):

- **Tag-alongs.** 1 in 3 good drifters who identify you while you are not hostile to them tail you at 25–40 m.
  - They stop when you stop.
  - They bark "Can I come?" when you stop within 15 m of them. `[F] Take in`; hold F → Turn away.
  - Ignored for 3 game hours, they leave.
- **Shadows.** 6 % of drifter encounters, only after you fought infected in their sight. They trail at 30–50 m.
  - They crouch when you look at them; `_inView` plus your look direction tells them they are seen.
  - Approached: 40 % run off, 60 % raise their hands ("Don't shoot.") and join with the demand waived.
  - Ignored for 5 real minutes, they walk up and ask.
- **Scouts (bad).** A lone Manō trails you at 60–90 m and never approaches.
  - If it sees you within 150 m of one of your camps' centres, that camp becomes **known** to Manō, which enables
    raids (7.7).
  - Companions can spot a scout with their own fair senses ("Someone's following us.").
  - Killing it or chasing it off prevents the discovery.

### 6.2 Trust (loyalty)

| Event | Trust Δ |
|---|---|
| Gave food or water while they were hungry or thirsty | +6 |
| Gave a gun, armour or a backpack | +8 |
| Gave ammo they can use | +3 |
| Healed or revived them | +12 |
| You killed what was hurting them (within 5 s) | +6 |
| Won a fight together | +2 |
| Time together | +1 per game hour (capped at +30 total from time) |
| Shared a camp night with a fire | +2 |
| Friendly fire from you | 3.10 grievance (−4 / −10 / leave) |
| Left downed (you > 80 m away while they were down) | −15 |
| Starving while you carry food | −3 per game hour |
| You took a stack from their pack (not via Loot area) | −1 |
| You killed another companion (all witnesses) | −40 |
| You killed a good NPC in their sight | −15 (Principled −25) |
| A companion died | −10 (everyone else) |
| Abandoned: separated > 2 game days while not at a camp | −20 |
| Traits | 4.4 (Loyal halves losses; Greedy, Principled, Shady) |

| Trust | Behaviour |
|---|---|
| < 15 | Leaves at the next safe moment ("I'm done.") and becomes a loner record nearby (meet again, trust kept) |
| 15–35, **Wary** | Ignores Attack when out of ammo or hurt; follows orders 30 % slower; Shady acts; the Group panel says "Wary" |
| 35–70, **OK** | Normal |
| > 70, **Loyal** | Covers your retreat (stays between you and the threat estimate); shares food with you when you are starving; stays 1 extra game day when starving before leaving |

### 6.3 Personality and barks

Each companion's personality comes from four things:
- **traits** (4.4);
- a **background** (4.4);
- a **voice**: a per-person rate of 0.85–1.2 and detune on a set of 14 procedural vocalisation buffers ("hey", "hm?",
  "ugh", "go", "huh" shapes, a two-tone whistle, radio squelch). The buffers are made once in `agent/voice.js` and
  registered with `audio.buffers.set`. Synth is not touched.
- **bark frequency**: Chatty ×2, Quiet ×0.5.

**Meaning goes into subtitles.** Each bark sends a chat line `Kai: Contact left.` through `game.events.emit( 'chat', {
text, kind: 'npc' } )`. Hostiles use kind `'npc-foe'`. The lines are gated by the existing `subtitles` setting (on by
default) and heard within 30 m (spoken) or 50 m (shout). **Hearing what enemies say is a fairness tell** ("Flank
him.", "Grenade.").

| Group | Lines (≤ 4 words, no exclamation marks) |
|---|---|
| Squad | Contact left · Infected behind · I count four · Reloading · I'm hit · I'm down · Got one · Moving · Clear · Hold fire · Low on ammo · Out of ammo · Grenade · Fall back · Hold still · Hungry · Thirsty · Tired · Someone's following us · I'll wait · Okay · On it · I'm done · Stop that |
| Drifters and good factions | Hey · Hm? · Who's there · Lower it · Stay back · Don't shoot · Got room for one more · Can I come? · Watch it · Last warning · Move along · Lower your weapon · Thanks · Need food · Manō hit us |
| Paniolo and Koa | Turn back · Turn around · Last warning · Contact · Moving up · Restricted |
| Manō | Over there · Flank him · Drop the bag · Pay or turn back · Check the bodies · You |
| Ka Pele | wordless howls and screams; one chant line at night camps |

**Rate limits:**
- 1 bark per NPC per 4 s; squad-wide 1 per 1.5 s; 3 per second globally.
- Priority: combat > alarm > needs > social > idle.
- Idle chatter: 1 per 3–5 minutes while walking, never in Quiet mode.
- At most 6 voice sounds at once (9.5).

### 6.4 Following

- **Formation in the open.** Slots in your local frame (x right, z back):

  | Slot | Position |
  |---|---|
  | 1 | (−2.5, 3) |
  | 2 | (2.5, 3) |
  | 3 | (−4.5, 6) |
  | 4 | (4.5, 6) |

  - Slots spread ×1.5 in the open at a jog and are reassigned to the nearest companion every 2 s.
  - Steering is `steer()` toward the slot point. A* is used only when a slot has been blocked for 3 s.
- **Single file indoors and in narrow places** (`city.isIndoors`, or `pathFree` side probes < 3 m).
  - Companions follow the player breadcrumb trail at 2 / 4 / 6 / 8 m.
  - Each companion has its own `trailI` into `creatures.trail`, the same pattern as `creatures.trailPoint`. That is
    how they follow you through doors and round corners without spending path plans.
- **Speeds.**

  | Gap to slot | Speed |
  |---|---|
  | ≤ 6 m | match the player: walk 1.6, jog 4.3, crouch 2.1 m/s |
  | 6–15 m | jog |
  | > 15 m | sprint 6.2 m/s (`run_fast` clip via gaitScale; the player sprints at 6.6) |

  On a long sprint they lag a little and close up when you stop, which reads naturally.
- **Catch-up teleport.** When a companion is > 70 m behind or has had no path for 6 s, it is moved to a trail point
  15–25 m behind you that is **not in view** (`creatures._inView` false). It is never moved in view.
- **When you stop** (still for 1.5 s), they halt at their slots and each takes a watch sector: rear 180°, left, right,
  front. Their honest senses watch your back, which is why companions are worth having.
- **Stance mirroring.**
  - You crouch: they crouch within 1 s and crouch-walk (step noise ×0.35).
  - You go prone: they crouch and hold. There is no prone clip.
- **Doors.**
  - They pass doors you opened.
  - A closed door (Steer's `mover.blocked` is a door box) is opened with `city.doors.npcOpen( d, ent )`, a quiet open
    with no toast and the NPC as noise source (a Buildings ask, 12.4).
  - Until it lands, the fallback sets `d.target = 1`, adds it to `doors.moving` and calls `doors._save( d )`.
  - Locked doors stay shut for companions: they wait at the door ("Locked.") until you open it. Raiders bash them
    (`door.bash`).
- **Traps.** Slots and paths avoid `placeables.near( p, 1.5, 'trap' )` and tripwires (`arms_tripwire`).
- **Water.** If you swim more than 30 m out, they wait on the shore ("I'll wait.").
- **Vehicles.** When you get in, companions within 12 m run to the car and "board" 1.5 s after reaching it: the entity
  dematerialises and the record state becomes `riding`, up to the vehicle's seats − 1. On exit they rematerialise
  beside the doors. Visible passengers are a later Vehicles ask.
- **Teleports and respawn.**
  - A player jump > 350 m on the same island turns companions into a `traveller` band walking to you at 1.4 m/s. They
    rematerialise when within 190 m.
  - A jump to another island sends them home to your camp, or makes them loners at the old spot for 2 game days.
    Toast "Kai went home".

### 6.5 Commands

**Key J** (the existing `gestures` binding, which nothing reads today; relabelled "Orders").

- **Tap J: Regroup.** All companions follow and close up, with a whistle sound if standing.
- **Hold J 0.3 s:** the numbered menu at the crosshair, keys 1–9.
  - It opens through `openActionMenu` (`items/placeables/menu.js`). That menu runs on a transparent screen and
    captures Digit1–9 itself, so the hotbar does not fire. The world keeps running while it is open and the player
    stands still, which is a real cost in a fight.
  - The crosshair target (a companion, an entity, a ground point) is captured when the menu opens. Go there and Attack
    use that captured target.
  - If you are looking at a companion within 15 m when it opens, the order goes to that one only (the name is the
    menu title). Otherwise it goes to the whole squad.

| # | Order | Effect |
|---|---|---|
| 1 | Follow | Formation or file (6.4). The default. |
| 2 | Wait here | Hold within 2 m; return fire only; cover the sector they face. |
| 3 | Guard here | Hold the spot as sentries: split 360° sectors, fire at will within 40 m, fall back to the point. Persists when you leave (a stationed guard). |
| 4 | Go there | Ground point under the crosshair (`physics.raycast`, ≤ 120 m); move in formation, arrive within 3 m, then hold. |
| 5 | Attack my target | The entity under the crosshair (`entities.raycast` from the camera, ≤ 150 m), or the nearest hostile to the point. A `told` contact at its true position: you are the sensor, which is fair. |
| 6 | Hold fire / Fire at will | Toggle; the label shows the current state. Hold fire shoots back only when hit. Fire at will engages hostiles that are aware of the squad, or within 40 m. |
| 7 | Stay quiet / Normal | Quiet: crouch-walk, melee preferred on unaware targets, Return-fire only, whispered contact barks only. |
| 8 | Loot area | Bodies and containers within 25 m (6.9); report "Done." or "12 rounds 5.56." |
| 9 | Camp ▸ | Make camp (7.1, shown when no camp within 300 m) · Go to camp (walk there; teleport when out of view > 400 m) · Stay at camp (becomes a resident) |

**Gestures versus voice.**
- Crouched or prone: orders are silent hand signals, received only by companions with LOS within 25 m. The player
  model plays no gesture.
- Standing: orders are spoken or whistled, as a `'voice'` noise r 25 m **that hostiles and the infected hear**. That is
  a real trade-off.

**Person menu** (looking at a companion, hold F; tap F = Follow/Wait toggle):

| Verb | Effect |
|---|---|
| Talk | Status line ("Hungry.", "Low on ammo.", "Good.") |
| Pack | Their inventory container (6.9): give, take, carry |
| Follow / Wait | Toggle |
| Heal | Uses your item on them |
| Job ▸ | Settlers only (7.3) |
| Send to camp | – |
| Dismiss | `ui.confirm`; they become a loner nearby |

### 6.6 Squad combat: helping you shoot "and stuff"

- **Leash.** Companions stay within 25 m of you. Firing spots are picked 4–12 m from their **formation slot**, not
  from themselves. They never get more than 5 m ahead of you unless ordered to Attack or Go there.
- **Targets.** Priority is threat (5.1), +1.5 for the target **you** last hit (from the `'damage'` event with source the
  player), +3 for an ordered target. Spread fire spreads the squad over targets.
- **Callouts.** Each companion uses its own senses, so callouts are fair. Direction is relative to you (ahead / left /
  right / behind, + "far" beyond 40 m): "Contact, left." · "Infected, behind." · "I count four." (said when you stop
  with enemies in view).
- **Suppression.** On Attack against a target in cover, they alternate aimed bursts with 3 s of suppression at `est`
  (σ × 2.5). This pins the target while you flank, and costs ammo.
- **Treating you.** A companion with a bandage (and a Medic one, at 2× speed) helps when you are bleeding, out of
  combat for 5 s and within 5 m: "Hold still." Standing still 3 s calls `survival.medicate( def )` with the companion's
  own bandage, gauze or rags def and removes that stack from its pack. (`medicate` lowers `bleeding` and then calls
  `treat`; `treat` alone does not stop bleeding.) It happens at most once per 30 s.
- **Guarding you.** While you loot (`actions.busy` or a container open) or sleep, they face outward on a 360° split.
- **Grenades.** Only on an Attack order against a target in cover, with no friend or player within 15 m of the impact.
  Always called: "Grenade."
- **Ammo is real.** "Low on ammo." at < 1 magazine; "Out of ammo." switches to the sidearm, then melee. After a fight
  they pick up matching ammo from bodies within 20 m.
- **No friendly fire on you:** 5.7. Their accidental hits are logged with `info.source` for tests.

### 6.7 Needs on the road

- Companions drain needs on the 4.3 basis and eat and drink from their own pack.
- **Time jumps** (sleep, `/time`, reading): `Game.sleep` adds the hours in one step. When the clock jumps by more than
  0.25 h, every live human applies `drain( needs, dh )`, healing and bleeding for the jump. They eat and drink from
  their pack at the end of the jump. Nobody moves.
- With nothing left they bark the need once, then remind you at most every 10 game minutes.
- Loyal companions share their food with you when your hunger is < 20.
- Their pack ages with `ageStored` (4.6).

### 6.8 Death, injury and rescue

- **Downed** (5.8): ragdoll, then `lying` or crawl; bark "I'm down."; the squad strip shows red; bleed-out 90 s
  (Brave 120 s).
- **Revive.**
  - The player: hold F for 4 s, with bandage, gauze, rags, first_aid_kit or ifak in inventory (one is consumed).
  - A Medic companion: 2.5 s, automatically when safe (no hostile aware within 30 m).
  - They stand at 30 hp and limp until healed past 70.
- **Death** of a companion:
  - toast "Kai died"; squad morale −25; `survival.mood( { unhappy: 20 } )`;
  - the body persists as a corpse record for 2 game days.
  - **Bury:** hold F with a shovel, 8 s. It leaves a `cairn` prop: squad morale +10 and unhappy −10.
- **Captured.** A camp lost in a raid (7.7) or a squad member taken in a Manō stick-up gunfight becomes a prisoner at
  the nearest Manō or Ka Pele home: kneeling, bound with zip_ties. That is a rescue raid. Free gives trust +30.
- **Player death.**
  - Companions within 60 m guard your body, crouched and facing out.
  - When no hostile has been aware of them for 30 s, they walk home (to your camp: on return "You made it.").
  - With no camp, they wait as loners at the death spot for 2 game days and keep their trust.
  - Respawn is detected by the `g.dead` true → false edge, or a lead-added `'respawn'` event (12.4).
  - Carrying your gear from your body to the camp store needs a Bodies read API (`bodies.near( pos, r )`, 12.4) and
    lands in M5.

### 6.9 Pack, carry, trade

- **Pack.** `ui.openContainer( { key: 'npc:' + uid, label: name, capacity: <their worn capacity>, items: <flat list of
  their stacks>, kind: 'body', pos: <static clone of their position> } )`.
  - The companion **freezes while its pack is open**, so InventoryUI's 4 m auto-close never triggers. The pack closes
    by itself when the companion is hit, or when a hostile within 30 m becomes aware of the squad.
  - The container's `capacity` is in volume units (`containerVolume`), like every world container.
  - On `'container:close'` they re-equip (4.6) and drop overflow at their feet.
  - Giving uses the existing "Move to Kai" verb. That is also **Carry**: they carry what you hand them, up to their
    capacity.
- **Loot area** (order 8). Within 25 m they search corpses (`lootItems()`) and world items, through
  `items3d.remove( item, { taken: true } )`.
  - They keep what they can use (their calibre, food, meds, then by value) and report it.
  - Nothing is looted during combat. Scrounger finds +1 stack.
- **Trade** (traders: drifter traders, ʻOhana fishers, Paniolo, Kiaʻi). Talk → Trade opens the trader's
  **wares** container (`npc:trade:<uid>`).
  - The label shows the running balance: `Trade · +12` / `Trade · −30`.
  - On close, if what you took minus what you gave (times the tier markup ×1.0 / 1.2 / 1.5) is negative, the taken
    stacks are returned by uid and the toast reads "Not enough".
  - When the lead adds container `accept( stack )` hooks (12.4), the balance is enforced live.
- **Value function** (there is no currency; `cash` is an item):

  ```
  value( stack ) = W[ cat ] × units × K[ rarity ] × cond
  K: common 1 · uncommon 2.2 · rare 6 · epic 20 · legendary 65          (≈ 1 / RARITY_WEIGHT)
  W: food: kcal / 100 per unit · drink: litres × 3 · ammo: 0.4 per round · medical 4 · firearm 25 · melee 5 ·
     clothing 3 + 30 × armor.bullet · backpack 6 · tool 3 · material 1 · misc 1 · cigarettes 2 each · cash 0.01 each
  ```

  Tolls cost ≥ 20 (10 cigarettes, or 2,000 kcal of food). A hire costs ≥ 40 (45 rounds of 5.56, 4,000 kcal of food, or
  any uncommon rifle at 55).

### 6.10 Dismissal

| How | Result |
|---|---|
| Dismiss (hold F → Dismiss, `ui.confirm`) | They become a loner record nearby and keep their trust; meet them again and re-recruit without a demand |
| Send to camp | Removes them from the squad, keeps them in your people |
| Trust < 15 | They leave on their own (6.2) |

### 6.11 Sleeping under guard

- With ≥ 1 companion or a camp guard on watch, `Game.sleep` is allowed with infected nearby as long as none are within
  15 m. The watch wakes you when a threat's awareness reaches 0.35.
- Sleep is refused while any hostile human is aware of you within 60 m (`npcs.hostileNear( pos, 60 )`).
- Both need the lead's sleep hook (12.4).

### 6.12 Encounter protocol: greetings, standoffs, warning ladders, tolls and stick-ups

The same protocol runs for every non-hostile identification. The numbers come from the faction (3.8).

```
IDENTIFIED (non-hostile) ── you are not aiming at them, weapon lowered or holstered ──▶ GREET ("Hey.") ──▶ talkable
        └─ you aim at them (crosshair within 4° for > 1 s, firearm in hands, ADS or < 15 m) ──▶ STANDOFF ("Lower it.")
STANDOFF ── you lower ──▶ GREET (trust −5)
         ── you keep aiming 5 s, or close within 8 m ──▶ WARNING SHOT (a real round 2–3 m wide, real noise)
         ── still aiming 3 s more, or any hit ──▶ ENGAGE (grievance maxes out; the group turns; 3.10)
WARNING LADDER (Koa, Paniolo, Kiaʻi safe zones) ── distances in 3.8 ── bark ▶ warning shot ▶ engage
```

**Reading the player.** These are cheap signals, computed once per think for NPCs in alert states.

| Signal | Effect |
|---|---|
| Weapon holstered or only melee in hands | Good NPCs relax 2× faster; Manō are more likely to try a stick-up |
| Aiming at them | Standoff (non-hostile) or immediate engage (hostile) |
| Sneaking toward them (crouched, moving) unannounced | Good NPCs: aware +0.3 and "Stay back." |
| Sprinting at them within 10 m | Treated as an attack |
| Companions visible within 20 m of you | Manō stick-up chance ×0.3 per companion; their morale −10 per companion seen |

**Manō stick-up.**
- Conditions: Manō identify you within 25 m before you identify them, ≥ 2 of them have LOS, and you are not aiming at
  any of them. Then 35 % of the time they shout "Drop the bag." instead of shooting.
- You have 6 s to drop the back slot. While the demand stands, the F prompt is `[F] Drop bag` (hold 1 s), which drops
  `inv.equip.back` with `game.dropStack` (no inventory screen needed). They take it and back off, firing if you raise
  a weapon.
- Fighting is allowed. Their first burst is wide (×2.2), so it is survivable.

**Manō toll** (3.3).
- "Pay or turn back." at 80 m.
- Pay: hold F on the toll crate and put in items worth ≥ 20. You then pass for 2 game days, and rep +3.
- They fire if you come inside 30 m unpaid.

**Player surrender** (M5).
- The J menu shows "Surrender" when hostile humans are aware of you and outnumber you 2:1.
- Manō take your back and vest slots and leave you alive, 60 % of the time if you killed none of them in this
  encounter. Ka Pele never accept.

---

## 7. Player settlements

### 7.1 Founding and claiming

**Make camp** (J → Camp ▸ Make camp; or hold F on your own pitched tent → Make camp).
- Placeables has no hook for other modules' verbs. At install the NPC module wraps `getPlaceable( 'shelter' ).actions`
  to append "Make camp" while a companion is within 15 m, and restores it on dispose.
- Campfires belong to Crafting's provider and get no verb.

Requirements:
- ≥ 1 companion present;
- ≥ 300 m from any faction home and any other camp, and ≥ 200 m from any post;
- not on a cell where a hostile faction's territory strength is > 0.6 (toast "Hostile ground");
- on land with slope < 0.3, or on a building's ground floor (`city.buildingAt`);
- not in a vehicle.

Failure toasts: "Need people", "Too close", "Hostile ground", "Too steep".

What founding creates:
- **A camp record:**
  - centre;
  - radius 35 m outdoors, or the building footprint + 15 m for a building claim;
  - `bi` when a building is claimed;
  - a name from `ui.locationName( pos )` + " Camp" (e.g. "Hawaiʻi Kai Camp");
  - a **colour** (a hue offset on recruits' cloth, so your people read as yours).
- **A board** (`sign_board` prop, F → Board: the camp panel, 10.5).
- **A store crate** (`crate_mil` prop with a collider; F → Stores). It opens a container `npc:<campId>:store` of
  capacity 300, holding real stacks.
- **A water tank** (`barrel` prop; litres counter and a `dirty` flag; F → Fill uses
  `itemUse.fillFrom( tank.dirty ? 'dirty' : 'tap', stack )` and deducts the litres; holds 200 L).
- **A map marker** of kind `'camp'`, relinked on load (the Sites pattern).
- Toast "Camp made".

**Building claims:**
- Taps work when `hasWater( bi, si )`, the deterministic rule `hash32( bi, 0x7a9 ) % 100 < 45 && si < 3` (Buildings
  export ask; the formula is the fallback).
- Doors become "ours": residents open them quietly, raiders bash them, and barricade placeables count.
- Floors give sleeping spots: interior bed records when loaded, else by type (house 3, apartment 6, school 12, church 8,
  hotel 20).

**Limits:**

| Camps | Requirement |
|---|---|
| 1 | at first |
| 2 | first camp has ≥ 8 residents and a watchtower |
| 3 | 14 residents in total |

Residents per camp: 20 (12 materialised).

**Claiming a faction home.** All defenders dead, fled or surrendered, and no member of that faction within 300 m for
5 real minutes. Then hold F on its store crate → Claim. It becomes your camp with its props, crates, works and walls.
That faction's rep goes to −100 if it was not already.

### 7.2 Infrastructure: beds, storage, workstations

Existing placeables inside the radius count automatically (`placeables.near( c, r, kind )`). Residents service them by
editing `p.data` and calling `placeables.refresh( p )`, never through the player-centric F actions.

| Need | Counts (existing kinds and items) | Rule |
|---|---|---|
| Beds | `shelter` (tent: 2, sleeping_bag: 1), `camp_bed` (sleeping_pad, bedroll, frond_bed: 1), `hammock` (1), `lean_to` (1), building beds, Bunk tent work (+2) | Camp morale −10 when residents outnumber beds (7.6); those without a bed sleep on the ground (energy +8 an hour instead of +12.5) |
| Storage | the store crate (300), Storehouse work (+300, spoilage ×0.7), `stash` placeables and tents' `data.items` inside the radius | Production overflow beyond capacity is lost (log line "Store full") |
| Water | `collector` (rain_barrel 120 L, tarp 30 L; `p.data.L`), `solar_still`, building tap, the sea within 300 m (boil) | Collected water goes `dirty` after 72 h without rain (`STALE_H`): boil (fire + fuel) or purify |
| Food sources | `fish_trap`, `crab_trap`, `trap` (snare), `pig_trap`, `smoking_rack`, `imu`; garden beds (works) | Serviced by residents: catches move into the store |
| Workstations | campfire (`crafting.placeFire`, `game.nearFire`) = cook station; Workbench work; `generator` (powers lights within 18 m) | Cooking, crafting and repair jobs need them |
| Defence | `barricade` (planks on doors), Palisade, Fighting position, Watchtower, Alarm bell works, generator lights | Feed the defence value D (7.7) |

**Works.** These are camp structures built by the Builder job from store materials. They are meshes owned by the NPC
module (`places/works.js`), not new placeables or items. You add them to the build queue from the camp panel.

| Work | Cost (existing ids) | Builder hours | Effect |
|---|---|---|---|
| Garden bed | a dig tool in store (shovel or pitchfork) + planting stock | 3 | Crops (7.4) |
| Rain catchment | tarp + 2 planks | 4 | ≈ 25 L a game day × moisture factor; holds 120 L |
| Water tank | 4 water_jug | 2 | +200 L tank |
| Cook station | campfire + cooking_pot | 2 | Enables Cook; morale +5 |
| Smokehouse | smoking_rack, or 6 planks + tarp | 6 | Preserves 8 portions a game day (smoked_meat / smoked_fish keep 600 h) |
| Storehouse | 10 planks + 2 tarp + 20 nails | 6 | Store +300; spoilage ×0.7 |
| Bunk tent | tent, or 6 palm_thatch + 4 bamboo_pole | 4 | +2 beds |
| Palisade segment (8 m) | 8 planks, or 4 sheet_metal + 20 nails | 4 | Defence +1 (max 8 segments); a wall collider |
| Fighting position | 4 planks + 4 scrap_metal | 4 | Concrete-grade cover for guards; defence +2 |
| Watchtower | 20 planks + 20 nails + 2 rope | 16 | Guard sight ×1.5; defence +3 |
| Alarm bell | metal_pipe + rope | 1 | On raid: `'noise'` kind `'alarm'` r 120 (also draws the infected) |
| Workbench | 6 planks + 10 nails + toolbox | 4 | Crafter and Repair jobs |
| Infirmary | 2 sleeping_bag + first_aid_kit | 3 | Medic ×2 |
| Gate | 6 planks + 2 metal_pipe | 3 | Openable, NPC-aware opening in the palisade |

### 7.3 Jobs

- Jobs are auto-assigned from skills and traits. Change one from the camp panel, or hold F on a settler → Job ▸.
- Work hours: 07–12 and 13–18 (10 h). Guards work in shifts.
- **Output multiplier** = skill × morale × trait:

  | Factor | Values |
  |---|---|
  | skill | 0.85 + 0.05 × level (level 3 = 1.0, level 10 = 1.35) |
  | morale | < 20: 0.6 · 20–35: 0.8 · 35–70: 1.0 · ≥ 70: 1.15 |
  | trait | Hard worker 1.25, Lazy 0.75 |

Outputs below are per worker per game day at multiplier 1.0, as **real item stacks** added to the store.

| Job | Inputs and needs | Output per game day | Seen doing (near the player) |
|---|---|---|---|
| **Farmer** | dig tool in store; ≤ 4 garden beds; water per bed | per the crop table (7.4); ≈ 350–420 raw kcal per mature staple bed | kneeling at beds (`eat` act), 6 s cycles |
| **Fisher** | shore ≤ 300 m (`seaNear`); fishing_rod or throw_net | 1,800 raw kcal as raw_fish (360), raw_tako, raw_crab, raw_ulua 5 % (rolled per hour with `castNet` / `trapChance` tables at 0.5 catches an hour); storm ×0.3, night ×0.6; also empties fish and crab traps within 300 m | standing at the shore with a rod prop; kneeling at traps |
| **Trapper** | snare / pig_trap placeables, or an abstract line of 6 snares if wildness > 0.4 | snare 0.4 catches a day each (raw_small_game 220); pig trap 0.15 a day (raw_boar ×3–4, `PIG_YIELD`): 500–1,200 kcal | walking the trap line, kneeling |
| **Hunter** | rifle or bow + 1 round or arrow a day; wildness > 0.4 within 1 km | mean 1,000 raw kcal (boar 35 % × 880, goat 35 % × 720, small game); 1 % injury a day | leaves with the rifle (dematerialises) |
| **Forager** | rural or forest within 400 m | 700 kcal from a pure `FORAGE` table in `econ/jobs.js` (guava, lilikoi, banana, breadfruit, noni_fruit; banana and breadfruit only where moisture > 0.35) + 6 stick + 4 palm_frond; ×1 / (1 + 0.4·(n − 1)) for n foragers. (`Gathering.kind` needs physics and has no banana or breadfruit, so it is not used.) | leaves and comes back with a full bag |
| **Cook** | lit cook station + 6 firewood a day | cooks up to 9,000 raw kcal a day (about 8 residents' meals) into their `def.food.cooked` ids (taro → cooked_taro +40 %, raw_fish → cooked_fish +25 %, raw_boar → cooked_boar +25 %), most perishable first (raw_fish spoils in 18 h); one soup_pot dish a day (`newDish` / `cookDish`) for morale; morale +5 camp-wide | crouched at the fire, stirring reach |
| **Water keeper** | bucket or water_jug | tap ≤ 400 m: 80 L; empties collectors into the tank; boils dirty or sea water: 30 L for 6 firewood (sea ×0.6, `boil`) | carrying a bucket prop between source and tank |
| **Woodcutter** | hatchet, fire_axe or machete | 20 firewood; forest ×1.3, town ×0.4; `'wood'` noise r 20 (draws infected) | `swipeR` at a log |
| **Guard** | gun + ≥ 15 rounds (melee counts at 0.4) | defence (7.7); raid warning 0.5–2 h earlier; 2 rounds a day on infected; 1 guard per 5 residents at night | post or tower, head scan, torch at night |
| **Builder** | tools + materials in store | works (7.2) by builder hours; +100 barricade hp a day; repairs 1 store item +0.15 cond with toolbox / sewing_kit | hammering (`bash` act, `'hammer'` noise r 25) |
| **Medic** | meds in store | +2 hp an hour per patient with meds, +0.5 without; treats bleeding and infection; halves raid deaths; heals you in camp (Talk → Heal) | kneeling by the injured |
| **Crafter** | Workbench | runs `allRecipes()` that the store can satisfy, in priority: bandage, arrows, rope, splint (bad factions: molotov); `Skills.craftXp` | at the bench |
| **Scavenger** | bag + weapon; pairs preferred | 12–24 game h trip to a building type within 1.5 km chosen by shortage (food → grocery / house, meds → pharmacy / clinic, ammo → police / gunstore, materials → hardware / warehouse); returns 2–4 × `rollLoot( type table )` × skill | leaves along the road; comes back, or doesn't |

**Scavenging risks and depletion.**
- Per trip: injury 10 %, death 3 %. These are ×0.5 for an armed pair, ×1.5 at night, × the infected density factor.
- A **regional depletion pool** per 512 m cell (regrows 1 % an hour) keeps offline scavenging away from Buildings'
  looted keys.
- A death leaves a corpse record near the target town, and the camp log tells you where ("Malia went to Kaimukī.").

### 7.4 Food and water self-sufficiency (online and offline)

**One simulation.** `econ/simulate.js` exports `simulate( camp, hours, env )`. It is pure and steps whole game hours.
It runs whenever `game.time.hours` crosses an hour boundary, covering normal play, sleep, reading and `/time`. Each
hour, in order:

1. **Schedule:** who works, sleeps or guards this hour.
2. **Production:** expected value plus Poisson rolls with the camp's seeded rng, then stacks into the store.
3. **Water:**
   - collectors through `rainFill` (local `weather.rain` when the player is within 400 m, else `weather.state` × the
     camp's moisture from `hf.surfaceAt`; windward ×1.6, leeward ×0.5);
   - the tap;
   - boiling;
   - all into the tank.
4. **Meals** at 07:00, 12:00 and 19:00.
   - Each resident eats ≈ 370 kcal from the store: most perishable first, cooked before raw. Dish kcal comes from
     `data.dish`.
   - Raw meat or fish eaten uncooked: 15 % sick per meal (work ×0.5 for a game day).
5. **Drink:** 1.25 L per resident a day spread hourly from the tank, + 0.4 L cooking per resident a day, + crop water.
6. **Spoilage:** `ageStored( g, store, dh, k )`, ×0.7 with a Storehouse. In Node, pass a stub `{}` for `g`: it only
   reads `g.app` to skip the container open on screen.
7. **Needs → health:** starvation and thirst effects (4.3).
8. **Morale drift** (7.6).
9. At 00:00: **threat rolls** (7.7), **desertion** (7.6), **events** (7.8).

**Catch-up:**
- Hours are stepped one by one for gaps ≤ 72 h.
- Longer gaps use 6 h sub-steps with expected values instead of rolls, up to a cap of 30 days (larger gaps count as
  30 days).
- A 30-day jump for every camp and home costs ≤ 15 ms, once. Over 8 ms it continues on the next frames.
- Equivalence test: 1 × 24 h versus 24 × 1 h stepped totals agree within 3 %.

**Online versus offline.**
- The ledger is the only authority.
- Near the player, residents physically **act out** the current schedule slot at job spots. Their visible work never
  adds output.
- Physical events feed back into the ledger immediately: deaths, theft by the player (the store is a real container),
  infected attacks.

**Crops** (garden beds, planted with existing produce, so no seed items are needed):

| Crop (stock) | Plant | Days to harvest | Harvest | Water L/bed/day | Net raw kcal/bed/day |
|---|---|---|---|---|---|
| sweet_potato | 2 | 4 | 10 sweet_potato | 2 | 360 (cooked ×1.11) |
| taro | 2 | 6 | 9 taro | 4 (×0.5 at moisture > 0.7) | 350 (cooked ×1.4) |
| banana | 1 | 5, then every 3 | 12 banana | 3 | 420 from day 5 |
| cabbage | 1 | 3 | 3 cabbage | 2 | 147 |
| pineapple | 1 | 8 | 3 pineapple | 1 | 112 (variety) |
| onion, green_onion, tomato, chili_peppers | 1 | 2 | 6 | 1 | variety only (+morale) |

- **Growth** needs ≥ 0.75 tended hours per bed per game day, plus water. Rain counts at 2 m² per bed through `rainFill`.
- Growth halts when either is missing, and a bed dies after 3 dry days.
- **Soil multiplier:**

  | Soil | × |
  |---|---|
  | pineapple, cane or ranch land use | 1.2 |
  | red soil | 1.1 |
  | lava | 0.5 |
  | sand | 0.4 |
  | moisture | 0.8–1.2 |

**Needs per resident:** 1,100 kcal and 1.65 L (drink + cooking) a game day, plus crop water.

**What the board shows:** stock in days and the trend arrow. Example: `Food 6 d ↑ · Water 9 d → · Self-sufficient`.
That is the brief's "self-sufficient provided there's food and water", made visible and tunable.

**Worked example: "Hawaiʻi Kai Camp", 7 residents.** A tap house (3 beds), 2 tents (4 beds), 1 rain barrel, 2 fish
traps, a cook station, 8 garden beds. The store starts with 20,000 kcal of canned and dry food, which does not spoil.
This is the `npc-econ` test fixture.

| Who | Output per game day (cooked-equivalent) |
|---|---|
| 2 farmers × 4 beds (4 taro, 4 sweet_potato; mature from day 6) | 4 × 490 + 4 × 400 = 3,560 kcal |
| 1 fisher (shore 200 m) | 1,800 raw → 2,250 cooked |
| Fish traps ×2, emptied by the fisher (0.07 an hour each, cap 3) | 2 × 1.7 × 360 × 1.25 = 1,530 |
| 1 forager | 700 |
| 1 cook | enables the cooked figures |
| 1 water keeper | tap 80 L + barrel ≈ 25 L |
| 1 guard | — |

- **Food:** 8,040 kcal produced vs 7 × 1,100 = 7,700 needed → **+340 a day** once the beds are mature. The first 6
  days, before the beds mature, draw ≈ 16,000 kcal in total from the store. The 20,000 kcal starting stock leaves a
  25 % margin for the Poisson rolls.
- **Cook load:** about 6,500 raw kcal a day of produce needs cooking, inside the cook's 9,000.
- **Water:** 105 L produced vs 7 × 1.65 + 24 (beds) = 35.5 L → **+70 L a day**.
- **Without the fisher** (set to Rest: they stay and eat; the traps go unemptied) the camp runs −7,000 kcal a day
  before the beds mature and −3,440 after. The stock runs out on day 3, hunger reaches 0 about day 5, and the first
  desertion comes on day 6–8.
- **Without the tap and the barrel**, the first death or desertion comes within 2–5 days, unless boiling covers it.
- One food worker with a cook feeds about 2 people. That is the player's rule of thumb, and the Group panel's tooltip
  line.

**Failure:**

| Condition | Effect |
|---|---|
| Hunger 0 for 24 h | −10 hp a day, morale −20 a day, work ×0.5; after 72 h they leave or die at 0 hp |
| Thirst 0 for 24 h | −25 hp a day; they leave after 36 h |

The log says "Kai left. Hungry."

### 7.5 What a living camp looks like (within 220 m)

| Hours | Routine |
|---|---|
| 06 | Wake, eat at the fire |
| 07–12, 13–18 | Jobs at their spots (7.3 poses), carrying between spots |
| 12 | Meal |
| 18–22 | Fire circle (`crouch_idle` facing the fire, chatter audible 25 m), cook serves |
| 22–06 | Sleep inside tents and buildings (not materialised, which saves budget) while night guards walk their posts with torches |

- Settlers greet you on return ("Welcome back.") and give one line of news: "Raiders hit us. We held." · "Low on water."
  · "Kai's hurt."
- Lights come on at dusk through `game.itemLights` (generator-powered or fire), ≤ 2 real lights.

### 7.6 Happiness, morale and desertion

Camp morale (0–100, starts at 60) drifts each hour toward a target.

**Target:** base 50, plus or minus:

| Bonus | Δ | Malus | Δ |
|---|---|---|---|
| food ≥ 2 days | +10 | hungry | −15 |
| water ≥ 2 days | +10 | thirsty | −15 |
| cooked meals | +5 | recent death (decays over 3 days) | −20 |
| ≥ 3 food kinds a day | +5 | recent raid (decays over 2 days) | −10 |
| a bed each | +10 | more residents than beds | −10 |
| fire at night | +5 | each sick resident | −5 |
| leisure items in store (ukulele, playing_cards, kava_drink) | +5 | | |
| defence ≥ threat | +5 | | |
| you slept there today | +5 | | |

**Effects:**
- ≥ 70: work ×1.15.
- < 35: work ×0.8, and quarrels (bark lines).
- < 20 for 2 days: one resident a day leaves (8 % per person per day, highest first).
- Shady residents steal a stack on the way out.

### 7.7 Defence and raids against your camp

**Defence value:**

```
D = Σ guards ( tier weight 1 / 1.5 / 2.2 / 3 × gun factor (melee 0.4, pistol 0.7, shotgun 0.9, rifle 1.0, auto 1.2) × min( 1, rounds / 30 ) )
  + 0.5 per barricade + 1 per palisade segment (≤ 8) + 2 per fighting position + 3 per watchtower + 1 with lights at night
D × 1.3 for a building camp · × 0.5 at night if nobody is on watch
```

**Knowledge.** Raids need the camp to be **known** to a hostile faction. It becomes known when:
- a scout followed you home (6.1);
- a hostile band materialised within 300 m of it and survived;
- unsuppressed gunfire at the camp was heard (in the abstract tier) by a hostile band within 1 km;
- a Shady resident tipped them off.

**Raid roll** (00:00 each game day, per hostile faction that knows the camp, if its territory reaches within 6 km):

```
P = clamp( 0.04 + 0.08·W + 0.12·H + 0.015·max( 0, residents − 4 ) − min( 0.15, 0.01·D ), 0, 0.35 )
W = clamp( store value / 2000, 0, 2 )        H = that faction's territory strength at the camp cell (0..1)
grace: no raid in the 2 game days after founding or after the last raid
```

Expect about one raid every 4–8 game days (3–6 real hours at the default day length) on a known, moderately rich camp.

| Event | Trigger | Flow |
|---|---|---|
| **Scouts seen** | 0.5–2 h before a raid, if a guard is on duty | Toast "Scouts seen"; radio line if you carry a powered walkie_talkie or cb_radio |
| **Extortion** (Manō) | 40 % of Manō raids are preceded by one | 2 Manō at the gate: "Pay 20 food." Pay moves 2,000 kcal from the store, or refuse. Refusal means a raid within 24 h. |
| **Raid** (Manō 4–8 by day; Ka Pele 5–10 at night) | the roll | **Player within 400 m: physical** (7.7.1). **Else: abstract** (7.7.2). |
| **Horde** | P a day = 0.15 × zone density × (1 + gunshots at the camp that day / 5) × (1 − 0.15 × barricades ≤ 4) | Near: `creatures.spawnHorde( pos, 8–30, { dir } )`. Away: abstract — if D ≥ 1.5 × threat, ammo −5 and morale +5; else 30 % one resident hurt and 5 % a death. |

#### 7.7.1 Physical raid

1. Raiders materialise 160–220 m out, on the side facing their home, in 2 groups.
2. They bash barricades first, then doors (`door.bash` with source). Palisade segments and gates have hp and are bashed
   the same way.
3. The bell rings, residents run to fighting positions, and you fight alongside them.
4. An Allied faction within 3 km sends 2–4 defenders. Koa and Kiaʻi arrive in 3–6 minutes (abstract trucks, 9 m/s);
   others take 6–11 minutes (4.5 m/s).

#### 7.7.2 Abstract raid

- It is resolved over one game hour by the square law (9.3, `world/resolve.js`): attack power A vs defence D.
- On a loss, 30–60 % of store stacks by value move to **the raiders' home store**, so you can raid back and recover
  them. 1–2 residents are killed, or **captured** as prisoners at that home.
- On a win, attackers' corpse records with their real kits stay at the camp for you to loot.
- The log and radio say what happened.

### 7.8 Growth and events

| Event | Rate | Flow |
|---|---|---|
| **Refugees** | 15 % a day when the camp is within 5 km of a dense infected town, beds are free and morale ≥ 50 | 2–4 ʻOhana or drifters at the gate: F → Let in (needs beds) / Turn away (rep −3 with ʻOhana) |
| **Trader** | every 2–3 game days at Friendly with ʻOhana, Paniolo or Kiaʻi | 2 traders + 1 guard stay 4 game hours; Trade (6.9) |
| **Sickness** | raw food or stale water | 1–3 sick; the medic job matters |
| **Overdue scavenger** | trip > 36 h | Marker `Kai?` at their last building; they are holed up with infected around. A rescue. |
| **Thief** | camp morale < 30, or a drifter guest | Night theft from the store; guards may catch them |

**Growth tiers** (shown in the panel; they unlock limits, not text):

| Tier | Residents | Unlocks |
|---|---|---|
| Camp | 1–5 | – |
| Village | 6–11 | 2nd camp with a watchtower; traders visit |
| Town | 12–20 | 3rd camp; Allied factions send a liaison who trades daily |

---

## 8. Faction settlements and camps as raid targets

### 8.1 Layouts

Layouts are built with the sites `Kit` and `PROPS`, merged per material: 2–9 draw calls per home.
- Built (with colliders) from 360 m and disposed at 420 m, so parked vehicles (360 m) never spawn into them.
- Time-sliced at ≤ 4 ms a frame (`Kit.begin / step / end`).
- Loot items stream at 120 / 145 m like Sites.
- New procedural props are built from Kit primitives in `places/props.js`: palisade, watchtower, garden bed, water
  tank, workbench, alarm bell, gate, heiau platform, captive post, shark tag decal.

| Size | Footprint | Layout (existing PROPS unless marked new) |
|---|---|---|
| **Post** (toll, checkpoint, barricade, gate) | the road event | The event's own barriers + `canopy` + `crate_police` (toll crate) + `fire_pit` at night; Koa adds `sandbags`, `razor_wire`; Ka Pele adds `cairn`s and tiki torches |
| **Outpost** (r 25 m) | open, shore or forest spot | 2 tents (`tent_dome` / `tent_ridge` / `tent_mil` by faction), `fire_pit`, `log_seat`s, a sandbag ring watch post, store crate, `woodpile` |
| **Camp** (r 40 m) | open or lot, or a village edge | Perimeter of `razor_wire` / `sandbags` / `pallet` / palisade (new) with 2 gaps; 2 watch posts (sandbag nests); 3–5 tents; cook fire + `bbq`; store crate ×1–2; armory crate (`crate_mil` + `ammo_cans`, locked); `generator` + 2 lights; `flag_pole` in faction colours; leader's tent with a footlocker |
| **Stronghold** (r 60 m, building-anchored) | the anchor building(s) | Ground doors barricaded except one; sandbag nests at entrances; yard tents and `camo_net`; watchtower (new) if outdoor; store ×2, armory, leader's footlocker inside the anchor; captive post (Manō, Ka Pele) |
| **Ruin** (fallen home, Pearl Harbor) | – | the layout without people: knocked-over props, `body_covered`, `debris`, partial loot, an infected nest |

**Faction dressing:**

| Faction | Dressing |
|---|---|
| ʻOhana | `produce_crate`, `farm_stand`, garden beds, nets |
| Kiaʻi | `tent_fema`, `cot`, `folding_table`, `radio_set`, SAFE ZONE `sign_board` |
| Paniolo | `woodpile`, `bbq`, KAPU boards, fences |
| Koa | `tent_mil`, `sandbags`, `razor_wire`, `crate_mil`, `ammo_cans`, `radio_set` |
| Manō | `pallet_load`, `barrel` fires, shark tags, captive post |
| Ka Pele | heiau platform (new), `cairn`s, lit tiki torches, no tents (`tarp_shelter`) |

### 8.2 Garrison, schedule, guards, patrols, leaders

- **Live ≤ 12 per home:**

  | Role | Count |
  |---|---|
  | guards on posts | 2–4, rotating every 4 game h |
  | tower | 1–2 (strongholds) |
  | patrol | 2–4 on a 60–120 m loop around the home every 2 game hours |
  | workers | the rest |
  | leader | 1 |

  Reserves beyond 12 stay abstract "inside" and come out as reinforcements.
- **Patrols from the home's real roster.** A killed patrol member is subtracted from the home for good.
- **Leader.**
  - Holds near the stores in a fight; elite or veteran; carries the best kit, the `lanyard_keys` (data.home) to the
    armory and a `marked_map`.
  - Killing the leader: morale −25 to all members; Ka Pele lose their morale floor.

**Schedule** (by game hour; it gives raids timing windows):

| Hours | What happens | Raid relevance |
|---|---|---|
| 05–07 | Shift change: sentries walk between posts for about 2 real minutes | Posts are empty: the classic window |
| 07–18 | 40 % at visible jobs (hammering with `'hammer'` noise r 25, carrying, kneeling at crates); patrol loops | Thin the patrols first |
| 18–22 | Around the cook fire (chatter audible 25 m), lights on | Noisy, well lit, many targets in one place |
| 22–05 | 1 sentry per post (camp 2, stronghold 3); others asleep in tents (not materialised; they wake 2–4 s after an alarm and come out) | 02–05 "dead hours": sentry alertness ×0.7, sometimes crouching |
| Rain | Sentries shelter under canopy, cone ±35° | Approach in the rain |
| Ka Pele | inverted: active 19–05, asleep by day | Raid them at noon |

### 8.3 Alarm ladder and reinforcements

| Level | Trigger | Behaviour |
|---|---|---|
| Calm | — | Routine |
| Suspicious | A guard reaches awareness 0.35, or hears a step, door or suppressed shot nearby | That guard investigates; others pause and look |
| Alarm | Identified and not dropped within 2 s, a shot, or a body found | `'alarm'` noise r 170 m (the infected hear it); everyone to defence spots facing the **estimate**; the leader holds near the stores; radio call |
| Search | 60 s without contact | Pairs sweep to the estimate; back to Suspicious after 3 minutes |

**Reinforcements.**
- Patrols and bands of that faction within 1.5 km come at 4.5 m/s (abstract jog), arriving in ≤ 6 minutes.
- A radio faction (Koa, Kiaʻi) also brings a squad from the nearest home within 3 km at 9 m/s (abstract trucks;
  they appear on foot at 190 m), if manpower ≥ 50 %.
- Either way this puts a ticking clock on loud raids.

### 8.4 Loot (why raiding is worth it)

| Source | Contents |
|---|---|
| Every defender's body | Their **real kit** minus what they used: the gun with its remaining rounds, magazines, armour, food (`lootItems()` returns the actual stacks) |
| Store crates | The home's **stock counters** turned into real stacks when the crate streams in: kcal → the faction food table, ammo counters → real ammo stacks by calibre, meds, materials, valuables (`npc_<fid>_stores` picks the ids). What you take is deducted when the crate streams out; counters → stacks → counters is exact. |
| Armory (camp, stronghold; locked) | Opened by hold F with a crowbar (4 s), lockpick (6 s) or the leader's `lanyard_keys`. 2–5 weapons, ammo, 0–2 armour pieces (`npc_<fid>_armory`); restocks after 7 game days |
| Leader's footlocker | Best items + `marked_map` (reveals 1–2 more homes of that faction: raids chain into raids) |
| Captives (Manō, Ka Pele) | 0–2 kneeling, bound: your captured settlers, or drifters / ʻOhana. Hold F → Free (2 s): they join (trust +30), or go home (+15 rep with their faction) |

Raid bodies persist as **corpse records** for 2 game days (cap 30), so a raid interrupted by quit-and-reload or by
walking away keeps its loot.

### 8.5 Consequences, respawn and rebuild

- **Stock.** Taking a home's stock lowers that faction's patrol ammo and food (`ammoFactor` in fights) until it
  regenerates. A Manō yard emptied of 7.62×39 fields 40 %-ammo war parties for about 5 game days.
- **Manpower regenerates** per game day by faction:

  | Faction | Regen |
  |---|---|
  | Manō | 1.5 % |
  | Ka Pele | 2 % |
  | Koa | 0.5 % |
  | others | 1 % |

  Below 30 % manpower a faction fields patrols at 0.5× and stops raiding.
- **Leader dead:** the home's morale breaks, and the remainder flee or surrender (5.6 odds).
- **Emptied home** (no live members):
  - It re-garrisons after 2–5 game days if the faction's manpower is ≥ 40 %, with fresh members and 50 % stock.
  - Otherwise it becomes a `ruin`: lootable, empty, recolonised by a neighbour faction's expansion mission within
    5–15 days, or claimable by you (7.1).
  - Homes that change hands swap flags, signs and tints; the territory grid recomputes; radio chatter reports it
    ("Radio: ʻEwa fell.").
- **Armory** restocks after 7 game days; **stores** refill from the ledger.

### 8.6 The raid toolkit (player and squad)

All of this uses existing systems:

| Tool | How it works |
|---|---|
| Scouting | Crouch and stop with companions near you; they count what *they* see ("I count five."). Binoculars help you (people drawn to 260 m, a home's sentries materialised, 9.4), not them. |
| Overwatch | Order companions to Guard or Wait at a spot with Fire at will, then go in |
| Stealth takedowns (5.8) | Companions in Quiet mode do them on Attack orders when they hold a blade or bat |
| Distractions | firecracker_string, alarm_clock, thrown items (their noises): NPCs investigate with 1–2 members and leave their posts |
| Lure the infected | Gunfire pulls them; NPCs fight the infected. Except at Ka Pele homes: the infected ignore the cult, so luring hordes there only hurts you. |
| Night and suppressors | Suppressed shots are radius ×0.3 and cannot be located beyond 30 m |
| Smoke | `fx.smokeBlocks` blocks NPC sight like yours |
| Flashbangs | `stun()` |
| Cut the lights | Shoot the generator (60 damage) or hold F → Sabotage (6 s). Sentries lose the lit-camp bonus and take the night penalty. A player's `generator` placeable (`p.data.fuel`) is emptied the same way. |
| Cut the radio | Destroy the Mauna Kea relay (the `radio_set` prop: 120 damage, an explosive, or hold F → Sabotage 8 s with a crowbar or toolbox) to cut Koa radio on Hawaiʻi; kill the radio carrier to stop reinforcement calls |
| Scout from afar | Binoculars or a scope (`player.aimFov ≤ 0.5`): living humans are drawn to 260 m. Looking at a built home within 300 m materialises its sentries and leader (≤ 4, static tier), so you can count them before going in (9.4). |

The home generator, the relay and the alarm bell are tiny `Prop` entities (type `'prop'`, a box `hitTest`, `health`,
`damage()`), built by `places/props.js`. `Ballistics` already sweeps rounds against any entity with a `hitTest`, so
rounds and melee reach them with no change to Weapons.

### 8.7 Allied and friendly homes (visiting)

- Walk in with your weapon lowered or holstered and they greet you.
- Talk to the leader:

  | Verb | Effect |
  |---|---|
  | Trade | 6.9 |
  | Rest | sleep is safe there |
  | Ask for help | Allied: loaned fighters |
  | Recruit | a member with low morale leaves with you; rep −5 |
  | Ask for work | Kiaʻi job board (M5): one contract at a time, shown only as a map marker labelled `Job: Waipahu` — kill a named Manō leader, deliver 40 L of water, escort a caravan, clear an infected nest, recover a supply drop. Rewards are rep and goods from the home's real stock. |

- **Plea for help.** When a hostile home is within 1.5 km, a member runs up to you: "Manō hit us." The hostile home is
  revealed on your map. Clearing it gives +20 rep with the pleading faction.

---

## 9. Spawning and population budget

### 9.1 Zones: "they spawn in some areas"

- **Homes and posts** (3.2, 3.3) are fixed places with real rosters. A killed resident or patrol member is subtracted
  from the home record for good.
- **Territory patrols** are real Tier B bands walking 300–600 m loops around each home. There are 1–3 per home by size
  (outpost 1, camp 2, stronghold 3), drawn from its roster. A faction under 30 % manpower fields half.
- **Influence** (3.2, territory grid) weights the faction mix of random bands. Border markers show it on the ground.

### 9.2 Random encounters: "and also randomly" (`world/director.js`)

**When the director ticks:**
- Every 30 real seconds.
- Only when the player is outdoors, alive, not in a vehicle faster than 15 m/s, and has moved > 40 m since the last
  tick (camping does not spawn random bands; homes and raids handle that).
- At most 2 random bands live, and at least 3 real minutes after the last random spawn.

**Chance per tick** by the player's cell:

| Cell | P per tick |
|---|---|
| Hostile core (hostile strength > 0.6) | 0.14 |
| Faction border | 0.12 |
| Neutral wilderness | 0.10 |
| Dense infected town (pop.density > 0.45) | 0.06 |
| Water, indoors | 0 |

- Night ×0.7, except Ka Pele bands ×1.6.
- The result is one encounter about every **7–11 real minutes** on the move.

**Encounter types and weights.** Each weight is × the faction's presence (3.4); drifters are always present.

| Type | Weight | Who | Size | Notes |
|---|---|---|---|---|
| Lone drifter | 30 | drifters | 1 | 35 % seekers, 1 in 3 good ones tag along |
| Drifter pair or family | 12 | drifters | 2–3 | – |
| **Rescue** | 8 | drifters chased by 3–6 infected | 1–2 | Saved → they join (6.1) |
| Shadow | 4 | good drifter | 1 | Trails at 30–50 m |
| Downed survivor | 3 | drifter | 1 | "Help me." |
| Patrol | 20 | the cell owner | faction patrol | The nearest real territory band of the cell owner within 1.5 km is routed across your path, with no new people. If there is none, a band is drawn from the nearest home's roster. |
| Scavengers | 10 | any present faction | 2–3 | – |
| Refugees | 6 | ʻOhana | 2–5 | Heading to the nearest friendly home or your camp |
| Traders / caravan | 6 | Kiaʻi, Paniolo, ʻOhana | 2–4 + guard | On a road route between homes; robbable |
| Hunters | 5 | Paniolo, ʻOhana | 2–3 | Dawn and dusk |
| War party | 6 | Manō, Ka Pele | 5–8 | Heading to a target home (9.3); joinable or avoidable |
| Ambush | 5 | Manō | 3–5 | At road jam and crash events within 400 m of your path |
| Stick-up setup | 4 | Manō | 2–4 | 6.12 |
| Scout | 4 | Manō | 1 | Tails you at 60–90 m (6.1) |
| Night pack | 6 (night only) | Ka Pele | 4–7 | Torches visible > 100 m |
| **Distant firefight** | 5 | two hostile factions | 2 bands | Materialised 170–190 m away, out of view, already engaged; real noise; joinable; the outcome changes both homes |

**Spawn points:**
- 130–190 m away, never in view (`creatures._inView` false), on `creatures._groundSpot`.
- Biased toward roads (`roads.net` nearest), cover and the band's route.
- Each band carries an intent: cross your path, camp, hunt toward a noise, travel to a goal, or seek you.

**Pacing** (a soft director, not a level scaler):
- **Intensity meter.** `I += damage taken / 10 + shots fired / 30 + 2 per kill`, decaying 1 a minute. No hostile
  random encounter while I > 6, and 4–8 minutes of calm after any fight.
- **New characters.**
  - First 15 minutes: only drifters and 2-person Manō groups, and the first hostile group always calls out before
    firing.
  - One guaranteed **Rescue** 20–40 minutes in, which teaches recruitment by doing, with no tutorial text.
- **Despawn.** A random band > 260 m away and out of view for 20 s goes back to its record. Survivors keep their hp,
  ammo and grudge.

### 9.3 The abstract world (Tiers B and C)

**Bands** (Tier B, `world/bands.js`, 1 Hz, one band per frame round-robin):
- **Movement.**
  - Points move along routes: Dijkstra over the per-island city graph built from `roads.net.roads[*].from/to`, then
    the road polylines.
  - Off-road bands (hunters, Ka Pele packs) go straight over land, checking `hf.baseHeight > 0.5`. Nobody crosses
    water.
- **Speed** is real-time-consistent at 1.3 m/s: 156 m per game hour at the default 48-minute day (scaled by
  `dayMinutes`). A 6 h sleep moves a band about 940 m.
  - Reinforcements jog at 4.5 m/s; Koa and Kiaʻi trucks are abstract at 9 m/s.
  - Bands camp 20:00–05:00, except Ka Pele and war parties, which travel at night.
- **Needs.** Bands carry kcal and ammo counters and go home to restock.

**Strategy** (Tier C, `world/strategy.js`). Once per game day per faction, utility-scored, < 0.1 ms:
- keep 1–3 patrols per home;
- send scavengers if stock < 3 days;
- **raid** a target whose weakness > 0.6 when relation ≤ −50 and manpower ≥ 50 %; targets include your known camps
  (7.7);
- run trade caravans between friendly homes;
- **expand**: found a new outpost when manpower > 120 % of capacity (3.2 placement rules, ≤ 2 dynamic outposts per
  faction), or recolonise a ruin.

**Off-screen fights** (`world/resolve.js`, the square law). These run only when the player is > 400 m away. Within
400 m, both sides materialise and fight for real.

```
S_side = Σ members tierW (1 / 1.5 / 2.2 / 3) × gunW (melee 0.4, pistol 0.7, shotgun 0.9, rifle 1.0, auto or LMG 1.2)
         × min( 1, 2 × ammo fraction ) × hp / 100
defender home: × fort = 1 + 0.15 × min( 4, walls ) + 0.3 × tower + 0.3 × building;  × 0.5 at night with nobody on watch
Ka Pele at night × 1.3
P( attacker wins ) = S_a² / ( S_a² + S_d² )
loser: each member dies 35 %, wounded (−40 hp) 30 %, else flees · winner: each dies with 0.3 × ( S_l / S_w )², wounded 2× that
winner takes 20–50 % of the loser's stock (bands: carried kcal and ammo)
```

- **No `'noise'` events** come from abstract fights, so they cause no zombie pulls.
- If the player is within 1.5 km, distant gunfire plays through `audio.play( f.sound, { pos, max: 2000 } )` as a cue
  that loot is nearby.
- An **aftermath** site stays for 2 game hours: corpse records with real kits, and sometimes one wounded survivor
  (recruitable, or a bad one begging).

**World events** (rolled per game day):

| Event | Rate | What happens |
|---|---|---|
| Supply drop race | each new entry in `game.sites.drops` (or the landing `'noise'` with `source: 'supply_drop'`) | 1–2 nearby factions send bands; the first there loots it |
| War push | 10 % per hostile neighbour pair a day | Off-screen fights on the front line for 1–3 days; relation −5 |
| Caravan | 1 per 2 days per friendly pair | 2–4 traders + 1–2 guards on a road route; robbable |
| Refugees | 15 % a day near infected towns | ʻOhana band toward the nearest friendly home or your camp |
| Horde migration | 8 % a day | Abstract horde crossing cells; damages homes on its path (stock, residents) |
| Home falls | result of war or horde | Home becomes a `ruin` (8.5) |

**Radio chatter.**
- If you carry a powered `walkie_talkie`, `cb_radio` or `radio`, world events and enemy chatter arrive as chat lines of
  kind `'radio'`: "Radio: ʻEwa fell." · "Radio: patrol to Kapolei."
- Koa and Kiaʻi radio traffic within 1.5 km can be overheard: intelligence about patrols and reinforcements.

### 9.4 LOD tiers

| Tier | Where | Think | Perception | Cover / paths | Animation re-pose | Mesh, gun, shadow |
|---|---|---|---|---|---|---|
| **Near (full)** | ≤ 40 m from the camera | 0.15 s ± jitter | full | yes | every frame | LOD 0 within 26 m (12 / 18 m on low / medium); gun shown; body shadow ≤ 55 m (25 m low), gun and props ≤ 25 m |
| **Near-mid** | 40–90 m | 0.3 s | full | yes | every 2 frames | LOD 1; gun shown ≤ 60 m |
| **Mid (simplified)** | 90–200 m | 0.6 s (combat floor 0.3 s) | full maths; lowest LOS-budget priority | cached spots only; no A* | every 3 / 5 / 8 frames by distance; every 12 off-screen (the Creatures `_lod` cadence) | LOD 1; no gun beyond 60 m; hidden (LOD 2) beyond 170 m on every quality |
| **Static residents** | calm home or camp residents > 120 m | 1 s | sentries only | none | every 12 frames | LOD 1 |
| **Far (abstract)** | not materialised | bands 1 Hz; homes and camps hourly | – | – | – | – |

- **Own LOD, not `Creatures._lod`.** Humans use the same LOD 0 radii and re-pose cadence as the infected. Their draw
  distance is 170 m on every quality: `_lod` uses 110 m on low, and that would hide shooters inside the 150 m fire cap.
  There are at most 8 humans on low, so the cost is small.
- **Zoomed view.** While `player.aimFov ≤ 0.5` (binoculars, scopes), humans inside the view cone are drawn to 260 m.
  Their guns are drawn to 170 m. Looking at a built home within 300 m also materialises its sentries and leader (≤ 4,
  static tier) so they can be counted. They stay within the global cap and leave on the normal dematerialise rule.
- **Materialise:**
  - bands at ≤ 190 m (never within 165 m if in view; beyond 170 m bodies are hidden, so the 170–190 m appearance is
    invisible, except in a zoomed view, where a band can be seen appearing at 170–190 m);
  - home residents at 220 m (props are already built from 360 m);
  - indoor residents only when `city.interiors.get( bi )?.groundReady` (upper storeys: `storeys.get( si )?.ready`),
    otherwise they wait in the yard. Interiors exist only within about 90 m of the player (dropped past 130 m), so a
    stronghold's indoor guards appear as you close in. Defenders seen from farther away are the yard and wall posts.
- **Dematerialise:** beyond 260 m, not in combat for 30 s and not in view; or beyond 320 m regardless. Records get
  position, hp, needs, ammo and the inventory diff.
- **Teleports.** On a player jump > 350 m (/tp, respawn), every non-companion entity dematerialises. Companions follow
  6.4.

### 9.5 Caps and performance budgets

| Item | Budget |
|---|---|
| Live humans (companions included) | low 8 · medium 12 · high 16 · ultra 20. Priority when over: companions > hostiles aware of the player > home guards > others ("inside", or not yet materialised) |
| Random bands live | ≤ 2 |
| Homes built at once | ≤ 2 (nearest), each ≤ 12 live within the global cap |
| NPC corpses | 16 entities; 30 corpse records (2 game days) |
| Avatar templates used only by NPCs | ≤ 4 (3 on low). Prefer avatars already loaded by anyone (`lib.isLoaded`); at most 1 new load per encounter through `_request`. The total stays inside Creatures' TEMPLATE_BUDGET 10 / hard 14. |
| Infected cap | `creatures.capReserve = max( 0, live − 8 )` lowers the infected cap while many humans are live (Creatures ask) |
| CPU, Node harness (AI + animation + matrices) | NPC layer ≤ 1.5 ms median with 16 live (8 in combat); with 30 infected, total ≤ 3.0 ms median, p95 ≤ 5 ms |
| World tick | ≤ 0.15 ms per frame on average; catch-up ≤ 8 ms per frame (sliced), ≤ 15 ms in total for 30 days |
| Line of sight | ≤ 24 perception rays per frame shared by all NPCs, round-robin; results reused for ≤ 0.2 s |
| Cover | 1 query per frame globally |
| Path plans | an NPC takes a plan only when `nav.budget ≥ 2`, leaving ≥ 1 for the infected and animals; cooldown 1.5 s (4 s after a failure); companions follow formation or trail |
| Draw calls | per human: ≤ 5 near (skin, cards, merged gun 1–2, armband, head prop), ≤ 2 mid, 0 beyond 170 m (260 m while zoomed). 12 armed humans in view ≤ 60 extra draws. Each home 2–9 draws (≤ 2 built). Border signs instanced. |
| Guns | merged per material from `buildGunView( def, 'world' )` (BufferGeometryUtils.mergeGeometries in `agent/look.js`, cached per gun id), 1–2 draws instead of 4–13. Hidden beyond 60 m (170 m while zoomed); shadow ≤ 25 m. GunModels.js is not edited. |
| GPU memory | NPC-only templates ≤ 40 MB; merged gun cache ≤ 16 ids; built homes ≤ 2 |
| Audio | NPC gunshots through `npcShot` (already culled by `max`); ≤ 6 voice barks; ≤ 4 footstep voices within 30 m |
| FX | tracers on every 3rd NPC round; muzzle lights through the existing request queue |
| Lights | never add scene lights; `game.itemLights` for torches and camp lights (≤ 2 real) |
| Save | `save.world.npcs` < 150 KB typical, < 400 KB worst case (11) |
| Allocation | no per-frame allocations in hot paths: module scratch vectors, `hyp()` instead of `Math.hypot`, reused `entities.near` arrays, fixed-size contact arrays, prompt objects cached per NPC |
| Frame rate independence | think cadences are in seconds; per-frame budgets (LOS, cover, spawns) are per update step. Node tests step at a fixed dt (`w.step( sec, 1/30 )`), so their results don't depend on the machine. The lavapipe browser runs at a low frame rate, so it is used for looks and `game.update` ms, never for behaviour statistics. |

### 9.6 Pooling

| Pool | What it holds |
|---|---|
| `Human` shells (≤ 8 spare) | `Mover`, contact arrays and scratch reused on `reset( rec )` |
| `CharacterInstance` | the existing per-avatar pool (`lib.acquire / release`) |
| Merged gun views | ≤ 4 instances per gun id |
| Armband and head props | per faction |
| Prompt objects | cached per Human (the `_searchPrompt` pattern) |
| Corpse entities beyond 16 | oldest first become corpse records |

---

## 10. UI (DayZ-minimal)

No nameplates, health bars or quest text over heads. Text is verbs, 1–4 word barks and 1–3 word toasts, in sentence
case in source (CSS capitalises), with no exclamation marks.

### 10.1 Interaction prompts

The NPC provider is cheap:
- `entities.near( origin, 4, 'npc', reused )`, then a cylinder test, then `hitTest`.
- Reach is 3.0 m (`reach` field).
- Prompt objects are cached per NPC and keyed by a state version.

The name strip shows **STRANGER** until they tell you their name (Talk), then the name in caps. Tap F runs the default
verb; hold F (0.4 s) opens the numbered menu (10.2).

| Target | Strip | `[F]` tap | Grey alternatives |
|---|---|---|---|
| Non-hostile stranger | STRANGER / KAI | Talk | Trade · Give · Ask to join |
| Seeker or tag-along asking | STRANGER | Take in | Turn away · Talk |
| Companion | KAI | Follow / Wait (toggle) | Pack · Orders · Heal |
| Settler | KAI | Talk | Job · Pack · Follow me |
| Downed companion or survivor | KAI | Revive (hold 4 s) | – |
| Surrendered | STRANGER | Let go | Search · Recruit |
| Captive | STRANGER | Free (hold 2 s) | – |
| Trader | STRANGER | Trade | Talk |
| Faction leader (Friendly) | name | Talk | Trade · Rest · Ask for help · Ask for work |
| Toll crate | TOLL | Pay | – |
| Camp board / store / tank | the camp name | Board / Stores / Fill | Rename (board) |
| Faction store crate (cleared home) | STORES | Open | Claim |
| Corpse | name or faction noun | Search (existing provider) | Bury (with a shovel, companions) |

**Who provides which prompt.** People (strangers, companions, settlers, surrendered, captives, traders, leaders,
downed people, the Bury verb on bodies) come from `ui/prompt.js` (WP6). Places (toll crate, camp board, store, tank,
faction stores, armory, footlocker, Claim, Sabotage) come from `HomeSite.provide` / `CampSite.provide` in `places/*`
(WP10). Both register through `interact.addProvider`. Corpse Search stays with Creatures.

**Until the lead's HUD hooks land (MVP fallback):**
- The label is the verb and `sub` is the name; this works with today's `promptParts`.
- Tap is duck-typed `plTap`, so the existing `Placeables._tap` handles it with no change.
- With the hooks, the HUD gains generic `t.name`, `t.alts` and `t.tap` (12.4).

### 10.2 Person menu and dialogue (short lines, choices)

Hold F opens `openActionMenu` (`items/placeables/menu.js`): numbered rows, F picks the first, Esc closes. Replies
appear as subtitle chat lines with a voice sound. There are no dialogue trees: each choice is one verb and one reply.

| State | Choices → replies |
|---|---|
| Stranger | **Talk** → "Need food." / "Looking for a group." / "Just passing." / "Manō at Waipahu." (a hint about the nearest hostile home) · **Ask to join** → the demand ("Need food.") or "Okay." or "Not yet." (trust < 30) · **Give** → opens their pack · **Trade** → wares (6.9) · **Ask around** → marks the nearest friendly home on the map, toast "Camp marked" |
| Companion | Talk → status ("Good." / "Hungry." / "Low on ammo." / "Hurt.") · Pack · Follow / Wait · Heal · Send to camp · Dismiss (`ui.confirm( 'Dismiss Kai?', … )`) |
| Settler | Talk (one line of news) · Job ▸ (popMenu: Farmer, Fisher, Trapper, Hunter, Forager, Cook, Water, Woodcutter, Guard, Builder, Medic, Crafter, Scavenger, Rest) · Pack · Follow me |
| Surrendered | Let go → "Thanks." · Search → opens their pack, then they leave unarmed · Recruit → "Okay." (40 %) or "No." |
| Leader | Trade · Rest · Ask for help → "Two of mine." or "Not now." · Ask for work (M5) · Pay (tolls) |

### 10.3 Orders menu (J)

The J menu is in 6.5. It is an `openActionMenu` at the crosshair with 9 rows and number keys. `openActionMenu` has no
title, so the receiver (Squad, or the companion's name) is the `meta` text of the first row.

### 10.4 Companion status: the squad strip

- **Where:** bottom-left, the free HUD corner. It is a DOM widget owned by the NPC module (`ui/strip.js`, `ui/npc.css`)
  and mounted through a one-line HUD slot hook (12.4).
- **Rows:** up to 4, one per companion: `KAI` + order glyph (follow, wait, guard, fight, down, riding, away) + a
  health tick in the DayZ notifier colours (white OK, yellow hurt or low ammo, red downed) + one grey word when it
  matters ("Hungry", "Low ammo").
- **Visibility:**
  - shown for 3 s on any change, while J is held, and always while someone is downed;
  - hidden otherwise, and always while the chat is open (the open chat runs down the left edge);
  - a setting `squadStrip` turns it off.
- **Cost:** updates at 3 Hz; DOM writes only on change (the HUD `text / flag / show` cache pattern).

### 10.5 Group and camp panel

Opened with key **U** (a new binding `group`), from the camp board (F → Board), or by hold F → Job on a settler. It
uses the `UI.journal` pattern: `div.screen > div.panel.status-panel`, `sec()` / `kv()` rows, key or Esc closes.

```
GROUP
  Kai        Fisher · Follow · Hungry · Loyal · lever_3030 12
  Leilani    Medic · Wait · Hurt · OK · glock17 30
CAMP — HAWAIʻI KAI CAMP
  People 7 / 8          Food 6 d ↑       Water 9 d →      Morale Good
  Defence Fair          Threat Low       Known to: Manō
  Jobs   Kai Fisher ▸ · Malia Farmer ▸ · Keoni Guard ▸ …        (click cycles the job)
  Build  Watchtower 6 / 16 h · Need 6 planks          [Add ▸]
  Store  412 / 600 · 38 stacks
FACTIONS
  ʻOhana Friendly · Kiaʻi Neutral · Manō Hostile · Koa Wary
KNOWN
  Makoa · Manō
LOG
  Day 12  Raid. Held. 1 hurt.
  Day 11  Malia went to Kaimukī.
```

Rows use the warn and alarm tones for bad values. The board opens straight to its camp's section.

### 10.6 Map markers

- **Your camps:** markers of kind `'camp'`, labelled with the camp name. **Discovered faction homes:** kind `'npc'`,
  with 2–3 word labels ("Manō camp", "Kiaʻi post"). At most 12 NPC markers in total, which respects the 40-marker
  cap. The `m.npc` key relinks on load (the Sites pattern).
- **Discovery** comes from:
  - seeing the home within 150 m;
  - a `marked_map`;
  - "Ask around";
  - a plea for help;
  - a radio report.
- **Companions** appear as live dots through `npcs.known()` → `[ { pos, name, kind } ]`, gated by the same GPS /
  realistic-map rule as your own position (MapUI `_knows()`). This needs the lead's MapUI live layer (12.4).
- **Jobs** (M5) show as a marker labelled `Job: <place>`.

### 10.7 Toasts

| Toast | Kind |
|---|---|
| Kai joined | good |
| Kai left | warn |
| Kai died | bad |
| Kai down | bad |
| No room | warn |
| Camp made | good |
| Camp raided | bad |
| Scouts seen | warn |
| Food low | warn |
| Water low | warn |
| Captive freed | good |
| Paid | info |
| Not enough | warn |
| Hostile ground | warn |
| Need people | warn |
| Too close | warn |
| Manō hostile (on a tier change) | bad |
| ʻOhana friendly (on a tier change) | good |
| Camp marked | info |
| Kai went home | info |

### 10.8 Keys

| Action | Default | Change |
|---|---|---|
| `gestures` | KeyJ | Label becomes "Orders" in `BINDING_LABELS` and the Menus Keys tab; tap Regroup, hold for the menu |
| `group` (new) | KeyU | Opens the Group panel; added to `DEFAULT_BINDINGS`, `BINDING_LABELS`, `KEY_GROUPS` |
| `interact` | KeyF | Tap or hold on people (10.1) |

---

## 11. Persistence

### 11.1 What is saved

- One system (`src/npc/save.js`) is registered with `game.register`. It writes `save.world.npcs` in `serialize( save )`
  and reads it in `load( save )`.
- Load runs after every module is installed and before anything has streamed, so physical spawns are deferred to the
  first update after `creatures.first` clears.
- **Untouched faction members, the home plan and the territory grid are never saved.** They are pure functions of
  `( game.seed, data/homes.js, planV )`.

| Saved | Not saved (derived or runtime) |
|---|---|
| Player reputation per faction; relation deltas | The plan (homes, posts, layouts), the territory grid |
| Home deltas (owner, manpower, population lost, stock counters, alarm, raided, cleared, taken crates, captives, known) | Untouched members and their kits |
| Bands in motion (route, index, counters, touched members) | Contacts, awareness, actions (combat state) |
| Touched people (4.1), with inventories | Entity ids, instances, meshes |
| The squad and standing orders | Prompt caches, LOS caches, cover caches |
| Camps (store stacks, tank litres, works, beds, jobs, queue, morale, known-by, log) | Live corpse entities (their records are saved) |
| Corpse records (≤ 30, 2 game days) with items | |
| Regional scavenging depletion, discovered places, director state, pending events | |

### 11.2 Schema (version 1)

```js
save.world.npcs = {
	v: 1, planV: 1, seed, nextUid: 1043, lastH: 412.0,
	rep: { ohana: 12, kiai: 30, paniolo: -5, koa: -20, mano: -60, pele: -90 },
	relDelta: { 'kiai|mano': -5 },
	homes: { 'mano:waipahu': { own: 'mano', man: 0.8, pop: 14, lost: 3, stock: { kcal: 9000, water: 200, ammo: { '7.62x39': 640 }, meds: 6, mats: 18, val: 400 },
		alarm: 0, raided: -1, cleared: -1, taken: [ 'stores:0' ], captives: [ 'n1031' ], known: 1, lastH: 411 } },
	bands: [ { id: 'b41', f: 'mano', kind: 'war', isl: 3, x: -6100.2, z: -11000.5, route: [ [ -6100, -11000 ], [ -6500, -11900 ] ], ri: 1,
		goal: { t: 'camp', id: 'c1' }, n: 6, seed: 40015, hurt: [ 0, 0, 35, 0, 0, 0 ], ammo: 0.8, kcal: 2400, st: 'move', t: 410.5, ppl: [] } ],
	people: { n1012: { u: 'n1012', n: 'Kai', sex: 'm', f: 'drifter', bg: 'fisher', av: 'm_casual1', look: [ 0.05, 0.9, 0.85, 0.8, 0.3, 3 ],
		voice: [ 1.08, 0.02 ], tr: [ 'sharp', 'glutton' ], sk: { aiming: 230, fishing: 700 }, hp: 82, bleed: 0, wounds: [],
		needs: [ 61, 40, 70 ], mo: 55, tru: 64, gri: 0, st: 'squad', role: 'rifle', job: null, order: null,
		pos: [ -7531.2, 3.1, -14150.8 ], yaw: 1.2, inv: { /* PlayerInventory.serialize() */ },
		mem: { met: 380.5, gifts: 42, saved: 1, hitByYou: 0, alliesKilledSeen: 0, lastSeenH: 412, demand: 'food', demandMet: 1 }, grudge: 0 } },
	squad: [ 'n1012', 'n1020' ], orders: { fire: 'will', quiet: 0 },
	camps: { c1: { name: 'Hawaiʻi Kai Camp', x: -2350.0, z: -9960.0, r: 35, bi: -1, founded: 300.0, colour: 0.12,
		store: [ /* stacks */ ], tankL: 64, works: [ { t: 'bed', x, z, yaw, lvl: 1, prog: 1, data: { crop: 'taro', day: 3, dry: 0 } } ],
		jobs: { n1012: 'fish' }, queue: [ 'tower' ], morale: 62, known: { mano: 395 }, lastRaid: 380, lastH: 412, log: [ [ 380, 'raid_held', 1 ] ] } },
	corpses: [ { u: 'n1020', x, y, z, label: 'Malia', items: [ /* stacks */ ], t: 395.0 } ],
	regional: { '-15:-28': 0.4 }, known: { 'mano:waipahu': 1 },
	dir: { nextT: 0, intensity: 0, calmUntil: 0, rescued: 1 }, events: { nextRoll: 413, pending: [] },
};
```

**Compaction:**
- Short keys map to the 4.1 fields: `u` uid, `n` name, `f` fid, `tr` traits, `sk` skills, `mo` morale, `tru` trust,
  `gri` griev, `st` state.
- Positions are rounded to 0.1 m.
- `_`-prefixed runtime fields are stripped (the `serializeRecord` convention).
- Records of people dead for more than 3 game days are dropped (their counts are kept).
- At most 200 person records; met-only strangers expire after 5 game days unseen (4.1).
- `inv` is saved only when it differs from the seeded kit.
- Stores are ≤ 120 stacks per camp.

| Size | Target |
|---|---|
| Typical | < 150 KB |
| Worst case (3 full camps, 4 companions, 30 corpses) | < 400 KB |

### 11.3 Migration

- **Old saves, or `save.world.npcs` missing:** a fresh plan with starting reputation. The player keeps everything else.
- **`v` steps.** Migrations are a list of step functions `migrate[ v ]( data )` run in order up to the current version.
  Each step is tested with a fixture.
- **`planV` mismatch** (`data/homes.js` changed): home deltas whose ids still exist are kept, the rest are dropped.
  Captives held in dropped homes become loners nearby. Camps, the squad and people are always kept.
- **Unknown faction ids:** people become drifters; bands are dropped.
- **Unknown item ids** are dropped: `PlayerInventory.load` already drops stacks whose definition no longer exists, and
  camp stores and corpse items go through the same `ITEMS.has( id )` filter.
- **On load:** `items3d` keys for home loot are re-derived; markers are relinked through `m.npc`; corpse records within
  120 m rematerialise as `lying` corpses on the first update.
- **Hardcore** follows the existing rule: no saving after death. In normal play your camps, store and people survive
  your death (6.8).

---

## 12. Architecture

### 12.1 Module, install and frame order

**One new content module: NPCs.** It owns `src/npc/**`, `test/npc-*.mjs`, `test/lib/npc-world.mjs` and
`test/preview/npc-*`. Its handle is `game.npcs`.

- `src/game/modules.js` gets one line, `() => import( '../npc/NPCs.js' )`, **after Creatures and before Vehicles**.
- `docs/ARCHITECTURE.md` gets the ownership row `NPCs | src/npc/* | game.npcs`.

**`install( game )`:**
1. Imports `data/*`, which defines `marked_map` with `defineItems` and the `npc_*` loot tables before any save loads.
2. Plans the homes. Roads (`game.roads.net`), Sites and the HeightField are already installed. The whole world costs
   < 150 ms.
3. Builds `game.npcs`.
4. Registers the system with `game.register` and adds the interact provider.
5. Registers spawnables (`game.spawnables ||= {}`, names in 14.2 §F) and adds `/npc` commands lazily on `'start'`
   (Commands installs last): `/npc rep <fid> <n>`, `/npc reveal`, `/npc raid`, `/npc squad <n>`, `/npc hours <h>`
   (step the ledgers), `/npc director on|off`. They are on the Commands `creativeOnly` list. That list blocks them in
   hardcore and marks a survival save as cheated; it does not block them in survival. Test sessions in survival rely
   on that.
6. Sets `game.creatures.bandits.auto = false`.
7. Builds the voice buffers and subscribes to events.
8. Reads the URL flags `?npcs=0` (the module installs, saves and loads, but nothing materialises and the director is
   off: the baseline for performance session H) and `?npcdirector=0`.

**`NPCs.update( dt )`.** It runs after `Creatures.update` (which clears `creatures.npcs`) and before
`entities.update`:

1. **Clock:** `dh = game.time.hours − lastH`, clamped to [0, 720]; hour-boundary steppers (7.4). A jump over 0.25 h
   (sleep, `/time`) also applies to live humans' needs (6.7).
2. **World tick:** at most one home or camp ledger hour and one band per frame (round-robin); strategy and events on
   the day roll.
3. **Stream** (every 0.5 s): materialise or dematerialise, ≤ 1 spawn started per frame (avatars load async, so spawn
   may return a Promise).
4. **Feed the infected:** push live non-Ka Pele humans into `game.creatures.npcs`.
5. **Perception service** (`brain/senses.js`): refill the LOS budget (24); scan `ballistics.list` for near misses;
   hand out attack tokens; deliver queued `'noise'` events to listeners.
6. **Squad commanders:** 1 Hz, staggered.
7. **Input:** J tap and hold; the MVP tap (`plTap`); the squad strip at 3 Hz.
8. **Director:** every 30 s.

Then `entities.update` runs `Human.update`: think (cadence 9.4) → act → steer / move → gun → animate. Then
`interact.update` runs the NPC provider.

### 12.2 Files

"Pure" means no three.js, no DOM and no game reference: Node-testable with seeded rng.

```
src/npc/NPCs.js                 install(game), the system, game.npcs API, frame order                        engine
src/npc/constants/index.js      re-exports the area files below                                               pure
src/npc/constants/<area>.js     every tunable number in this plan: sense, aim, combat, agent, stream, social,
                                squad, world, econ, places, ui (one file per area)                            pure
src/npc/schema.js               record factories, uid, compaction, migrate()                                  pure
src/npc/rng.js                  rngFor(seed, …keys); re-exports hash32 / strHash / rng from sites/kinds.js    pure
src/npc/save.js                 serialize / load of save.world.npcs                                           pure-ish
src/npc/commands.js             spawnables, /npc commands                                                     engine
src/npc/data/factions.js        FACTIONS, RELATIONS, START_REP, REP_CAP, tierOf, groupSize                    pure
src/npc/data/homes.js           HOMES (anchor list of 3.2), POSTS (3.3)                                       pure
src/npc/data/kits.js            buildKit, pickAvatarFor, lookFor                                              pure + ItemDB
src/npc/data/loot.js            defineLootTable('npc_*'), STORE_TABLE, ARMORY_TABLE                           pure + Loot
src/npc/data/items.js           defineItems([marked_map]) + its Read verb (addUseActions)                     pure + hooks
src/npc/data/names.js           nameFor(fid, sex, R)                                                          pure
src/npc/data/barks.js           BARKS by key, PRIORITY                                                        pure
src/npc/brain/perception.js     sight and hearing maths                                                       pure
src/npc/brain/memory.js         Contacts, voice / radio sharing                                               pure
src/npc/brain/aim.js            σ model, P̂hit, reaction, lead, burst plan                                     pure
src/npc/brain/morale.js         morale, suppression, surrender odds                                           pure
src/npc/brain/utility.js        scorer, consideration curves                                                  pure
src/npc/brain/squad.js          Squad: posture, roles, slots, reservations, bounding, flank, search           pure on data
src/npc/brain/lof.js            line-of-fire safety (segment maths)                                           pure
src/npc/brain/cover.js          cover sampling, grading, cache, queue                                         engine (physics)
src/npc/brain/senses.js         LOS budget queue, near-miss scan, noise listener, NPC-vs-NPC sight pairs,
                                attack tokens                                                                 engine
src/npc/brain/actions/index.js  the registry: id → module for every action below (stubs from WP0)             pure
src/npc/brain/actions/*.js      engage, suppress, cover, reload, heal, revive, grenade, melee, withdraw, flee,
                                surrender, investigate, search, patrol, travel, follow, wait, guard, goto,
                                work, eat, sleep, loot, idle, talk, standoff, toll, stickup                   engine
src/npc/agent/Human.js          the Entity                                                                    engine
src/npc/agent/gun.js            real-ammo weapon handling via weapons/ops.js, npcShot                         engine
src/npc/agent/look.js           avatar budget, setLook, armband / head props, merged gun cache                engine
src/npc/agent/poses.js          procedural overlays                                                           engine
src/npc/agent/voice.js          procedural vocalisations, footsteps                                           engine (audio)
src/npc/social/relations.js     stance, rep, spillover, witness, drift                                        pure
src/npc/social/grace.js         grievance charge and reaction                                                 pure
src/npc/social/trust.js         trust deltas and stages                                                       pure
src/npc/social/dialogue.js      verbs per state, replies, demands                                             pure
src/npc/social/encounter.js     greet / challenge / standoff / warning ladder / toll / stick-up               engine-light
src/npc/squad/companion.js      recruit, follow (formation / trail), catch-up, boarding, death and respawn    engine
src/npc/squad/orders.js         J key, popMenu, order application                                             engine
src/npc/stream/materialise.js   tiers, caps, priorities, indoor gating, teleports, creatures.npcs feed        engine
src/npc/stream/corpses.js       corpse records ↔ entities                                                     engine
src/npc/stream/mini.js          minimal M1 director (Manō patrols, drifters); deleted when WP8 lands          engine
src/npc/world/planner.js        homes and posts on the real map (env as sites/plan)                           pure
src/npc/world/territory.js      512 m grid                                                                    pure
src/npc/world/bands.js          routes on roads.net, movement                                                 pure
src/npc/world/strategy.js       daily missions per faction                                                    pure
src/npc/world/resolve.js        square-law abstract fights                                                    pure
src/npc/world/events.js         world events, radio lines                                                     pure
src/npc/world/director.js       random encounters, pacing                                                     engine-light
src/npc/econ/needs.js           drain, eating from stores                                                     pure
src/npc/econ/jobs.js            JOBS, outputs as stacks                                                       pure + ItemDB
src/npc/econ/crops.js           CROPS, bed growth                                                             pure
src/npc/econ/works.js           WORKS, costs, progress                                                        pure
src/npc/econ/simulate.js        simulate(camp, hours, env, R), simulateHome(home, …)                          pure
src/npc/econ/stock.js           counters ↔ stacks                                                             pure + Loot
src/npc/econ/value.js           value(stack), markup(tier)                                                    pure
src/npc/econ/threat.js          defence D, raid and horde chances                                             pure
src/npc/places/layouts.js       layout(home, R) → props, slots, cover points, posts, job spots, crates        pure
src/npc/places/props.js         new procedural props built from Kit primitives; the destroyable Prop entity
                                (generator, relay, alarm bell)                                                engine
src/npc/places/camp.js          HomeSite: build, stream, dispose, crates, armory, alarm, captives             engine
src/npc/places/claim.js         makeCamp, claimHome, CampSite (board, store, tank)                            engine
src/npc/places/works.js         works meshes and colliders (garden beds, palisade, tower, tank, bench…)       engine
src/npc/places/raid.js          physical raids on camps                                                       engine
src/npc/places/signs.js         border markers                                                                engine
src/npc/ui/prompt.js            F provider, person menus                                                      engine (DOM via existing menus)
src/npc/ui/strip.js             squad strip                                                                   DOM
src/npc/ui/panel.js             Group / camp panel                                                            DOM
src/npc/ui/npc.css              styles for the strip and panel                                                CSS
```

### 12.3 Public API (`game.npcs`)

```js
game.npcs = {
	factions, homes, bands, people, camps,             // records: Maps by id
	live,                                              // Human[] currently materialised

	spawn( fid, pos, { role, kit, band, yaw, avatar, summoned } ),   // → Human | Promise<Human>
	spawnBand( fid, pos, { kind, n, yaw, summoned } ),              // → Promise<Human[]>
	spawnHome( fid, pos, { size } ),                                // → home record (debug: /summon camp_<fid>)

	companions(),                                      // → Human[] (materialised squad members)
	squadState(),                                      // → [ { uid, name, hp01, glyph, note, down, away } ] (squad strip)
	known(),                                           // → [ { pos, name, kind } ] (map layer, GPS-gated by MapUI)
	hostileNear( pos, r ),                             // → bool (sleep hook)
	watchOn(),                                         // → bool: a companion or camp guard is on watch (sleep hook)
	homeAt( pos ), campAt( pos ),                      // → record | null
	stance( a, b ),                                    // → 'hostile' | 'wary' | 'neutral' | 'friendly' | 'allied'
	relation( fa, fb ), rep( fid ),                    // → −100..100
	addRep( fid, d, why, { witnessed, pos } ),

	order( kind, arg, who ),                           // 'follow' | 'wait' | 'guard' | 'goto' | 'attack' | 'fire' | 'quiet' | 'loot'
	                                                   // | 'camp_make' | 'camp_go' | 'camp_stay' | 'regroup'
	makeCamp( pos ),                                   // → camp | reason ('people' | 'close' | 'hostile' | 'steep')
	claimHome( homeId ),                               // → camp | reason
	openPanel( section ),                              // Group / camp panel
	panel(),                                           // → plain data for the panel

	stats(),                                           // → { live, bands, homesBuilt, avatars, squadKills, shots, hits, hitByBand, encounters, catchUps, ms }
	update( dt ), serialize( save ), load( save ), dispose(),
};
```

### 12.4 How it hooks into existing systems

**Used as they are (no edits):**

| System | APIs |
|---|---|
| Game | `register`, `time.hours`, `hour`, `day`, `difficulty`, `mode`, `seed`, `toast`, `dropStack`, `give`, `dead`, `sleep` (through the hook below; it adds the hours in one jump) |
| Events | `'noise'`, `'damage'`, `'kill'`, `'playerDeath'`, `'container:close'`, `'container:changed'`, `'start'`, `'vehicle:enter'`, `'vehicle:exit'` (both emitted by Vehicles.js today); we emit `'chat'`, `'noise'` (`voice`, `alarm`) |
| Entities | `Entity` contract; `entities.add / remove / near / raycast` (raycast only in think, never nested) |
| Creatures | `pi`, `night`, `diff`, `lib` (`load`, `isLoaded`, `acquire`, `release`, `loadedIds`), `_request`, `_groundSpot`, `_inView`, `trail` / `trailN`, `npcs` (we push), `pop.density / zone / roadNear`, `spawnHorde`, the corpse `provide / search` path, `bandits` (auto flag) |
| Steer | `Mover`, `steer`, `move`, `stuckCheck`, `findPath`, `nav` |
| Body / Characters | `HumanBody` (`act`, `flinch`, `ragdoll`, `riseFromRagdoll`, mode `crawl` / `lying`, `crouch`, `look`, `aimPitch`, `hitTest`), `CharacterInstance.setLook / setLOD / bonePos / addWound`, `Rig.bend / aimAt / offsetPelvis`, `AVATARS`, `ALOHA`, `WORN` (Zombie.js) |
| Weapons | `ballistics.npcShot`, `hitEntity`, `coneDir`, `ZONE`, `ballistics.list` (read-only), `ballistics.explode`, `throwables.launch`, `throwables.list` (read-only), `weapons/ops.js`, `GunModels.buildGunView` (dynamic import; never edited) |
| Survival | `hurt` (via Ballistics and melee with `source`; applies worn armour, the 2.2 head factor and `diff.dmgIn`), `medicate( def )` (stops bleeding, then `treat`), `mood`, `addHurtGuard` (logging in tests only) |
| Skills | `levelFor( xp )`, `xpFor( n )`, `SKILLS` (pure exports; no per-NPC instance) |
| Items | `PlayerInventory`, `makeStack`, `getItem`, `defineItems`, `rollLoot`, `defineLootTable`, `extendLoot`, `LOOT_TABLES`, `addUseActions`, `ageStored`, `camoFactor`, `wornStats`, `allRecipes`, kitchen `newDish / cookDish`, outdoors `trapChance / castNet / pigChance / SMOKE / PIG_YIELD`, placeables `rainFill / snareChance / STALE_H` |
| Placeables | `placeables.near( pos, r, kind ) / refresh / add`, record `p.data` |
| Crafting | `placeFire`, `nearFire`, `boil`, `fuelValue( id )` (`FUEL` itself is not exported) |
| Physics | `near( x, z, r, out )`, `raycast`, `lineOfSight`, `ground`, `resolveCylinder`, `boxes` (a Map), `add / remove` for works colliders |
| WorldItems | `items3d.spawn( stack, pos, { key, persistent: false } )`, `items3d.remove( item, { taken: true } )`, `near` |
| Sites | `sites/plan.js probe / fits / FOOT / seaNear / cityAt`, `sites/kit.js Kit`, `sites/props.js PROPS`, `sites/kinds.js hash32 / strHash / rng`, `game.sites.find / near / drops` |
| Buildings | `city.buildingAt / isIndoors / interiors / doorAt / locate / relocate`, `doors` (fallback), `door.bash( amount, { source, kind } )` |
| Roads | `game.roads.net` (`roads`, `events`, `nearestOnNetwork`) |
| HeightField | `heightAt`, `baseHeight`, `surfaceAt`, `islandAt`, `flagsNear`, `wildness`, `normalAt` |
| UI | `interact.addProvider`, `openActionMenu`, `popMenu` (`ui/widgets.js`), `ui.openContainer`, `ui.confirm`, `ui.locationName`, `markers.add / remove / list` (40-marker cap that drops the oldest: the module re-adds its own markers if they go missing), `audio.play`, `audio.buffers.set`, `game.itemLights`, `input.is / pressed / codes`, `player.aimFov` |
| Weather | `weather.rain`, `weather.state` |
| Commands | `game.spawnables`, `game.commands.cmds` |

**Asks to other owners.** Each is small and merge-safe. We call them defensively with `?.`, and each has a fallback.
WP11 makes every "Lead (UI)" row. WP12 makes every other row except WP0's two lines. So no file is edited by two
packages.

| Owner | Change | Size | Fallback | Needed by |
|---|---|---|---|---|
| Lead | `modules.js` line; ARCHITECTURE ownership row | 2 lines | none (required) | WP0 |
| Creatures | `Bandits.update`: skip the spawn roll and despawn when `this.auto === false` (summoned bandits keep working) | 1 line | none (required) | M1 |
| Creatures | `Body` style `jaw: false` keeps the jaw closed on the living | 2 lines | reset `rig.jawOpen` after `body.update`, as CharacterPreview does | M1 |
| Creatures | `Body.update`: `this.overlay?.( rig, dt )` before `rig.end()` (procedural poses) | 1 line | wrap `inst.rig.end` per instance, restored on release | M1 |
| Creatures | `capReserve` subtracted from CAP in `_populate` | 1 line | accept the extra load | M3 |
| Buildings | `doors.npcOpen( d, src, { quiet } )`: open without the toast; noise source = `src` | ≤ 10 lines | door internals (`target`, `moving`, `_save`) | M2 |
| Buildings | export `hasWater( bi, si )` | 1 line | the hash formula | M4 |
| Lead (core) | `Game.sleep`: refuse when `g.npcs?.hostileNear( pos, 60 )`; ignore infected beyond 15 m when `g.npcs?.watchOn()` | 3 lines | sleep rules unchanged | M2 |
| Lead (core) | emit `'respawn'` from `respawn()` | 1 line | the `g.dead` true → false edge | M2 |
| Lead (core) | Commands `creativeOnly` += `npc` | 1 line | – | M1 |
| Lead (UI) | HUD `promptParts` / `_prompt`: generic `t.name`, `t.alts`, `t.tap`; `Interact.update` calls `t.tap` on a press-release shorter than 0.4 s (HUD.js + Interact.js) | ≤ 20 lines | verb label + name sub; `plTap` duck-typing | M2 |
| Lead (UI) | F3 debug block (HUD.js, next to `creatures.stats()`): one line from `g.npcs?.stats?.()` | 2 lines | `/npc stats` chat line | M1 |
| Lead (UI) | chat.css kinds `npc`, `npc-foe`, `radio`; Options toggle for `subtitles` | ~8 lines | kind `'sys'` | M2 |
| Lead (UI) | `BINDING_LABELS.gestures = 'Orders'`; new `group: [ 'KeyU' ]` in `DEFAULT_BINDINGS`, `BINDING_LABELS`, `KEY_GROUPS`; UI hotkey → `game.npcs.openPanel()` | ~6 lines | panel only from the board | M2 |
| Lead (UI) | `ui.hud.slot( 'bl' )` returns the bottom-left container | 3 lines | a fixed-position div on `document.body` | M2 |
| Lead (UI) | MapUI `_draw`, the HUD minimap and `_sig` loop over `g.npcs?.known?.()` | ~15 lines | markers only | M3 |
| Lead (UI) | InventoryUI container hooks `accept( stack ) → { ok, reason }`, `onTake`, `onPut` | ~20 lines | close-time rollback (6.9) | M5 |
| Lead (Bodies) | `bodies.near( pos, r ) → [ { items, pos } ]` | 5 lines | the feature waits | M5 |
| Vehicles | later: `seatNpc( v, seat, look )` for visible passengers (`'vehicle:enter'` / `'vehicle:exit'` already exist) | later | invisible riders | M5 |
| Lead (UI) | Options → Gameplay: `npcs` (Off / Fewer / Normal). Fewer halves the director chance and the live caps; Off stops materialising, but the ledger still runs (Settings.js + Menus.js) | ~6 lines | `?npcs=0` URL flag only | M5 |
| Items | an `armband` equip slot + faction armband items (disguise) | later | none | M5 |
| Vegetation | `densityAt( x, z )` 0..1 for real bush concealment | later | probe class + wildness | M5 |

### 12.5 Internal contracts (function names)

Agents code against these signatures from day one (WP0 publishes stubs).

```js
// brain/perception.js
sightRange( V, { night, nvg, flash, rain, conceal, sense, alert } ) → R
coneFactor( cosHead, d, targetMoving ) → 0 | 0.2 | 0.4 | 1
sightRate( d, R, cone ) → per second
stepAware( aware, dt, rate, seen ) → aware
hears( noise, listener, { hear, indoorMismatch, rain, sense, night } ) → { heard, err, effect }
// brain/memory.js
class Contacts { constructor( n = 6 ); see( key, pos, vel, t ); hear( key, pos, err, t ); told( key, pos, err, t ); shotAt( key, pos, t );
	update( dt, t ); best( scoreFn ); get( key ); forget( key ); }      // contact: { key, est, vel, u, conf, seenT, heardT, src, hostile, threat }
// brain/aim.js
TIERS; sigma( tier, d, { vlat, stance, move, light, S, hp, armHit, burstK, weaponK, firstBurst, grace, diffAttack } ) → metres
spreadFor( sigmaM, d ) → radians; pHit( sigmaM, { w: 0.64, h, aimH } ) → 0..1; reaction( tier, { turn, lowered, relaxed }, R ) → s
aimPoint( est, vel, tof, tier, R, out ) → out; burstPlan( firearm, d, R ) → { n, pause }
// brain/morale.js
moraleDelta( event, { brave, nervous } ) → Δ; moraleStage( m ) → 'ok' | 'cautious' | 'withdraw' | 'break'
surrenderOdds( fid, leaderAlive ) → p; suppress( S, event ) → S; decayS( S, dt, tier ) → S
// brain/utility.js
score( npc, ctx ) → [ { id, score, arg } ]; pick( list, current, commitT ) → choice; curves: lin, quad, inv, logistic
// brain/squad.js
class Squad { constructor( fid, kind, members ); tick( t, ctx ); posture; roleOf( m ); slotOf( m ); reserve( spot, m ); release( m ); }
// brain/lof.js
clearShot( muzzle, aim, { player, friends, extend: 5 } ) → bool; segDist( a, b, p ) → m
// brain/cover.js
requestCover( npc, threatEst, { idealRange, flank } ) → ticket; poll( ticket ) → spot | null | 'pending'
// brain/senses.js
class Senses { constructor( game ); tick( dt ); requestLOS( npc, from, to, priority ) → ticket; los( ticket ) → bool | null;
	takeToken( shooter, target ) → bool; releaseToken( shooter ); onNoise( e ); nearMisses( npc ) → [ { shooter, dist, dir } ] }
// brain/actions/<name>.js
export default { start( npc, arg ), update( npc, dt ) → 'run' | 'done' | 'fail', end( npc ) }
// agent/gun.js
class Gun { constructor( npc ); equip( stack ); ready(); fire( dir, { spread, visual } ) → bool; reload() → seconds; rounds(); reserve(); idealRange(); }
// agent/look.js
pickAvatar( fid, R, { loaded, budget } ) → id | null; applyLook( inst, look ); gunView( defId ) → Object3D; releaseGunView( obj ); propsFor( fid, inst ) → Object3D[]
// agent/poses.js
overlay( rig, npc, dt )   // npc.pose: 'handsUp' | 'kneelWork' | 'hammer' | 'carry' | 'pistol' | 'reload' | 'throw' | 'sit' | 'captive' | 'point' | 'wave'
// agent/voice.js
makeVoices( audio ); bark( npc, key ) → bool (rate-limited); step( npc, speed, stance )
// social/*
stance( a, b ); addRep( state, fid, d, why, { witnessed } ); witnessed( event, members, canSee, canHear ) → bool; drift( state, days )
charge( griev, info, ctx ) → { w, amount }; graceReaction( griev, trust, isCompanion ) → 'watch' | 'warn' | 'hostile' | 'leave' | 'stop'
trustDelta( event, traits ) → Δ; trustStage( t ) → 'leave' | 'wary' | 'ok' | 'loyal'
verbsFor( npc, ctx ) → [ { id, label } ]; reply( npc, verb, ctx, R ) → text; demandFor( R ) → kind; meetsDemand( kind, stack, def ) → bool
class Encounter { constructor( group, ctx ); tick( dt ); state }   // greet | challenge | standoff | warning | toll | stickup | engage
// squad/*
recruit( npc, source ); dismiss( npc ); followStep( npc, dt ); catchUp( npc ) → bool; board( vehicle ); unboard( vehicle ); onPlayerDeath(); onRespawn()
openOrders(); applyOrder( kind, arg, who )
// stream/*
streamTick( t ); spawnFromRecord( rec ) → Human | Promise; writeBack( human ); onTeleport(); toCorpseRecord( human ); corpseFromRecord( rec )
// world/*
planHomes( env, seed, HOMES, POSTS ) → { homes, posts }   // env = the sites/plan env + buildingsOf( cityId, type ) → [ rec ], roadEvents, labels
buildGrid( homes, env ) → { owner( x, z ), strength( x, z, fid ) }
routeBetween( net, island, from, to ) → [ [ x, z ] … ]; advanceBand( band, dt ); dailyMissions( fid, state, R ) → missions
power( side ) → S; resolve( a, d, { fort, night }, R ) → { winner, dead, wounded, loot }; rollDay( state, R ) → events
directorTick( t ); encounterChance( cell, hour ) → P; pickEncounter( presence, R ) → type
// econ/*
drain( needs, hours, activity, heat ); eatFrom( items, needs ) → consumed
outputFor( job, worker, env, hours, R ) → stacks; assignJobs( camp ) → jobs; growBed( bed, hours, env ) → stacks
canBuild( work, store ) → missing; progressWorks( camp, hours )
simulate( camp, hours, env, R ) → log; simulateHome( home, hours, env, R ) → log
toStacks( counters, table, R ) → stacks; fromStacks( stacks ) → counters; value( stack ) → n; markup( tier ) → k
defence( camp, ctx ) → D; raidChance( camp, fid, ctx ) → P; hordeChance( camp, ctx ) → P
// places/*
layout( home, R ) → { props, slots, coverPts, posts, jobSpots, crates }; class HomeSite { build(); dispose(); provide( ray ) }
makeCamp( pos ) → camp | reason; claimHome( id ); class CampSite; startRaid( camp, band )
```

### 12.6 Events

| Emitted | Payload |
|---|---|
| `'npc:join'` | `{ npc }` |
| `'npc:leave'` | `{ uid, name, why }` |
| `'npc:down'` | `{ npc }` |
| `'npc:death'` | `{ uid, name, fid, pos, source }` |
| `'npc:rep'` | `{ fid, rep, d, why }` |
| `'npc:hostile'` | `{ fid, group }` |
| `'npc:bark'` | `{ uid, key, text }`, plus a `'chat'` line |
| `'camp:made'` | `{ camp }` |
| `'camp:raid'` | `{ camp, fid, physical, result }` |
| `'home:alarm'` | `{ home }` |
| `'home:fall'` | `{ home, by }` |
| `'noise'` | kinds `'voice'` and `'alarm'`, source = the NPC |

**Listened:** `'noise'`, `'damage'`, `'kill'`, `'playerDeath'`, `'container:close'`, `'container:changed'`, `'start'`,
`'vehicle:enter'`, `'vehicle:exit'`; `'respawn'` once it exists.

### 12.7 What is ported from Bandit.js

Bandit.js belongs to Creatures and is **not edited**, except for the `auto` flag ask. `/summon bandit` keeps working.
After M3, Creatures may alias `/summon bandit` to `npc_mano` and retire the file.

| Bandit part | New home | Fix |
|---|---|---|
| Detection (instant, 95 × V m, ±84°, sees behind in combat) | `brain/perception.js` | Awareness ramp, tells, cone from the head, cap 150 m, rain and difficulty |
| `_combat` (true player position) | `actions/engage.js` + `memory.js` | Belief only (`contact.est`) |
| `_alertGroup` (free target hand-off) | `memory.js` voice and radio | Delays and errors; told ≠ seen |
| `_idealRange` | `agent/gun.js idealRange()` | Bows and marksmen added |
| `_firingSpot` | `brain/cover.js` | Material grading, muzzle-height LOS, reservations, rationing, caching, flank bias |
| `_shoot` (spread model, infinite ammo, rpm-only cadence) | `agent/gun.js` + `brain/aim.js` | σ model with floor, lead, real ammo, perRound reloads, boltTime, first-burst rule, P̂hit gate, line-of-fire |
| `damage` (any head hit kills; retargets on any source) | `Human.damage` | Head ≥ 60, armour per zone, grievance, no infighting, downed |
| `lootItems` (gun + random roll) | `Human.lootItems` | The real inventory |
| `_gun` (10–13 meshes, shadows to 120 m) | `agent/look.js` | Merged 1–2 draws, hidden beyond 60 m, shadow ≤ 25 m |
| `_animate` (1/2/4 frames by distance, animates hidden) | Human, using the Creatures `_lod` cadence | 12 frames off-screen |
| `ammoFor` | `data/kits.js` via `ops.ammoIdsFor` | – |
| Spawner (one group, 280 m despawn) | `world/director.js` + `stream/materialise.js` | Territory, records, persistence |

---

## 13. Work packages

**Rules for every package:**
- Each package owns only its files (no two packages write the same file), keeps every existing suite green, adds its
  own test section, and is buildable and testable alone against WP0's stubs.
- **Shared files have one owner.**
  - `NPCs.js` calls every subsystem through the 12.5 contracts from day one, so packages fill in their own files and
    never edit it. Changes to it go through WP0, and through WP13 after M1.
  - `constants/<area>.js`: WP0 writes them all with this plan's numbers. Each then belongs to its area's package
    (sense, aim → WP1; agent → WP3; combat → WP4; stream → WP5; social → WP6; squad → WP7; world → WP8; econ → WP9;
    places → WP10; ui → WP11), and WP13 tunes them.
  - `brain/actions/index.js` (the action registry) is WP0's. It lists every action from day one with a stub module,
    and each package replaces only its own action files.
  - The test runners `test/npc-*.mjs` are thin files owned by WP0. They import per-package section files
    `test/npc/<wp>-<area>.mjs`, which each package owns. Each runner takes a section filter
    (`node test/npc-ai.mjs C`) so a package can run its part alone.
  - Lead files: WP11 is the only package that edits UI files (HUD.js, Interact.js, chat.css, Settings.js, Menus.js,
    UI.js, MapUI.js, InventoryUI.js, `test/preview/ui.js`). WP12 is the only one that edits other owners' files
    (Creatures, Buildings, Game core, Commands, Bodies, Items, Vegetation). WP0 makes the `modules.js` line and the
    ARCHITECTURE row.
- One browser at a time, machine-wide (the `test/lib/browser.mjs` lock). Only WP3, WP11 and WP13 need a browser. Every
  other package verifies in Node. Heavy Node suites (`npc-ai`, `creatures-ai`) run one at a time on the 4-CPU machine.
- Pure modules are tested in Node first.
- Browser checks follow CLAUDE.md: one browser at a time, JPEG under your own `/tmp` directory, close it at once.

**Order** (it matches the Depends column):
1. WP0 lands first.
2. Then, in parallel: WP1, WP2, WP3 (against WP2's stubs), WP8, WP9, WP11 and WP12 (M1 rows). WP2 delivers
   `data/factions.js` and `data/homes.js` first, so WP8 plans on real data.
3. Then, in parallel: WP4, WP5 and WP6.
4. Then WP7 and WP10.
5. WP13 runs from M1 onward.

| WP | Name | Size | Depends on | Milestone |
|---|---|---|---|---|
| WP0 | Spine and contracts | S | – | M1 |
| WP1 | Brain maths (pure) | M | WP0 | M1 |
| WP2 | Faction data, kits, loot, homes list (pure) | M | WP0 | M1 |
| WP3 | Human body, gun, look, poses, voice | L | WP0, WP2 (stub OK) | M1 |
| WP4 | Combat brain | L | WP1, WP3 | M1 |
| WP5 | Streaming and corpse records | M | WP0, WP3 | M1 |
| WP6 | Social, encounters, prompts | M | WP1, WP3 (WP4 stub for engage) | M2 |
| WP7 | Companions and orders | L | WP4, WP6 | M2 |
| WP8 | World model and director | L | WP0, WP2 (data first) | M3 |
| WP9 | Economy (pure) | M | WP0 | M4 |
| WP10 | Places: faction homes, player camps, raids | L | WP3, WP5, WP8, WP9 | M3 / M4 |
| WP11 | UI: strip, panel, lead UI hooks | M | WP0 (stub data) | M2 |
| WP12 | Cross-module hooks (owners) | S each | WP0 | M1–M5 |
| WP13 | Integration, browser verification, balance | M, ongoing | all | M1–M5 |

**Milestones:**
- **M1 "Fair fight".** Manō and drifters roam, through a minimal director in WP5. Random bandits are off, combat is fair,
  kits and loot are real, corpse records are saved. Playable on its own.
- **M2 "Companions".** Meet, recruit, follow, orders, revive, standoffs, tolls, prompts, subtitles, squad strip.
- **M3 "Living islands".** All six factions, homes and posts on the real map, territory, bands, strategy, off-screen
  fights, world events, the full director, the map layer.
- **M4 "Settle".** Player camps, jobs, crops, works, the ledger online and offline, raids on camps, the Group panel.
- **M5 "Polish".**
  - Trade with a live balance, the job board, named enemies, radio chatter, player surrender.
  - Visible passengers, the armband slot, companions carrying your gear home, vegetation concealment.
  - The People option (Off / Fewer / Normal), live hunting.
  - A balance pass.

### WP0. Spine and contracts (S, first)

- **Goal.** The module installs, saves and loads an empty world. Every contract in 12.5 exists as a stub, so other
  packages can start in parallel.
- **Files owned:**
  - `src/npc/NPCs.js`, `constants/*.js` (every number in this plan), `schema.js`, `rng.js`, `save.js`, `commands.js`
    (spawnable names registered; they spawn once their packages land), `brain/actions/index.js` with a stub per
    action, and the `?npcs=0` / `?npcdirector=0` flags;
  - `test/lib/npc-world.mjs`;
  - the skeletons of `test/npc-logic.mjs`, `test/npc-ai.mjs`, `test/npc-world.mjs`, `test/npc-econ.mjs` and
    `test/npc-places.mjs`.
- **Pre-approved lead edits:** the `modules.js` line and the ARCHITECTURE.md ownership row.
- **`test/lib/npc-world.mjs`:**
  - Extends `test/lib/creature-world.mjs makeWorld()` with the NPC module installed, plus stubs for `markers`,
    `placeables`, `sites`, `roads.net`, `input`, `vehicles`, `hands`, `city.interiors` / `doors`, `commands`, and a real
    `PlayerInventory` on the player.
  - Helpers: `w.npc( fid, pos, o )`, `w.band( fid, pos, o )`, `w.companion( o )`, `w.order( kind, arg )`,
    `w.hours( h )` (advance game time), `w.aimAt( e, sec )`, `w.interact( target, { hold } )` (runs the real
    crosshair ray through the providers), `w.key( code, sec )` (press or hold a binding), `w.quality( q )`.
  - It takes a machine-wide lock (`/tmp/deadtide-npcai.lock`), so two packages never run `npc-ai` at once on the
    4-CPU machine.
- **Acceptance:**
  - The game boots with the module: a browser smoke test shows no console errors.
  - An empty save round-trips; an old save without `npcs` loads.
  - `node test/npc-logic.mjs` runs.
  - All existing suites stay green.

### WP1. Brain maths (M, pure)

- **Goal.** Perception, memory, aim and morale exactly as in 5.3–5.6.
- **Files owned:** `src/npc/brain/perception.js`, `memory.js`, `aim.js`, `morale.js`; their `npc-logic` sections.
- **Acceptance:**
  - **Aim.** A Monte Carlo of 20,000 samples per cell reproduces every row of the 5.6 hit table within ±2 pp. No cell is
    above 85 %. The TTK table is reproduced within ±10 %.
  - **Sight.** Time to identify reproduces the 5.3 table within ±10 %.
  - **Hearing.** Radii, the indoor mismatch, and estimate errors (mean 0.10·d ± 0.03·d for gunshots).
  - **Memory.** The estimate freezes after 1.5 s; uncertainty grows 1.5 m/s; forget at 60 s (sentries 180 s).
  - **Morale.** Stages at 45 / 25 / 10; surrender odds by faction.
  - **Reaction.** Distributions per tier; the minimum ≥ 0.4 s.

### WP2. Faction data, kits, loot, homes list (M, pure)

- **Goal.** Everything in section 3 as data.
- **Files owned:** `src/npc/data/factions.js`, `homes.js`, `kits.js`, `loot.js`, `items.js`, `names.js`, `barks.js`;
  their `npc-logic` sections.
- **Acceptance:**
  - **Kits.** 200 kits per faction × role. Every id exists. Guns are `readyToFire`, magazines fit, calibres match
    `ammoIdsFor`, armour values are in range, and avatars come from the faction list.
  - **Loot.** 1,000 rolls of every `npc_*` table give valid stacks.
  - **Items.** `marked_map` is registered with a Read verb.
  - **Names.** Deterministic per seed, unique within a home.
  - **Homes list.** `HOMES` has 41 homes + the ruin. `POSTS` has 32 entries covering all 33 road events. Entries are
    keyed by road name + event type, because lihue-kapaa has both a Manō roadblock and a Kiaʻi checkpoint. The
    kihei-wailea post covers both of its roadblocks.

### WP3. Human body, gun, look, poses, voice (L)

- **Goal.** A living, fair-looking human entity that holds real kit and dies into a searchable body.
- **Files owned:** `src/npc/agent/Human.js`, `gun.js`, `look.js`, `poses.js`, `voice.js`; `npc-ai` §A; the lineup
  page `test/preview/npc-lineup.{html,js}` and its capture script `test/preview/npc-lineup-shot.mjs`. They are
  modelled on the creatures preview, which belongs to Creatures and is not edited.
- **Acceptance:**
  - **Spawning.** Every faction spawns (promises resolved).
  - **Damage.** Zones with the armour per zone; head ≥ 60 lethal (pellet 56 is not; 5.56 through a military helmet is);
    downed for companions; stagger, knockback, `stun` and `ignite` behave as in 4.2.
  - **Corpses.** A corpse's Search shows the real inventory, with the gun's remaining rounds.
  - **Ammo.** Firing drains magazines through `ops.js`. A remington_870 reload equals 6 × `perRound` ± 10 %. `boltTime`
    is respected.
  - **Budgets.** `dispose()` leaves no skinned meshes or extra objects in the scene. ≤ 4 NPC-only templates are loaded
    during a 30-spawn churn. Merged gun views are 1–2 draws.
  - **Draw parity.** On `quality: 'low'`, a human at 150 m is drawn (LOD 1), and one at 175 m is hidden. With
    `player.aimFov = 0.3` it is drawn to 260 m.
  - **Looks.** Jaws are closed. A browser lineup of the six factions + drifters, day and night (`npc-lineup-shot.mjs`),
    is readable apart.

### WP4. Combat brain (L)

- **Goal.** Fair, readable firefights as in 5.1 and 5.5–5.10.
- **Files owned:** `src/npc/brain/utility.js`, `squad.js`, `lof.js`, `cover.js`, `senses.js`, and the combat, alert
  and movement actions
  `brain/actions/{engage,suppress,cover,reload,heal,grenade,melee,withdraw,flee,surrender,investigate,search,patrol,travel,idle}.js`;
  `npc-ai` §B, §C.
- **Acceptance:**
  - The fairness charter tests (5.11, 14.2 §B).
  - Hit bands in real ballistics within ±8 pp; TTK median ≥ 4.5 s.
  - No retarget among squad mates after a stray.
  - Cover reached within 4 s in ≥ 80 % of trials; a flank ≥ 60° within 25 s.
  - Grenade and molotov rules.
  - Attack tokens (C12).
  - Morale, withdraw and surrender statistics; the infected interplay.
  - **Cost:** 12 humans in combat + 30 infected ≤ 2.5 ms median.

### WP5. Streaming and corpse records (M)

- **Goal.** Records ↔ entities as in 9.4–9.5, plus a minimal director (Manō patrols and drifters) so M1 is playable.
- **Files owned:** `src/npc/stream/materialise.js`, `corpses.js`; the minimal director lives in
  `src/npc/stream/mini.js`; `npc-ai` §F. Once WP8 lands, WP13 (owner of `NPCs.js` after M1) switches the import to
  `world/director.js` and deletes `mini.js`.
- **Acceptance:**
  - Caps by quality, with priorities.
  - **No spawn in view.** `_inView` is false at every spawn within 165 m.
  - **No flapping** while the player walks back and forth across 190–260 m.
  - A → B → A keeps hp, ammo and inventory.
  - Indoor gating works with a stub `interiors`.
  - A teleport > 350 m dematerialises non-companions.
  - Corpse records round-trip through save.
  - `creatures.npcs` holds the live non-Ka Pele humans every frame.
  - `bandits.auto = false` stops random bandits; `/summon bandit` still works.

### WP6. Social, encounters, prompts (M)

- **Goal.** Reputation, the witness rule, grievance, trust, dialogue, the encounter protocol, tolls, stick-ups and the F
  provider.
- **Files owned:** `src/npc/social/*`, `src/npc/ui/prompt.js`, `brain/actions/{talk,standoff,toll,stickup}.js`;
  `npc-ai` §E.
- **Acceptance:**
  - **Grievance.** One stray 10-damage hit → "Watch it", still friendly. Three aimed hits → the group of 3 is hostile
    within 1 s, with rep −15.
  - **Witness rule.** Killing a lone ʻOhana member with no member within 60 m and none aware leaves rep unchanged until
    the body is found (−5). With one watching, −40.
  - **Standoff.** The timings in 6.12. The Koa and Paniolo ladder distances in 3.8.
  - **Toll.** Paying gives 2 days of passage; refusing makes them fire inside 30 m.
  - **Recruiting.** Through `w.interact()` with a demand met through the pack container.
  - **Prompt cost** ≤ 0.05 ms a frame with 10 NPCs within 4 m.

### WP7. Companions and orders (L)

- **Goal.** Section 6: following, orders, squad combat, revive, loot, pack, boarding, death and respawn policy, sleep
  watch.
- **Files owned:** `src/npc/squad/companion.js`, `orders.js`, `brain/actions/{follow,wait,guard,goto,loot,revive}.js`;
  `npc-ai` §D.
- **Acceptance:** §D of 14.2.

### WP8. World model and director (L)

- **Goal.** Sections 3.2–3.4 and 9.1–9.3 on the real map.
- **Files owned:** `src/npc/world/*`; `test/npc/wp8-*.mjs` (run by `test/npc-world.mjs`).
- **Acceptance:** 14.3.

### WP9. Economy (M, pure)

- **Goal.** Section 7.3–7.8 as pure functions.
- **Files owned:** `src/npc/econ/*`; `test/npc/wp9-*.mjs` (run by `test/npc-econ.mjs`).
- **Acceptance:** 14.4.

### WP10. Places: faction homes, player camps, raids (L)

- **Goal.** Section 8, plus the physical parts of 7: build, stream and dispose; crates, the armory, captives, the
  alarm and reinforcements; claim, board, store, tank, works meshes; physical raids; border signs.
- **Files owned:** `src/npc/places/*`, `brain/actions/{work,eat,sleep}.js` (home and camp routines);
  `test/npc/wp10-*.mjs` (run by `test/npc-places.mjs`).
- **Acceptance:** 14.5.

### WP11. UI (M)

- **Goal.** Section 10.
- **Files owned:** `src/npc/ui/strip.js`, `panel.js`, `npc.css`, the NPC states in `test/preview/ui.js`.
- **Lead edits**, pre-approved by this plan: every "Lead (UI)" row of 12.4, in `HUD.js`, `Interact.js`, `css/chat.css`,
  `Settings.js`, `Menus.js`, `UI.js`, `MapUI.js` and `InventoryUI.js` (M5 container hooks). WP11 is the only package
  that edits these files.
- **Acceptance:**
  - Harness states `?screen=group` and `?hud=squad,npcprompt` look right at 1920×1080 and 1280×720 (screenshots).
  - The strip writes the DOM only on change.
  - The panel renders from an `npcs.panel()` fixture.
  - J and U are rebindable and pass the Menus clash detector.

### WP12. Cross-module hooks (S each, by owners)

- **Goal.** The non-UI ask rows of 12.4 (Creatures, Buildings, Lead core, Commands, Lead Bodies, Vehicles, Items,
  Vegetation), each ≤ 20 lines, in their owners' files, with their owners' suites green. The "Lead (UI)" rows belong
  to WP11.
- **Default-off behaviour keeps old tests unchanged.** For example, `bandits.auto` defaults to true, so
  `creatures-ai.mjs` still passes 145 / 145.
- **Order:**
  - M1: Creatures (auto flag, jaw, overlay); Commands `creativeOnly`.
  - M2: Buildings `npcOpen`, Game sleep / respawn.
  - M3: `capReserve`.
  - M4: `hasWater`.
  - M5: `bodies.near`, armband slot, `densityAt`, `seatNpc`.

### WP13. Integration, browser verification, balance (M, ongoing)

- **Goal.** Sessions 14.7 pass, balance targets 14.8 are met, `npcs.stats()` shows in the F3 overlay (WP11's line),
  and this plan's numbers are kept in sync with `constants/*.js`.
- **Files owned:** `test/preview/npc-session*.mjs`, `test/preview/npc-steps/*.json` (not WP3's lineup files),
  `src/npc/NPCs.js` after M1, and the "as built" notes appended to this document.

---

## 14. Test and balance plan

### 14.1 `node test/npc-logic.mjs` (pure, seeded, < 5 s)

| Area | Checks |
|---|---|
| Aim (WP1) | 20,000-sample Monte Carlo per cell reproduces the 5.6 table ±2 pp; σ floor caps at 85 %; modifiers are monotonic (sprint < jog < walk < still; prone < crouch < stand; night < day; suppressed < calm); TTK medians ±10 % |
| Perception (WP1) | Identify times ±10 % of 5.3; zero beyond R; rear cone nothing beyond 3 m; prone still R = 23 m by day and 7 m at night; torch and vehicle capped at 150 m; notice tell ≥ 0.25 s before identify beyond 10 m |
| Hearing, memory, morale (WP1) | Radii; errors; freeze and growth; forget; stages; surrender odds; Ka Pele never below 40 while the leader lives |
| Utility (WP4 pure part) | 25 fixture states map to the expected action (reload in cover vs exposed, revive vs engage, flee at low morale, suppress only when told and in role) |
| Relations, grace, trust (WP6 pure part) | Tier thresholds; spillover; Manō cap −20, Ka Pele cap −50; witness fixtures; grievance weights and reactions; trust deltas, stages and traits |
| Dialogue | Verbs per state; demand distribution (30 / 15 / 15 / 15 / 25 ± 3 % over 2,000 rolls); `meetsDemand` per kind |
| Kits and loot (WP2) | the WP2 acceptance list |
| Schema and save (WP0) | serialize → JSON → load is deep-equal; `migrate` fixtures; compaction rules; a 60-day simulated save stays < 150 KB |

### 14.2 `node test/npc-ai.mjs` (`test/lib/npc-world.mjs`; real physics, ballistics, avatars, ragdolls; survival.hurt logged; < 90 s)

`creatures-ai.mjs` takes about 5 s on this machine with the same harness, so 90 s holds. Statistical checks with many
trials (surrender odds, hit bands) run their distributions in `npc-logic` on the pure functions. `npc-ai` runs a
handful of integration trials of each.

**§A Body (WP3):** the WP3 acceptance list.

**§B Perception and fairness (charter 5.11):**

| # | Check | Pass |
|---|---|---|
| B1 | Sentry facing a still standing player at 60 m by day | identifies in 3.5–8 s (10 trials), never < 2 s |
| B2 | Night, unlit, 50 m | not identified in 20 s; with a torch (`g.hands.spot.intensity`) identified in < 5 s |
| B3 | Prone still at 30 m by day | never in 20 s; crouched still at 30 m identified in 2–4.5 s |
| B4 | Player walking behind the NPC at 15 m | no sight; sprinting at 12 m turns it by hearing within 2 s |
| B5 | Tell | the notice stage precedes the first shot by ≥ 0.25 s in ≥ 95 % of 20 trials beyond 10 m |
| B6 | No omniscience | after LOS is lost behind a wall and the player moves 10 m, mean facing error > 25° after 4 s; `est` frozen at the last seen spot; 0 hurt entries while hidden |
| B7 | Range cap | no NPC shot at > 150 m; every aimed hurt entry from an NPC had NPC → player LOS within the previous 3 s; `supp` hits ≤ 10 % of NPC damage |
| B8 | Smoke | `fx.smokeBlocks` stub between them: no identification |
| B9 | Draw parity | `quality: 'low'`: every NPC that fires at the player during a 60 s fight at 100–150 m is at LOD 1 (drawn) at the moment of each shot |

**§C Combat (WP4):**

| # | Check | Pass |
|---|---|---|
| C1 | Hit bands | average AKM vs a still player at 10 / 30 / 60 / 100 m, 150 shots each: within ±8 pp of 5.6; never > 85 % |
| C2 | Moving target | jogging across at 30 m ≤ 0.75 × the still rate |
| C3 | TTK | median ≥ 4.5 s over 10 runs (average AKM, 30 m, normal, unarmoured) |
| C4 | First burst | the first burst's hit rate ≤ 0.5 × the settled rate |
| C5 | No infighting | a hostile squad of 4 under fire for 60 s, with 1 forced stray: 0 frames targeting a mate |
| C6 | Cover | walled arena under fire: a hidden spot within 4 s in ≥ 80 % |
| C7 | Flank | player in cover for 25 s vs a squad of 4: ≥ 1 member reaches ≥ 60° flank angle |
| C8 | Grenades | Koa vs a player in cover at 20 m for 10 s: thrown in ≥ 50 % of runs; "Grenade" bark logged first; never with a friend within 12 m of the impact |
| C9 | Morale | kill 2 of 4 quickly: the survivors' distance grows within 10 s; a cornered lone Manō at 25 % hp surrenders in 8–24 of 40 trials; Ka Pele never surrenders while their leader lives |
| C10 | Infected | live humans are in `creatures.npcs` and get attacked; Ka Pele are never targeted in 30 s; a machete holder fights a lone infected in melee |
| C11 | Real ammo | a raider body after 10 shots from a 30-round AKM holds 20 rounds (±1 chambered) |
| C12 | Attack tokens | 6 Manō aware of a lone player at 30 m on normal, 60 s: in no 1 s window do more than 3 fire aimed shots at the player; the others log suppress, cover or flank actions |
| C13 | Companions as targets | a hostile's first burst at a companion is ≥ 2× wider (as for the player); a companion downed by a torso hit is not shot again during the fight |

**§D Companions (WP7):**

| # | Check | Pass |
|---|---|---|
| D1 | Friendly fire | player 1 m off the companion's line vs a raider at 30 m, 60 s: 0 hurt entries from the companion, ≥ 5 companion shots (it repositions) |
| D2 | Following | 150 m course with a door room at 4.3 m/s: lag ≤ 20 m, end distance ≤ 8 m, never inside walls, within 2–8 m in 90 % of open-ground samples |
| D3 | Catch-up | player jumps 300 m: companions within 30 m inside 5 s (traveller band → rematerialise); `_inView` false at every teleport |
| D4 | Orders | Wait drift ≤ 2 m in 60 s; Guard engages a hostile at 35 m and returns to its point; Go there arrives within 3 m; Attack engages the crosshair target within 2 s when visible; Hold fire: 0 shots at an unaware raider at 40 m unless hit; Quiet: crouch-walk and no barks except contact |
| D5 | Downed and revive | a lethal torso hit leaves them downed; revive with a bandage gives hp 30 and consumes it; untreated, dead at 90 ± 1 s |
| D6 | Ammo | a companion with 30 rounds fires ≤ 30, then "Out of ammo." and switches weapon; after the fight it picks up matching ammo from a body |
| D7 | Loot area | takes matching ammo and meds via `items3d.remove( …, { taken: true } )`; reports a bark |
| D8 | Pack | opening the pack freezes the companion; closing re-equips the better gun handed over |
| D9 | Boarding | stub vehicle: companions within 12 m board; they reappear beside it on exit |
| D10 | Death policy | player death: companions guard the body; on respawn (edge) they head to the camp |
| D11 | Tag-along | a good drifter (forced tag-along roll) identifies a non-hostile player: tails at 25–40 m for 120 s of walking, stops when the player stops, barks "Can I come?" when the player stops within 15 m; `[F] Take in` makes it a companion; ignored for 3 game hours (`w.hours`) it leaves |
| D12 | Treating you | the player bleeding, a companion with a bandage within 5 m, no hostile for 5 s: after "Hold still." and 3 s still, `survival.bleeding` drops and the companion's bandage stack is gone |
| D13 | Bystanders | a companion fighting a raider with a neutral drifter 1 m off the line of fire: 0 hits on the drifter in 60 s |
| D14 | Orders menu | hold J opens the menu; Digit3 picks Guard and the hotbar slot does not change; Go there uses the ground point captured when the menu opened |

**§E Social (WP6):** the WP6 acceptance list, plus:
- a Paniolo kapu ladder (bark at 100 m, warning shot at 70 m that misses by 4–6 m, engage at 40 m);
- a Kiaʻi safe-zone holster rule;
- **companion grievance**:
  - at trust 40, two aimed 30-damage hits make the companion leave ("I'm done.");
  - at trust 95 (thresholds doubled), three such hits give "Last warning." twice, then "Stop that." with trust
    ending at 55, and they stay;
- **attribution**: a companion ordered to Attack an ʻOhana member, with another member watching, costs your ʻOhana rep
  −40 on the kill;
- **stick-up**: `[F] Drop bag` (hold 1 s) drops the back slot within the 6 s; the Manō take it and back off;
- **scout**: a Manō scout that sees the player within 150 m of a camp marks the camp known to Manō; killing it first
  leaves the camp unknown;
- **Wary Manō**: at rep −20 a Manō patrol challenges with "Pay or turn back." instead of firing on identify.

**§F Streaming and saves (WP5, WP0):**
- The WP5 acceptance list.
- **Save round trip.** Squad, trust, inventories, positions, camps, rep, home deltas, bands and corpse records survive
  serialize → JSON → load into a second world.
- **Summons.** Every new `/summon` name spawns (promises resolved): `npc_drifter`, `npc_seeker`, `npc_ohana`,
  `npc_kiai`, `npc_paniolo`, `npc_koa`, `npc_mano`, `npc_pele`, `band_<fid>`, `band_mano_war`, `band_pele_pack`,
  `band_rescue`, `post_mano_toll`, `camp_<fid>`, `companion`.

**§G Cost:**
- Method: `performance.now()` around `w.step( 1/60 )` over 400 frames, as `creatures-ai.mjs` does.
- 16 humans (4 companions, 6 raiders fighting, 6 settlers) + 30 infected: total ≤ 3.0 ms median, p95 ≤ 5 ms, NPC part
  ≤ 1.5 ms.
- `lib.loadedIds().length ≤ 14` throughout.
- After dispose: no skinned meshes, and physics boxes back to the baseline.

### 14.3 `node test/npc-world.mjs` (real `world.json`, `terrain.bin.gz`, `buildNetwork`; < 15 s)

- **Homes:** all 41 placed on land on their listed island, within 600 m of their anchor. Building anchors land on the
  right building type. Spacing rules hold (3.2). There is no overlap with planned sites' `FOOT` + 20 m or with lots.
- **Determinism:** the same seed gives the same plan; another seed moves ≥ 30 % of camp spots (anchored compounds stay).
  The whole-world plan takes ≤ 150 ms.
- **Posts:** 32 posts cover all 23 roadblocks and 10 checkpoints with the 3.3 faction assignments. No event is left
  over, and no event belongs to two posts.
- **Territory:** built in ≤ 30 ms; each faction owns its anchors' cells; no ownership over the sea.
- **Routes:** a band from Waipahu to Waiʻanae follows road polylines on Oʻahu; no route crosses water.
- **Director:** 10,000 simulated ticks per cell class give spawn frequencies within ±15 % of 9.2, and type weights
  within ±3 pp.
- **Pacing:**
  - no hostile encounter while the intensity is above 6, or within 4–8 minutes after a fight;
  - on a new character, only drifters and 2-person Manō groups for the first 15 minutes;
  - the guaranteed Rescue comes 20–40 minutes in, in 100 % of 200 simulated starts;
  - a simulated hour of moving gives 5–9 encounters.
- **Resolve:** win probability rises monotonically with S; casualties ≤ group size; loot ≤ the loser's stock.
- **Strategy:** raids are issued only when weakness > 0.6, relation ≤ −50 and manpower ≥ 50 %.
- **Events:** rates within ±20 % over 1,000 simulated days.

### 14.4 `node test/npc-econ.mjs` (pure + item defs; < 10 s)

- **Calibration:** 1 person over 24 h = 1,100 ± 50 kcal and 1.25 ± 0.05 L to drink (+0.4 L cooking).
- **Hawaiʻi Kai worked example (7.4), 30 game days from the 20,000 kcal non-perishable starting stock, with 7 beds:**
  - food and water never hit 0, over 20 seeds;
  - production ≥ consumption from day 6;
  - the cook's daily raw kcal stays under its 9,000 cap;
  - morale ≥ 55 at the end.
- **Collapse:**
  - without the fisher (set to Rest), the first desertion comes on day 6–8;
  - without the tap and barrel, the first loss comes in 2–5 days;
  - with no food workers at all, starvation comes by day 4 after the stock runs out.
- **Catch-up:** 1 × 24 h vs 24 × 1 h within 3 %. A 6 h sleep jump steps exactly 6 hours once. A 30-day jump for every
  home and camp takes ≤ 15 ms in total.
- **Crops:** growth halts with no water or tending; beds die after 3 dry days; windward vs leeward rain ratio ≈ 3.
- **Spoilage:** raw_fish rots in the store without a cook or smokehouse; smoked_fish survives 600 h. Dish kcal comes from
  `data.dish` (a soup_pot feeds ≥ 300 kcal, never the def's 1 kcal).
- **Stock:** counters → stacks → counters is exact (kcal ±1 portion, litres, per-calibre rounds).
- **Value:** monotonic in quantity and condition; markups applied.
- **Threat:** deterrence lowers raid chance; the 2-day grace holds; P ≤ 0.35; horde chance scales with gunshots.

### 14.5 `node test/npc-places.mjs` (the sites stub-game pattern + `installFakeDom()`; < 20 s)

- **Build and dispose.** A home builds at ≤ 4 ms per step; disposing brings physics boxes back to the baseline.
- **Prompts** (through the real crosshair ray): store, armory, captive Free, toll Pay, board, Claim. The armory needs a
  crowbar, lockpick or the leader's key.
- **Loot.** Keys and taken records survive save → load. Crate stream-out deducts exactly what was taken.
- **Camps.** Founding rules and failure toasts. Works complete with materials and builder hours. Indoor residents are
  gated on `groundReady`.
- **Raids.** A physical raid spawns attackers 160–220 m out on their home's side, emits the alarm noise and bashes
  barricades first.
- **Re-garrison.** An emptied home re-garrisons only with ≥ 40 % manpower; otherwise it becomes a ruin.

### 14.6 Existing suites that stay green

Every Node suite in `test/*.mjs` that passes today, run before and after each package. These matter most, because
NPC asks touch their modules:
- `logic.mjs`, `items.mjs`, `weapons.mjs`;
- `creatures-ai.mjs` (145 / 145; the harness does not install NPCs) and `creatures.mjs`;
- `sites.mjs`, `placeables.mjs`, `combos.mjs`, `mood.mjs`;
- `buildings.mjs`, `buildings-runtime.mjs`;
- `roads.mjs`, `vehicles.mjs`;
- every `ext-*.mjs`.

### 14.7 In-game verification

- One browser at a time, through `test/lib/browser.mjs`, with checks batched per boot with `test/preview/session.mjs`.
- Survival mode for combat (creative makes `survival.hurt` a no-op).
- URL pattern: `http://127.0.0.1:<port>/?quick=1&mode=<creative|survival>&at=<x>,<z>&yaw=<deg>&hour=<h>`.

| Session | Where (x, z), hour, mode | Steps | Checks |
|---|---|---|---|
| A. Looks | `npc-lineup-shot.mjs` (`test/preview/npc-lineup.html`) | six factions + drifters × 3, day and night | Readable apart; armbands, head props, torches, merged guns; closed jaws; poses (hands up, kneel-work, pistol, captive) |
| B. Meet and recruit | Haleʻiwa (−7530, −14151), 10 h, creative | summon a seeker and a drifter; Talk; hold-F menu; meet a demand through the pack; walk 80 m through town; enter a house | Prompt and menu look; formation; single file indoors; subtitles; squad strip |
| C. Standoff and checkpoint | Koa checkpoint haleiwa-wahiawa (−7214, −13244), 14 h, survival | approach to 150 / 100 / 60 m; aim at a soldier for 3 s; lower | Warning barks, a warning shot that misses, engagement on aiming |
| D. Toll | Manō toll kapolei-nanakuli (−7776, −10814), 12 h, survival | approach; pay; pass; return unpaid on day 3 | "Pay or turn back."; passage; fire inside 30 m |
| E. Raid | Waipahu Yards (−6318, −11420), 02 h, survival | squad of 2; crouched approach (screens at 120 / 60 / 30 m); suppressed shot; alarm; firefight; Search a body; open the stores and the armory with a crowbar | Sentries not alerted before ~45 m crouched; alarm and reinforcements; real loot; draw calls and ms with 12 armed NPCs (HUD F3) |
| F. Camp | Hawaiʻi Kai (−2345, −9949), 16 h, creative | Make camp; place a tent, rain barrel and fish trap (`placeables.add`); assign jobs; sleep 8 h; dusk fire circle; Group panel; force a raid (`/npc raid`) | Store changes; routines; panel text; the bell; save, reload, store matches |
| G. Night pack | Pāhoa (33598, 15028), 22 h, survival | wait for a Ka Pele pack | Torches visible > 100 m; scream before the charge; the molotov is telegraphed; melee can be dodged; the infected ignore them |
| H. Performance | Honolulu (−4390, −10255), 12 h, `quality=low` and `high` | 16 humans + infected; compare with `?npcs=0` | Δ draw calls ≤ 60; Δ `game.update` ≤ 1.5 ms (measured CPU time; lavapipe fps is not a target); avatars ≤ 14; no template thrash |
| I. Scout | Waipahu Yards from 240 m, 11 h, creative | binoculars (`aimFov ≤ 0.5`) on the yard; then low quality, a firefight at 130 m | sentries and leader drawn and countable at 240 m; at 130 m on low every shooter is drawn |
| UI harness | `test/preview/ui.html` | `?screen=group`, `?hud=squad,npcprompt` | Layout at 1920×1080 and 1280×720 |

Every session checks that there are no console errors and closes the browser right after.

### 14.8 Balance targets

| Target | Value | Measured by |
|---|---|---|
| Hit % by tier and distance | within ±8 pp of 5.6; never > 85 % | npc-ai C1, telemetry |
| TTK, one average rifleman at 30 m | median ≥ 4.5 s | npc-ai C3 |
| Detection | 5.3 table ±10 %; nothing beyond 150 m | npc-logic, npc-ai §B |
| Shots from unseen shooters | 0 aimed; suppression hits ≤ 10 % of NPC damage | npc-ai B7, B9, telemetry |
| Aimed shooters on the player at once | ≤ 2 / 3 / 4 (easy / normal / hard) | npc-ai C12, telemetry |
| Accidental companion hits on the player | ≤ 1 per 10 minutes of combat | telemetry |
| Random encounters on the move | one per 7–11 real minutes; ≥ 40 % non-hostile | npc-world, telemetry |
| Companion lost (catch-up teleport) | ≤ 1 per km of town walking | telemetry |
| Balanced camp | survives 30 game days with no player input | npc-econ |
| Raids on a known, moderately rich camp | one per 4–8 game days | npc-econ, telemetry |
| CPU | 9.5 budgets | npc-ai §G, session H |
| Save size | < 150 KB typical | npc-logic |

### 14.9 Telemetry

`game.npcs.stats()` is shown in the F3 debug overlay next to `creatures.stats()`. It reports:
- live humans, bands, homes built, and NPC-only avatars;
- encounters per hour by faction;
- mean identify time and distance;
- NPC shots, hits and hit % by distance band, split into aimed and suppressive fire;
- the peak number of token holders on the player;
- damage from NPCs per hour;
- companion deaths;
- friendly-fire incidents;
- catch-up teleports per km;
- camp food and water balance;
- NPC ms per frame.

Balance passes in WP13 edit only `src/npc/constants/*.js`.

---

## 15. Decisions on the open questions (lead, under the brief's "full creative control")

1. **No sacred names on the villains.**
   - **The raider and toll gang:** shown as **Black Reef** (id stays `mano`). Manō, the shark, is an ʻaumakua for many
     families. No shark-god imagery; their mark is a black reef-fish stencil.
   - **The fire cult:** shown as **Ash Crew** (id stays `pele`). Their stronghold at Pāhoa is a walled lava-rock
     compound with a fire ring: no heiau, no Pele references, no religious ritual props. Their flavour is arsonists who
     smear ash, which the infected ignore.
   - Every display string, bark, map label and prop name uses the new names. The ids stay so the data does not churn.
   - The good and neutral factions keep their Hawaiian names (ʻOhana, Kiaʻi, Paniolo, Koa); those words are positive and
     everyday.
2. **Losses while you are away are capped and consumable only.** An abstract raid on a known camp can take at most
   **25 %** of its **food, water and materials** store. It never takes equipment, weapons, clothing or anything in a
   personal stash or a locked container. It can wound defenders (no offline deaths unless the camp has been undefended
   for more than 2 game days). On return, a short radio line tells you what happened ("Black Reef hit Lāʻie camp ·
   took food"). The raiders' home holds the stolen stock, so raiding back recovers it.
