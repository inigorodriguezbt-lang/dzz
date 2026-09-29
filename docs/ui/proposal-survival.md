# Deadtide UI proposal: hardcore survival angle

Scope: every screen in `src/ui/*`, `index.html` loader markup, and the loader strings in `src/main.js`.
Current state reviewed from screenshots `s5/01…08` and the code as of this pass.

## 0. What is wrong today (from the screenshots)

| # | Where | Problem |
|---|---|---|
| 1 | HUD, bottom-left | Six glass vital tiles and a teal stamina bar are always on, even at full health. They carry no information and use two rows of chrome. The flask icon for water reads as a potion. |
| 2 | HUD, top | The compass sits in a 560 px glass box. Under it, the readout `118° · 17:37 · Day 1 · Waikiki` is 10 px grey text that disappears against the sky (01, 05, 08). |
| 3 | HUD, top-right | A 170 px minimap with a location label under it that repeats the compass readout. The label cannot be read over foliage (06, 07). |
| 4 | HUD, bottom-right | The weapon card has a box, a 3D icon, the name, the calibre, a durability bar, `31 / 30` and `SEMI`. `31 / 30` reads as "31 of 30"; it actually means 31 rounds loaded and 30 in reserve. |
| 5 | HUD, top-left | The FPS chip is on by default. |
| 6 | Inventory (03) | The header is a keyboard-hint sentence. Orange tracked-caps headers clash with the aqua accent. Empty slots are dashed boxes with text labels. The WEAPONS row is clipped below the fold because the middle column cannot scroll. Placeholder text reads "Drop items here" and "Empty". |
| 7 | Map (04) | A title card with a how-to sentence. The tool buttons overlap map labels ("Islands" sits on top of "Waiʻanae Range"). The legend is always open. The scale reads `2.0 km (game)`. The coordinates chip is empty until the pointer moves. |
| 8 | Chat (02) | A "Welcome to Deadtide…" line on every spawn. |
| 9 | Loader, title, death | Kicker, tagline, eight tip sentences, credits on the title screen, a giant "DEAD", and a paragraph about your body. |
| 10 | Style overall | Glass gradients, inner highlights, blur, 10–16 px radii and three accent hues (aqua, sun, coral) all on one screen. |

## 1. Design principles

1. **Silent when fine.** A HUD element shows only while it is needed: a stat that crosses a threshold, a value that changes, an action that is available now. DayZ badges, Project Zomboid moodles and Reforger's fading weapon info all work this way.
2. **Numbers and glyphs, not words.** Values are numbers with units (`64`, `3.9 L`, `1.2 km`, `31 | 90`). States are glyphs with severity colour. A word appears only once, the first time a new glyph shows up.
3. **One flat surface, one accent.** There is one dark surface family with hairline strokes. There is no glass, no gradient and no inner glow. Aqua marks things you can interact with. Amber and red mark severity only.
4. **Legible on sun and at night.** HUD text and glyphs sit directly on the world with a tight dark halo, not inside boxes. A plate appears only behind multi-line text such as prompts, toasts and open chat.
5. **Dense but fixed (inventory).** Every cell sits on one 56 px grid. Slot positions never move. Condition, fill and bindings are encoded in the cell. Every move takes one click plus a modifier.

## 2. Tokens

All px values are at `--tw-u = 1px` (GUI scale 100%, about a 720p window). The existing formula stays: `--tw-u: calc(clamp(1px, 0.7px + 0.04vmin, 1.25px) * var(--gui))`. Every size in CSS is written `calc(N * var(--tw-u))`, and canvas drawing multiplies by `settings.guiScale`, so the `--gui` variable keeps scaling everything. New tokens use the `--dt-` prefix. The old `--tw-*` colour tokens are removed once each screen is migrated.

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `--dt-scrim` | `rgba(6, 9, 11, 0.72)` | Full-screen overlay behind inventory, options (in game), pause |
| `--dt-s1` | `rgba(17, 23, 27, 0.94)` (#11171B) | Panels, context menu, tooltip |
| `--dt-s2` | `#182026` | Cells, inputs, list rows, segmented track |
| `--dt-s3` | `#202A31` | Hover |
| `--dt-s4` | `#2A363E` | Selected or pressed, segmented "on" |
| `--dt-plate` | `rgba(10, 14, 17, 0.72)` | HUD plates (prompt, toasts, open chat), flat with no blur |
| `--dt-l1` | `rgba(255,255,255,0.07)` | Hairline dividers, cell stroke |
| `--dt-l2` | `rgba(255,255,255,0.12)` | Panel edge, input stroke, empty-slot dash |
| `--dt-l3` | `rgba(255,255,255,0.22)` | Hover stroke, keycap stroke |
| `--dt-i1` | `#F1F4F5` | Primary text and HUD ink |
| `--dt-i2` | `#AEB9BF` | Secondary values |
| `--dt-i3` | `#76838A` | Labels and meta (11 px or larger only) |
| `--dt-i4` | `#48545A` | Empty-slot glyphs, disabled |
| `--dt-acc` | `#3DD6C6` | Interactive accent: selection, focus, sliders, held item, markers |
| `--dt-acc-weak` | `rgba(61, 214, 198, 0.14)` | Accent fills (drop target, selected row) |
| `--dt-acc-ink` | `#04201D` | Text on an accent fill |
| `--dt-warn` | `#F4B740` | Low, damaged, amber state |
| `--dt-bad` | `#F0525A` | Critical, ruined, bleeding, kill hit marker |
| `--dt-good` | `#6FD08C` | Positive effects only (painkillers, energized) |
| `--dt-cold` | `#69B4FF` | Cold and hypothermia |
| `--dt-heat` | `#FF8A3D` | Overheating, badly damaged |
| `--dt-water` | `#4DA8FF` | Liquid fill bar |
| `--dt-fuel` | `#E0B24A` | Fuel fill bar |

**Condition ramp.** This replaces `condColor` and the UI owns it. Pristine and Worn get no mark. Damaged is `--dt-warn`, Badly damaged is `--dt-heat`, Ruined is `--dt-bad`. The cut-offs follow `condLabel`: above 0.85, 0.60, 0.35 and 0.10.

**Map vectors.** Freeway `#FFC861`, road `#F4EFE2`, track `#9A7650`, building `#4A4642`, runway `#46464C`, ocean base `#0E2433`. Marker colours: user marker `--dt-acc`, `/locate` result `--dt-warn`, death `--dt-bad`, known vehicle `#C9C2FF`.

**Rarity.** Rarity is no longer shown anywhere: no border tint and no tooltip line. It stays as loot-table data only.

**Contrast.** `i1` on `s1` is about 16:1, `i2` about 9:1 and `i3` about 4.6:1, so `i3` is never used below 11 px. Severity is never carried by colour alone; it also changes arrow count, pulse or fill.

### 2.2 Type

Inter is used everywhere with `font-feature-settings: 'tnum' 1, 'case' 1` on numbers. JetBrains Mono is used only for command lines, coordinates and seeds.

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `--dt-t-micro` | 10 / 12 | 600 | +0.02em | Hotbar index, cell quantity at small GUI |
| `--dt-t-cap` | 11 / 14 | 600 | +0.08em, uppercase | Section headers, fire mode, "PAUSED" |
| `--dt-t-meta` | 12 / 16 | 500 | 0 | Meta lines, secondary values, keycap text |
| `--dt-t-body` | 13 / 18 | 400 (500 interactive) | 0 | Rows, menus, chat, tooltip body |
| `--dt-t-emph` | 14 / 20 | 600 | -0.005em | Prompt verb, world name, tooltip title |
| `--dt-t-title` | 16 / 22 | 600 | -0.01em | Panel titles, location card, map place |
| `--dt-t-num` | 28 / 28 | 600 | -0.02em, tnum | Rounds in magazine, speed |
| `--dt-t-display` | 28 / 32 | 600 | -0.01em | "You died" |
| `--dt-t-mark` | clamp(40px, 5.2vw, 72px) / 1 | 700 | +0.28em | "DEADTIDE" wordmark (title and loader only), flat `i1` with no gradient text |
| `--dt-t-mono` | 12 / 16 | 400 | 0 | Chat commands, coordinates, seed |

### 2.3 Space, radius, stroke, elevation, motion

- **Spacing** is on a 4 px grid: `4, 8, 12, 16, 24, 32, 48`. The HUD edge inset is 24. Panel padding is 16. Section gap is 16.
- **Grid pitch.**
  - Inventory cell is 56, gap 4 (pitch 60).
  - Hotbar slot is 44, gap 4.
  - Row heights: context menu 28, options row 36, list row 40, world row 64.
- **Radii.** Bars 2. Cells, keycaps, tooltip and menu rows 4. Buttons, inputs, segmented control and context menu 6. Panels 8. Toggles and dots are full.
- **Strokes.**
  - Hairlines are 1 px (`l1`/`l2`).
  - Focus is 2 px `--dt-acc`, offset 2.
  - A selected cell has `inset 0 0 0 1.5px --dt-acc`.
  - A valid drop target has a 1 px `--dt-acc` stroke over an `acc-weak` fill.
  - An invalid target has a 1 px `--dt-bad` stroke.
  - An empty slot has a 1 px dashed `l2` stroke.
- **HUD halo.**
  - Text: `text-shadow: 0 0 2px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.5)`.
  - Glyphs: `filter: drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 1px 2px rgba(0,0,0,.45))`.
  - This is the rule that keeps white ink readable over sunny sand (07) and night streets.
- **Elevation.**
  - Floating layers (tooltip, context menu, drag ghost, split popover): `0 8px 24px rgba(0,0,0,.45), 0 0 0 1px var(--dt-l2)`.
  - Panels: `0 24px 64px rgba(0,0,0,.55)`.
  - Blur: the full-screen scrim only, `backdrop-filter: blur(6px)`. Nothing on the HUD, and panels are opaque instead of blurred.
- **Motion.**
  - Durations:
    - `--dt-fast` 80 ms: hover, press.
    - `--dt-base` 140 ms: menus, tooltip in, tabs.
    - `--dt-panel` 180 ms: opacity plus a 4 px translateY.
    - `--dt-hud-in` 160 ms.
    - `--dt-hud-out` 480 ms.
  - Easing: out `cubic-bezier(.2,.8,.2,1)`, in `cubic-bezier(.4,0,1,1)`.
  - Holds:
    - Weapon name 2.5 s, hotbar 2.5 s, location card 4 s.
    - Toast 3.5 s, or 6 s for `bad`.
    - Pickup 2.5 s, first-time condition label 4 s, contextual key hint 5 s.
  - The critical pulse runs at 1 Hz (opacity 1 to 0.45). A cancelled action ring flashes `--dt-bad` for 200 ms.
  - Under `prefers-reduced-motion`: no translate, and the pulse becomes a steady 1 px outline.

### 2.4 Keycaps

A keycap is a pill 18 px tall with a minimum width of 18 and 5 px side padding. It uses `t-meta` 600, a 1 px `l3` stroke, a `rgba(255,255,255,.06)` fill, radius 4, and no bevel. Labels come from `app.input.label( action )`.

A keycap is always followed by a 1–2 word verb, for example `F Take`, `R Reload`, `K Bandage`, `Tab Close`. Mouse actions use short text in `i3`: `Click`, `⇧ Click`, `Dbl-click`.

## 3. Iconography

- **Grid:** 24 × 24 viewBox with a 2 px live-area margin.
- **Style:** 1.75 px stroke (it renders at about 1.3 px at 18 px display), round caps and joins, `fill: none`, `stroke: currentColor`. Only the badge variants below are filled.
- **Sizes:** HUD glyphs render at 18 px, slot glyphs at 26 px in `i4`, tool buttons at 16 px.
- **Home:** all paths live in `dom.js` `ICON` and replace the current set.
- **Item icons** stay the 3D thumbnails from `render/Icons.js`. The category glyph fallback in `itemIcons.js` moves to this style (1.5 stroke, colour `#AEB9BF`).
- **Tuning:** the paths below are the spec. Tune them by eye at 18 and 24 px, but keep the silhouettes.

### 3.1 Status: vitals (always the same glyph, colour by state)

| id | Meaning | Path |
|---|---|---|
| `health` | Health (heart) | `M12 20s-7-4.3-7-9.6A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7 2.8C19 15.7 12 20 12 20z` |
| `blood` | Blood (drop) | `M12 3.5s5.8 6.2 5.8 10.4a5.8 5.8 0 0 1-11.6 0C6.2 9.7 12 3.5 12 3.5z` |
| `water` | Water (glass with wave; replaces the flask) | `M6.5 4h11l-1.4 15.1a1 1 0 0 1-1 .9H8.9a1 1 0 0 1-1-.9zM7.2 10c1.6-.9 3.2-.9 4.8 0s3.2.9 4.8 0` |
| `food` | Food (fork and knife) | `M7 3v6.5a2 2 0 0 0 4 0V3M9 11.5V21M17 21V3c-2 1.4-3 3.8-3 7v3h3` |
| `temp` | Body temperature | `M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0zM12 10v6.5` |
| `energy` | Energy / sleep (moon) | `M19.5 14.2A7.5 7.5 0 0 1 9.8 4.5a7.5 7.5 0 1 0 9.7 9.7z` |
| `breath` | Breath under water | `<circle cx="8" cy="15" r="3"/><circle cx="15" cy="9" r="3.5"/><circle cx="17" cy="18" r="1.8"/>` |
| `stamina` | Stamina (only in the Status screen) | `M13 3 5.5 13H11l-1 8 7.5-10H12z` |

### 3.2 Status: conditions (badges, only while active)

| id | Survival `conditions()` id | Path |
|---|---|---|
| `bleed` | `bleed` (filled drop and a count) | the `blood` path with `fill: currentColor`, plus the count as `t-micro` text bottom-right |
| `frac` | `frac` (bone) | `M8.3 8.3l7.4 7.4` + circles r 1.7 at (6.6,7.9) (7.9,6.6) (16.1,17.4) (17.4,16.1) |
| `splint` | `frac` with splint | the bone plus `M5 19 19 5` in `i2` |
| `inf` | `inf` (infection) | `<circle cx="12" cy="12" r="4.2"/>` + `M12 3.5v3.3M12 17.2v3.3M3.5 12h3.3M17.2 12h3.3M6 6l2.3 2.3M15.7 15.7 18 18M6 18l2.3-2.3M15.7 8.3 18 6` |
| `sick` | `sick` (nausea face) | `<circle cx="12" cy="12" r="8.5"/>` + `M9 10h.01M15 10h.01M8.5 15.2c1-.8 1.8-.8 2.6 0s1.8.8 2.6 0 1.8-.8 2.6 0` |
| `wet` | `wet` (two drops) | `M8 4.5s3.2 3.5 3.2 5.8a3.2 3.2 0 0 1-6.4 0C4.8 8 8 4.5 8 4.5zM16 10.5s3.2 3.5 3.2 5.8a3.2 3.2 0 0 1-6.4 0c0-2.3 3.2-5.8 3.2-5.8z` |
| `cold` | `cold` (snowflake) | `M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.8 4.8 12 7l2.2-2.2M9.8 19.2 12 17l2.2 2.2` |
| `hot` | `hot` (sun) | `<circle cx="12" cy="12" r="3.8"/>` + `M12 2.8V5M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6` |
| `blood-low` | `blood` | the `blood` outline with an inner fill rect clipped to the blood fraction |
| `drunk` | `drunk` (glass) | `M8 3h8v4.5a4 4 0 0 1-8 0zM12 11.5V20M8.5 20.5h7` |
| `caf` | `caf` (cup) | `M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.2a2.3 2.3 0 0 1 0 4.6H16M9 3.5V6M12 3.5V6` |
| `pk` | `pk` (capsule) | `<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/>` + `M9.5 9.5l5 5` |
| `tired` | `tired` | the `energy` moon in `--dt-warn` |
| `heavy` | `heavy` (kettlebell) | `M9 7.5a3 3 0 1 1 6 0M5.5 9.5h13l-1.6 10.5H7.1z` |

### 3.3 Stance (shown only when not standing)

| id | Path |
|---|---|
| `crouch` | `<circle cx="12" cy="6.5" r="1.8"/>` + `M12 9l-1 5 4 1.5V20M11 14l-3.5 6M8.5 12l3-2 3 1.5` |
| `prone` | `<circle cx="4.5" cy="13.5" r="1.8"/>` + `M7 14.5h11l3.5 1.2M11 14.5l-1.5 2.5M17.5 14.5l-2 2.5` |

### 3.4 Equipment slots (empty-slot glyph, 26 px, `--dt-i4`)

| Slot (`EQUIP_SLOTS` / `WEAPON_SLOTS`) | Path |
|---|---|
| `head` (cap) | `M4.5 14.5a7.5 7.5 0 0 1 15 0zM3 14.5h18.5` |
| `eyes` (glasses) | `<circle cx="7" cy="13" r="3.2"/><circle cx="17" cy="13" r="3.2"/>` + `M10.2 12.5c1.2-.8 2.4-.8 3.6 0M3.8 12.5 2.5 9.5M20.2 12.5l1.3-3` |
| `face` (mask) | `M4 8c2.6 1 5.3 1.5 8 1.5s5.4-.5 8-1.5v4.5a8 8 0 0 1-16 0zM8.5 13.5h7` |
| `torso` (shirt) | `M8.5 4 3 7l2 4.2 2.3-1.1V20h9.4V10.1l2.3 1.1L21 7l-5.5-3c-.6 1.6-1.9 2.5-3.5 2.5S9.1 5.6 8.5 4z` |
| `vest` | `M8 3.5h2.5L12 6l1.5-2.5H16v3.5l3 3V20h-5.5v-5h-3v5H5V10l3-3z` |
| `back` (backpack) | `M7 8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v12H7zM9.5 5V3.5h5V5M7 12.5h10M10 15.5h4` |
| `hands` (glove) | `M7.5 20.5v-6L5 10.8a1.3 1.3 0 0 1 2.1-1.5L9 11.6V5a1.3 1.3 0 0 1 2.6 0v5.5M11.6 10V4a1.3 1.3 0 0 1 2.6 0v6M14.2 10.3V5.5a1.3 1.3 0 0 1 2.6 0v5M16.8 11V8.5a1.3 1.3 0 0 1 2.6 0v5.8c0 3.4-2.5 6.2-5.6 6.2H7.5` |
| `legs` (trousers) | `M6 3.5h12l1 17h-5l-2-10.5-2 10.5H5z` |
| `feet` (boot) | `M7.5 3.5h5v8l5.8 2.5a3 3 0 0 1 1.7 2.7V19H4.5v-4.3a3 3 0 0 1 1-2.2l2-1.8zM4.5 21h15.5` |
| `belt` | `M2.5 10h19v4h-19zM9.5 8.5h5v7h-5zM12 12h2.5` |
| `primary` (rifle, drawn in the wide cell) | `M2 12.5l2-2h11l1-1h6v2h-6l-1 1H8.5L7 16h-2.5l1-3.5zM11 12.5l.8 3h2l-.3-3` |
| `secondary` (shotgun) | `M2 12l2-1.8h16.5v2.2H10l-2.2 4.1H5.3l1-3.7zM11.5 12.4h5V14h-5z` |
| `sidearm` (pistol) | `M3 7.5h15.5v3.3H10.2l-.9 1 1 6.2H6.4L5.2 12.6 3 11.3zM10.2 10.8v2h2.6` |
| `melee` (machete) | `M4 20l2.5-2.5M5.8 21.2 3 18.4M6.5 17.5 17 7c1.6-1.6 3.8-2.5 3.8-2.5s-.6 2.4-2.3 4L9 18.9z` |

### 3.5 Actions and chrome (16 px)

`close` `M6 6l12 12M18 6 6 18` · `chevron` `M6 9l6 6 6-6` · `sort` `M4 6h12M4 12h8M4 18h4M18 8v12M15 17l3 3 3-3` · `search` `<circle cx="11" cy="11" r="6.5"/>` `M16 16l4.5 4.5` · `plus` `M12 5v14M5 12h14` · `minus` `M5 12h14` · `locate` `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/>` `M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22` · `fit` `M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5` · `layers` `M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5` · `marker` `M12 2.5 18 9l-6 12.5L6 9z` · `mag` `M9 3h6l-1 18H8z` · `fuel` `M4 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14 5v15.5M3 20.5h12M4 10h10M14 8.5h2.5l2 2v6.3a1.3 1.3 0 0 1-2.6 0V14H14` · `wrench` (vehicle condition) is the existing `craft` path · `kebab` has three filled r 1.2 dots at y 5/12/19 · `import` `M12 3v12M7.5 10.5 12 15l4.5-4.5M4 15v5h16v-5` · `export` `M12 15V3M7.5 7.5 12 3l4.5 4.5M4 15v5h16v-5` · `reset` `M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5` · `flame` (crafting station) `M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3C8 9 6 11.5 6 15a6 6 0 0 0 6 6z`

**Context menus have no icons.** An icon on every action is the clutter the Tarkov redesign write-ups call out.

## 4. HUD

### 4.1 Layout and visibility

The layout is shown at 1280 × 720, GUI 100%. Nothing in the HUD has a box except the prompt, toasts and open chat, which sit on `--dt-plate`.

| Element | Anchor | Size | Visible when | Data |
|---|---|---|---|---|
| Crosshair | Centre | 3 px dot with a 1 px black ring; `lines`: 4 × (1.5 × 6 px) at `--gap` | Not aiming (`hands.aiming`), not in a vehicle, no screen open; `crosshair` setting | `hands.crosshairSpread()`, `camera.fov` |
| Hit marker | Centre | 18 px X, 2 px arms | 180 ms, or 350 ms in `--dt-bad` on a kill | `hitmarker` event |
| Compass | Top centre, y 16 | 440 × 28, no box, edge-fade mask 12% | `compass` setting and the realistic-map rule | `p.yaw`, or `vehicles.hud().heading` |
| Heading | Under the needle, y 44 | `t-meta` 600 tnum | With the compass | `118` (no degree sign) |
| Location card | Top centre, y 60 | `t-title` place and `t-meta` island in `i2` | On spawn, and when `locationName` has been stable at a new value for 3 s; holds 4 s | `ui.locationName()` |
| Minimap | Top right, inset 24 | 152 px circle | `minimap` setting and the map rule | `MapView.draw` |
| Toasts | Top left, x 24, y 24 (y 40 when FPS is on) | Up to 4 rows, max width 360 | On `toast` | `toast` event |
| Pickups | Right, x 24, y 38% | Up to 5 rows, right-aligned | On `item:pick` | stack |
| Vitals and conditions | Bottom left, inset 24 | 24 px chip row | See 4.2 | `game.survival` |
| Stamina | Bottom centre, bottom 24 | 180 × 3 bar | `stamina < 99` or `maxStamina() < 100`; fades 1 s after full | `S.stamina`, `S.maxStamina()` |
| Hotbar | Bottom centre, bottom 36 | 9 × 44 px | 2.5 s after a slot key, a scroll or an inventory change; always while the inventory is open | `inventory.hotbar`, `inventory.hands` |
| Weapon readout | Bottom right, inset 24 | 28 px number | While a firearm or stack is held; 70% opacity when idle, 100% for 2 s after fire, reload or mode change | `heldStack()`, `hands.ammoInfo()` |
| Vehicle readout | Bottom right, inset 24 (replaces the weapon) | 28 px speed | `vehicles.hud()` is not null | `vehicles.hud()` |
| Interaction prompt | Centre, x +24, y -10 (right of the crosshair) | Up to 2 action rows and 1 meta row | `interact.target` and not busy | `interact.target` |
| Action ring | Centre | 44 px ring, 2 px stroke | `actions.busy` or a hold in progress | `actions.progress` |
| Damage direction | Centre, radius 120 | 36° arc, 3 px, `--dt-bad` 80% | 900 ms after a hit | `S.lastHitDir` |
| Low-health edge | Full screen | Radial vignette, `rgba(120,0,0,.45)` at the edges | Health below 50% (strength scales with deficit); bleeding pulses it at 0.5 Hz | `S.health`, `S.bleeding` |
| Key hint | Bottom centre, bottom 96 | Keycap plus a verb, 1 row | Contextual, 5 s (see 4.9) | local |
| FPS | Top left 8, 8 | `t-micro` tnum with halo, no chip | `showFps` | `app.fps` |
| Debug | Top left, under the FPS | `t-mono` 11, on `--dt-plate` | F3 | unchanged |
| Lock hint | Centre, y 58% | Plate, `Click to resume` | Pointer not locked in game | unchanged |

### 4.2 Idle (everything nominal)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                  ˈ  ˈ NW ˈ  ˈ 330 ˈ  ˈ  N  ˈ  ˈ 15 ˈ  ˈ NE ˈ           ╭──────────╮ │
│                                    118                                 │    N     │ │
│                                                                        │    ▲     │ │
│                                                                        ╰──────────╯ │
│                                                                                      │
│                                         ·                                            │
│                                                                                      │
│                                                                                      │
│                                                                                      │
│                                                                              31 │ 90 │
│                                                                                 SEMI │
└──────────────────────────────────────────────────────────────────────────────────────┘
  nothing bottom-left: every vital is above its threshold, so none are drawn
```

- **Compass.** No background. Minor ticks every 5° are 1 × 5 px in `i1` at 45%. Major ticks every 15° are 1 × 9 px in `i1`. Degree labels show every 30° in `t-micro` `i2`. Cardinal letters are `t-meta` 600 `i1`; N is `--dt-acc` (the old sun colour goes). The needle is a 1 × 6 px `i1` tick at the top centre.
  - **Markers** are 7 px filled diamonds in their marker colour.
  - The nearest marker within ±25° of the heading gets its distance in `t-micro` under it (`1.2 km`).
  - Time and day leave the compass for the inventory header, map and pause.
- **Minimap.**
  - A 152 px circle with no glass: a 1 px `l2` ring inside a 2 px `rgba(0,0,0,.45)` outer ring, for contrast on sky.
  - The map rotates and the player arrow is fixed.
  - An N letter in `--dt-acc` rides the rim.
  - Markers outside the radius clamp to the rim as 6 px diamonds.
  - The canvas is 2 × DPR × GUI. There is no label under it (the location card replaces it).
  - Zoom is 1.1 on foot and 0.55 above 12 m/s (existing logic).
- **Weapon readout.**
  - The number in the gun is `t-num`. A 1 × 18 px `l3` divider separates it from the reserve.
  - The reserve is `t-emph` `i2`, with a 12 px `mag` glyph before it only when the gun is magazine-fed.
  - The fire mode sits under it in `t-cap` `i3`.
  - Low ammo (25% of capacity or less) turns the number `--dt-warn`; 0 turns it `--dt-bad` and adds `R Reload` to its left.
  - The weapon name appears above in `t-meta` `i2` for 2.5 s after equipping.
  - Condition appears only when Damaged or worse, as a 6 px dot in the ramp colour left of the number.
  - For a non-firearm stack (flare, bandages ×3) only the count shows, in `t-emph`.

### 4.3 Damaged

```
│                                                                                      │
│  ● Bleeding                                  ← label shows for 4 s on first appearance│
│  ●2  ⌇  ♥ 64 ▾▾   ● 3.9 L ▾   🌡 35.4° ▾                         K Bandage             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░   ← stamina (centred), hatched = max lost │
└──────────────────────────────────────────────────────────────────────────────────────┘
   badges (left)  │  vitals below threshold (right), same row; 12 px gap and a 1 × 16 px l2 divider
```

- **Order.** This follows the DayZ split: condition badges on the left, then a hairline divider, then vitals, with killers first. The vital order is health, blood, water, food, temperature, energy, breath.
- **Vital chip.** An 18 px glyph, then the value in `t-meta` 600 tnum, then 0–3 trend chevrons (`▾`/`▴`, 6 px each).
  - Values: health `64`, blood `3.9 L`, water and food `%`, temperature `35.4°`, energy `%`, breath as a fill bar in the glyph.
  - Colour: `i1` above the low threshold (seen only while changing), `--dt-warn` below low, `--dt-bad` below critical. Critical also pulses.
  - Temperature uses `--dt-cold` or `--dt-heat` instead of amber.
  - Thresholds stay as in `HUD.update()` (health 0.5/0.25, blood 0.6/0.35, food and water 0.3/0.1, energy 0.25/0.1, temperature 0.55/0.3).
- **Chevron tiers.** Chevron count comes from the smoothed `trend` already computed, on normalised units per second:
  - Down: 1 chevron above 0.004, 2 above 0.02, 3 above 0.08.
  - Up: 1 above 0.0015, 2 above 0.01, 3 above 0.05.
  - This is the DayZ `Math.Clamp(tendency, 1, 3)` pattern.
- **Auto rule.** A vital is drawn when:
  - it is below its low threshold, or
  - it has changed by more than 2% in the last 3 s (eating shows `♥`/`🍴 +` feedback, then fades), or
  - the Status screen is open.
  - "Always" mode (option `HUD vitals: Auto | Always`) draws all six at `i2` in full health.
- **Badges.** An 18 px glyph in the severity colour of `S.conditions()` kind (`bad` red, `warn` amber, `good` green).
  - `bleed` shows its count (`●2`).
  - A new badge id shows its `label` beside it in `t-meta` for 4 s, then collapses to the glyph.
  - When bleeding and a bandage is carried, `K Bandage` (the `quickHeal` binding) shows at the right end of the row. When `game.hands` reports a jam, `R Clear` shows by the ammo number.
- **Stance.** The `crouch` or `prone` glyph sits at the far left of the row in `i2` while `p.stance !== 'stand'`.
- **Stamina.**
  - The bar is centred at the bottom, 180 × 3, `i1` at 80%, turning `--dt-warn` below 20.
  - The part lost to `maxStamina()` shows as a `l2` hatched end segment, the way weight and hunger cut stamina.
  - It hides 1 s after reaching full.

### 4.4 Aiming

- The crosshair hides, as today.
- The weapon readout drops to 50% opacity and the hotbar, toasts and pickups are suppressed. Toasts queue and play when aim ends; `bad` ones still show.
- A magnification readout `4.0×` in `t-meta` `i2` sits 40 px right of centre, only when `1 / hands.viewFov()` is 1.5 or more (optics).
- Hit markers still show.

### 4.5 In vehicle

```
│                                                                               D  2   │
│                                                                           64 km/h    │
│                                                                ⛽ ━━━━━━━░░  🔧 ━━━━━━━━ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Speed.** `t-num` tnum with the unit in `t-meta` `i3` (`km/h`, `kn` for boats). The `units` setting switches to mph or ft.
- **Gear.** `v.gear` in `t-emph` above the speed, right-aligned (`R`, `N`, `1`…).
- **Aircraft.** An `ALT 320 m` row replaces the gear row when `v.altitude != null`.
- **Fuel and condition.** Two 64 × 2 px bars, each with a 12 px glyph (`fuel`, `wrench`), drawn in `i2`. A bar turns `--dt-bad` below 15% fuel or 30% condition. No words.
- **Heading.** Drives the compass (existing).
- **Hidden.** The crosshair and weapon readout hide while in a vehicle. The minimap zooms out with speed (existing).

### 4.6 Interaction prompt

```
                         ·  ┌────────────────────────────────┐
                            │ [F] Take   Canned beans ×2      │  ← t-emph verb + t-body object
                            │ [F] Hold   Open                 │  ← hold: keycap has a progress ring
                            │ 0.4 kg                          │  ← t-meta i3, numbers only (t.sub)
                            └────────────────────────────────┘
```

- **Position.** 24 px right of the crosshair, vertically centred on it, so it never covers the target or the action ring. The plate is `--dt-plate`, radius 4, padding 6/10.
- **Verb and object.** The module label (`t.label`) is split on its first word: the verb goes in `t-emph`, the object in `t-body` `i2`. For example `Take Canned beans ×2`, `Search Trunk`, `Open Door`.
- **Hold actions.** The keycap gets a 1.5 px `--dt-acc` stroke ring that fills clockwise with `interact.holdT / t.hold`. The word "hold" is removed. There is no centre ring for holds; the centre ring is only for timed actions.
- **Sub line.** `t.sub` shows only if it is numeric or 1–3 words. Longer module subs are trimmed at the source (see 13).
- **Blocked action.** If a module passes a blocked reason, the object text turns `--dt-warn`.

### 4.7 Timed action

```
                                       ╭───╮
                                      │  ·  │     ← 44 px ring, 2 px --dt-acc arc on l2 track
                                       ╰───╯
                                   Bandaging 3.2      ← t-meta 600; the number is seconds left, tnum
```

- **Label.** `actions.current.label` plus the remaining time, computed as `(1 - progress) × time` if the module exposes the time, otherwise the label alone.
- **Cancel.** The `…  (move to cancel)` text is cut. A cancel flashes the ring `--dt-bad` for 200 ms.

### 4.8 Toasts and pickups

```
 ● No room                           ← top-left, --dt-plate row, 6 px severity dot, t-body
 ● Broken leg                        ← warn / bad dots; info has no dot
 ● Saved ×2                          ← duplicates within 4 s merge with a ×N counter

                                                               [ic] Canned beans ×2   ← pickups, right side
                                                               [ic] 5.56 round ×30
```

- **Toasts.**
  - One line, up to 360 px, truncated with an ellipsis only if a module sends a long string.
  - Maximum 4; the oldest leaves first.
  - Lifetime is 3.5 s, or 6 s for `bad`. Icon toasts (`t.icon`) put a 20 px item icon in place of the dot.
- **Pickups.**
  - No plate. Each row is a 24 px icon, then the name in `t-body` with halo, then `×N` in `i2` tnum.
  - The same item id within 3 s merges into one row with a running total.
  - Rows fade after 2.5 s.

### 4.9 Contextual key hints (replace the `TIPS` sentences)

Each hint is one row with a keycap and a verb. It shows once per life, when relevant. It is controlled by the existing `tutorial` setting, relabelled `Key hints`, and hidden in creative except for `Fly`.

| Trigger | Hint |
|---|---|
| First stack enters the inventory | `Tab Inventory` |
| Carrying `map_hawaii` (or 120 s in, when the realistic map is off) | `M Map` |
| First bleed with a bandage carried | `K Bandage` (drawn in the vitals row instead, 4.3) |
| First empty magazine | `R Reload` (drawn in the weapon readout, 4.2) |
| Creative spawn | `Space ×2 Fly` |
| First time chat is opened | nothing; the input itself shows `/` mode |

### 4.10 Location card

```
                                    Waikīkī
                                     Oʻahu
```

It uses `t-title` and `t-meta` `i2` with halo and no plate, centred under the compass heading. It fades in over 160 ms, holds 4 s and fades out over 480 ms. It replaces `announceSpawn()` toasts and the minimap label.

## 5. Inventory

### 5.1 Layout

Full screen: `--dt-scrim` with a 6 px blur, and three columns centred. The HUD hotbar stays visible under the panel for binding. The panel spans y 24 to the bottom minus 88.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Day 3 · 14:20                                        ▕▔▔▔▔▔▔▔▔▔│▔▔▔▔│▔▔▏ 11.2 kg     Tab  ✕     │ 40 px strip
├────────────────────────────────┬──────────────────────────────┬──────────────────────────────────┤
│ Nearby   Craft   Catalog        │ CHARACTER                    │ CARRIED               3.5 / 40  ⇅ │
│ ‾‾‾‾‾‾                          │                              │                                  │
│ ▾ Fridge          4/12 Take all │   ┌──┐ ┌──┐ ┌──┐             │ ▾ Pockets                  3.5/4 │
│ ━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░ │   │⌒ │ │oo│ │▭ │             │ ━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░ │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐           │   └──┘ └──┘ └──┘             │ ┌──┐┌──┐┌──┐┌──┐                  │
│ │ic││ic││ic││ic││  │           │   ┌──┐ ┌──┐ ┌──┐             │ │ic││ic││ic││  │                  │
│ └──┘└──┘└──┘└──┘└──┘           │   │ic│ │  │ │ic│             │ └──┘└──┘└──┘└──┘                  │
│ ▾ Ground                     2 │   └──┘ └──┘ └──┘             │ ▾ [ic] Cargo shorts          0/6 │
│ ┌──┐┌──┐┌╌╌┐┌╌╌┐┌╌╌┐           │   ┌──┐ ┌──┐ ┌──┐             │ ┌╌╌┐┌╌╌┐┌╌╌┐┌╌╌┐┌╌╌┐┌╌╌┐          │
│ │ic││ic│╎  ╎╎  ╎╎  ╎           │   │  │ │ic│ │ic│             │ ▾ [ic] Hiking backpack      0/30 │
│ └──┘└──┘└╌╌┘└╌╌┘└╌╌┘           │   └──┘ └──┘ └──┘             │ ┌╌╌┐┌╌╌┐┌╌╌┐┌╌╌┐┌╌╌┐           │
│                                │        ┌──┐                  │ ┌╌╌┐┌╌╌┐ …                       │
│                                │        │⊟ │                  │                                  │
│                                │        └──┘                  │                                  │
│                                │   ┌───────────┐┌───────────┐ │                                  │
│                                │   │ ═╦══  ic  ││  ═══      │ │                                  │
│                                │   └───────────┘└───────────┘ │                                  │
│                                │   ┌──┐ ┌──┐                   │                                  │
│                                │   │ic│ │ /│                   │                                  │
│                                │   └──┘ └──┘                   │                                  │
│                                │ 36.8° / 26°  Insul 30%  Bite 20%  Wet 0% │                        │
└────────────────────────────────┴──────────────────────────────┴──────────────────────────────────┘
                                   [1][2][3][4][5][6][7][8][9]
```

- **Top strip.**
  - Left: day and time in `t-meta` `i2`. This is their new home.
  - Right: the weight meter. It is 120 × 4 px on a 0–45 kg scale, with a tick at 18 kg (where stamina starts to drop) and one at 30 kg (overloaded). The fill is `i1` up to 18, `--dt-warn` to 30, then `--dt-bad`. The value is `11.2 kg` in tnum.
  - Then a `Tab` keycap and `✕`.
  - There is no "Inventory" title and no hint sentence.
- **Columns.** Left and right are 5 cells wide (328 px) and grow to 6–7 cells above 1600 px. The middle is fixed at 268 px. The columns are separated by `l1` hairlines. Left and right scroll independently.
- **The middle never scrolls.** 4 rows of equipment, 2 of weapons and the stats strip fit in 568 px at GUI 100%. At GUI above 120%, the stats strip moves under the right column header.
- **Left tabs.** Text tabs `Nearby | Craft | Catalog`. Catalog shows in creative only. The active tab gets a 2 px `--dt-acc` underline. When a world container is open, Nearby lists it first under its `label`.
- **Container block.**
  - Header row, 28 px:
    - A chevron (collapsible; state kept per container `key` or label for the session).
    - A 20 px owner icon.
    - The name in `t-body` 500.
    - Capacity `used/cap` in `t-meta` tnum `i2`. The cap turns `--dt-bad` when full.
    - Right: `Take all` as a ghost button (only on Nearby).
  - Under the header, a 2 px capacity bar: `--dt-acc` to 90%, then `--dt-warn`, then `--dt-bad` at 100%.
  - Then the cell grid.
  - An empty container shows one row of dashed empty cells with no text.
- **Ground** is always present with a dashed row as a drop zone. Its count is `2` with no word "items".
- **Carried header.** `CARRIED` in `t-cap` `i3` with the total `3.5 / 40` and a `sort` icon button (tooltip `Sort`).

### 5.2 Equipment and weapon slots

- **Equipment.** A 3 × 4 anatomical grid of 56 px cells in the order Head/Eyes/Face, Torso/Vest/Back, Hands/Legs/Feet, then Belt centred.
- **Weapons.** Primary and Secondary are wide cells, 116 × 56 (rifles read better wide). Sidearm and Melee are 56 × 56.
- **Empty slot.** A 1 px dashed `l2` stroke with the slot glyph (3.4) at 26 px in `i4`. There is no text label; the name shows on hover as a one-word tooltip (`Head`).
- **Filled slot.** A solid `l1` stroke, the item icon at 44 px, and the condition band if applicable. A clothing item with storage shows its capacity as `8` in `t-micro` top-right.
- **Stats strip** (bottom of the middle column, `t-meta`, one line): body temperature `36.8°` against outside `26°`, then `Insul 30%`, `Bite 20%`, `Wet 0%`. Health, blood and kills move out: health and blood are on the HUD and Status screen, kills are on Status.

### 5.3 Item cell

```
┌────────────┐   56 × 56, --dt-s2, 1 px l1, radius 4
│3          ●│   top-left: hotbar index (t-micro i2) · top-right: 6 px --dt-acc dot = in hands
│▌   [icon]  │   left edge: 2 px fill bar (liquid --dt-water, fuel --dt-fuel, battery --dt-acc), height = fraction
│▌           │   top-right, second: 8 px wet drop (--dt-cold), reserved; items carry no wetness yet
│         30 │   bottom-right: quantity / rounds (t-micro 600 tnum, halo)
│▀▀▀▀▀▀▀▀▀▀▀▀│   bottom: 2 px condition band, only for Damaged or worse, ramp colour
└────────────┘
```

- **Icon.** 44 px, with drop shadow `0 1px 2px rgba(0,0,0,.5)`. Spoiled food keeps the sepia filter on the icon, and the cell gets a 12% `--dt-warn` wash.
- **Quantity.** `ammoOf(stack)` for guns and magazines, otherwise `qty > 1`. Liquids show nothing here; the fill bar carries it.
- **States.**
  - Hover: `--dt-s3` fill, `l3` stroke, 80 ms.
  - Selected (context menu open, keyboard focus): 1.5 px inset `--dt-acc`.
  - Drag source: 35% opacity and a dashed `l2` stroke.
- **Removed.** Rarity borders, the `HELD` text tag, and the `tag` text for the hotbar (the index is now numeric only).

### 5.4 Drag and drop

- **Ghost.** The 56 px cell follows the cursor with the float shadow, 100% icon, and the quantity kept. The drag starts after 5 px (existing).
- **Hover feedback.** This is decided while hovering, not after the drop, using the same checks as `move()` and `_dropOnItem()`:
  - **Valid container or slot:** a 1 px `--dt-acc` stroke and an `acc-weak` fill on the whole block. The header capacity previews `3.5 → 4.1 / 40`, and the weight meter shows a ghost segment for the projected weight when taking from Ground or Nearby.
  - **Item-on-item action** (load rounds into a magazine, insert a magazine, attach, merge a stack): a 2 px `--dt-acc` stroke on the target cell and a one-word chip above it: `Load`, `Insert`, `Attach` or `Merge`.
  - **Invalid** (wrong slot, container into itself, no room): a 1 px `--dt-bad` stroke and a chip `Wrong slot`, `No room` or `Invalid`. No toast follows the drop. `_deny()` then only plays the error sound.
  - **Partial fit:** a `--dt-warn` stroke and a chip `4 of 6`.
- **Modifiers** (Tarkov and DayZ parity; these are pointer handlers in `InventoryUI` and need no new Input bindings):
  - `Shift+Click` or `Ctrl+Click`: quick move (existing `_quickMove`).
  - `Alt+Click`: default action (the same as `_default`).
  - Hover plus `Delete`: drop.
  - Hover plus `1–9`: bind to the hotbar (existing).
  - Hover plus `Space`: split (opens 5.7).
  - `Ctrl+F`: focus the filter (5.9).

### 5.5 Tooltip

```
┌──────────────────────────────────────┐   max 260 px, --dt-s1, radius 4, float shadow, 250 ms delay
│ M4A1 Carbine                  3.4 kg │   t-emph + t-meta i2 tnum
│ Worn · 5.56 · 30/30 · Semi/Auto      │   meta line: condition word (ramp colour if ≥ Damaged) · key facts
│ Dmg 34   RPM 800   Range 400 m       │   up to 2 rows of label (i3) / value (i1) pairs, 3 per row
│ Red dot · Suppressor                 │   attachments, if any
└──────────────────────────────────────┘
```

Per category, the meta line and pairs are:

| Category | Meta line | Pairs |
|---|---|---|
| Firearm | condition · calibre · loaded/capacity · modes | Dmg, RPM, Range |
| Magazine | calibre · rounds/capacity | none |
| Ammunition | calibre | none |
| Melee | condition | Dmg, Speed, Reach |
| Clothing and backpack | condition · slot | Storage, Insul, Bite, Ballistic, Waterproof (non-zero only) |
| Food | `Raw` / `Sealed` / `Spoiled` flags | kcal, Water, Fresh % |
| Drink | `Alcohol` flag | Water |
| Medical | `Splint` flag | Bleed, Heals, Infection %, Blood +ml |
| Tool | none | Battery %, `0.5 L water`, Fuel `1.2 L` |

- **Compare.** When the hovered clothing, backpack or weapon would replace an occupied slot, the pairs show deltas against the worn item: `Storage 8 (+2)` with the delta in `--dt-good` or `--dt-bad`.
- **Removed.** The category·rarity line, `desc` paragraphs, and the `Double-click: …` hint.
- **Books and notes** keep `desc`, because the text is the item. Photo and lore toasts move into the tooltip too (see 13).

### 5.6 Context menu

```
┌───────────────────────────┐   min 176, max 240, --dt-s1, radius 6, 4 px padding, float shadow
│ Eat                Dbl-click│   first row = default action, 600 weight
│ Open                        │   item-specific (Load, Unload, Eject mag, Insert mag, Attach to …, Detach …)
│───────────────────────────│
│ Hold                        │
│ Bind                   1–9  │   or "Unbind 3"
│ Split                Space  │   only qty > 1
│ Move to Fridge     ⇧ Click  │   only when a container is open; Ground otherwise
│───────────────────────────│
│ Drop                   Del  │
│ Delete                      │   creative only, --dt-bad text
└───────────────────────────┘
```

- **Rows.** 28 px, `t-body`, hover `--dt-acc-weak`. The shortcut is right-aligned in `t-meta` `i3`, or as a keycap for real keys.
- **Keyboard.** `↑↓` moves, `Enter` runs, `Esc` closes. The menu flips at the viewport edges using its measured size (today it estimates from `items.length * 32`).
- **Nearby and container items:** `Take` (`⇧ Click`), `Wear`, then item actions. Drop-style actions are filtered, as today.
- **Catalog:** `Give 1`, `Give 5`, `Give stack`.

### 5.7 Split popover

```
┌─────────────────────────────┐
│ Split                        │   t-cap i3
│ ━━━━━━━●──────────  [ 15 ]   │   slider + numeric input (tnum), arrows ±1, Shift+arrows ±10
│                   Cancel  OK │
└─────────────────────────────┘
```

It is anchored to the cell and has no item name in the title. `Enter` confirms and `Esc` cancels.

### 5.8 Crafting tab

```
┌ [⌕ Search           ]   [ All | Ready ] ────────────┐
│ MEDICAL                                             │   t-cap i3, from recipe.cat
│ [ic] Rag bandage          [ic]2/2            4s  [Craft] │
│ [ic] Improvised splint    [ic]2/2 [ic]0/2   8s  [Craft] │  ← missing chip in --dt-bad; button disabled
│ SURVIVAL                                            │
│ [ic] Fire kit ×1          [ic]4/4 [ic]1/1   6s  [Craft] │
│ [ic] Torch                [ic]1/1 [ic]2/2 ⛽0.1 L  5s [Craft]│
│ FOOD                                                │
│ [ic] Grilled fish         [ic]1/1  🔥Fire   20s [Craft] │
└─────────────────────────────────────────────────────┘
```

- **Row.** 44 px: a 36 px output icon, then the name plus `×qty` when qty > 1.
- **Requirement chips.**
  - Ingredient: 20 px icon plus `have/need`, tnum.
  - Tool: `Blade`, `Axe`, `Saw`, `Hammer`, `Pot`, `Opener`, mapped from the tool kind.
  - Station: `flame` glyph plus `Fire`.
  - Liquid: `0.1 L fuel`.
  - Met chips are `i1`; missing chips are `--dt-bad`.
- **Right side.** `r.time` in seconds, then `Craft` (primary when `canCraft`, disabled ghost otherwise).
- **Ordering.** Ready recipes first, then by category (existing sort). The `Ready` filter hides the rest.
- **Removed.** `recipe.desc`, "Crafting is not available.", "No recipes." Empty shows nothing. The reason string from `crafting.check()` is not shown in the list; the chips already say it.
- **Crafting.** Closing the inventory on craft stays, so the action ring is visible.

### 5.9 Filter and creative catalog

- **Carried filter.** `Ctrl+F` in the inventory opens a 28 px search field in the Carried header. Non-matching cells dim to 25%. There is no result text.
- **Catalog.**
  - A search field (placeholder `Search`), then a single-line, horizontally scrolling row of category chips (`All`, then `CATEGORY_LABEL` names), then the total count `412` in `t-meta` `i3` at the right, then the 56 px grid.
  - Clicking a cell gives 1, `Shift+Click` gives a stack, drag places it.
  - The catalog tooltip adds one footer row of keycaps: `Click +1` and `⇧ Click Stack`.
  - No match shows nothing.

### 5.10 Status screen (replaces the "Survival journal", `log` key)

```
┌───────────────────────────────────────────────────────────────┐
│ Status                                   Day 3 · 14:20     ✕  │
├───────────────────────────────┬───────────────────────────────┤
│ ♥ Health        64   ▾▾        │ ●2 Bleeding        Bandage    │
│ ● Blood        3.9 L ▾         │ ⌇  Broken leg      Splint     │
│ ◌ Water         31%  ▾         │ ✺  Infected        Antibiotics│
│ 🍴 Food          72%            │ ❄  Cold            Warm clothes│
│ 🌡 Body        35.4°  ▾         │                               │
│ ☾ Energy        55%            │                               │
│ ⚡ Stamina       80 / 92        │                               │
│    Outside       26°           │                               │
│    Wet           20%           │                               │
├───────────────────────────────┴───────────────────────────────┤
│ THIS LIFE   2d 4h survived · 14 kills · 12.4 km · 83 looted · life 3 │
└───────────────────────────────────────────────────────────────┘
```

- **Width** 620. The left column is vitals: glyph, `t-body` label, tnum value, chevrons. The right column is active conditions with a 1–2 word treatment in `i2`.
- **Treatment map:** bleed → `Bandage`, frac → `Splint`, inf → `Antibiotics`, sick → `Charcoal`, cold/hypo → `Warm clothes`, hot → `Shade, water`, blood → `Saline`, tired → `Sleep`, heavy → `Drop weight`.
- **This replaces the 10 advice paragraphs in `UI.journal()`.**

## 6. Map and minimap

### 6.1 Full map

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Waikīkī · Oʻahu                                                   14:20 · Day 3   ✕  │  40 px bar, --dt-plate
│                                                                                 ┌──┐ │
│                                                                                 │+ │ │
│                          (relief + roads + labels)                              │− │ │
│                                                                                 ├──┤ │
│               ◆ 1                                                               │◎ │ │  locate me
│                                                                                 │⤢ │ │  fit islands
│                                                                                 │≋ │ │  layers → legend popover
│                                                                                 └──┘ │
│                                                                                      │
│                                                 −3880, −9660 · 12 m · 1.2 km         │  cursor readout, only over land/sea
│                                                                     ├────────┤ 2 km  │  scale bar, no "(game)"
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar.**
  - Left: the current place (`locationName(p, true)` with `·` in place of the comma) in `t-title`.
  - Right: time and day in `t-meta` `i2`, then `✕`.
  - No sub line.
- **Tool rail.** Right side, 36 px square buttons stacked, `--dt-s1`, radius 6, 16 px glyphs, with 1-word tooltips `Zoom in`, `Zoom out`, `Centre`, `All islands`, `Legend`. This replaces the text buttons `+ − Me Islands Close`, which overlapped labels.
- **Legend.** A popover from `layers` with swatch rows `Freeway`, `Road`, `Track`, `Building`, `Marker`, `Body`, `Vehicle`. Closed by default.
- **Islands popover.** Long-press or right-click on `fit` opens a list: `Niʻihau`, `Kauaʻi`, `Oʻahu`, `Molokaʻi`, `Lānaʻi`, `Maui`, `Kahoʻolawe`, `Hawaiʻi`. Clicking one fits that island.
- **Map right-click menu.** This is the context menu style from 5.6:
  - `Add marker`
  - `Remove marker` (on a marker)
  - `Rename` (on a user marker; inline 1-line input)
  - `Teleport` (creative)
  - This replaces `Shift-click to teleport` and the hint sentence. Double-click still adds a marker, and `C` still centres.
- **Markers.** An 8 × 12 px diamond in the marker colour with a 1.5 px black stroke. The label is `t-meta` 600 with halo. User markers are numbered `1`, `2`… instead of `Marker 1`. A marker selected from the list pulses once.
- **Cursor readout.**
  - Content: `x, z · elevation m · distance`, with depth shown as `-40 m`. `(real)` is removed and the elevation stays ×6 as today.
  - Style: `t-mono` 11 on `--dt-plate`.
  - Hidden until the first pointer move, so there is no empty chip.
- **Grid.** 1 km lines at `rgba(255,255,255,.06)`, or 250 m when zoomed in (existing). Grid labels `A–Z / 1–n` are not added.
- **Player.** A white arrow with a 1.5 px black stroke (existing), plus a 60° view cone in `rgba(255,255,255,.12)`.
- **Tiles loading.** Missing tiles draw the ocean base colour only. There is no spinner.

### 6.2 Minimap

This is specified in 4.2. It is drawn by the same `MapView.draw` with `labels: false`. It adds known vehicles as 4 px `#C9C2FF` dots and the death marker in `--dt-bad`.

## 7. Chat and commands

```
│  Gave 1 × M4A1 Carbine                                   ← closed: text only with halo, fades after 8 s
│  /give m4a1                                              ← echo in t-mono i3
│                                                                                    │
│ ┌──────────────────────────────────────────────┐        ← open: --dt-plate behind log + input
│ │ /give  <item> [qty]                    Give items │   ← suggestions: t-mono + t-meta i3, 24 px rows
│ │ /gamemode <survival|creative>          Mode       │   ← selected row: --dt-acc-weak
│ ├──────────────────────────────────────────────┤
│ │ [/] give m4█                                  │   ← mode chip "/" (command) or none (chat)
│ └──────────────────────────────────────────────┘
```

- **Placement.** Bottom-left, bottom 96, width 480.
- **Closed log.** Each line is text only with halo. Lines fade after 8 s (existing 9 s) and come back when chat opens.
- **Open.** Up to 12 visible lines, scrollable.
- **Line colours.** `sys` is `i2` (was orange). `err` is `--dt-bad`. `ok` is `i1` with a 2 px `--dt-acc` left rule. `cmd` echo is `t-mono` `i3`.
- **Input.**
  - No placeholder text.
  - A 20 px chip `/` appears at the left while the value starts with `/`.
  - `Tab` completes and `↑↓` walks history and suggestions (existing).
  - `Esc` closes.
- **Suggestions.** Descriptions come from `commands.complete()`. Any longer than 3 words are noted for the Commands module.
- **Removed.** The welcome line in `Chat.attach()`.

## 8. Title screen

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                              (live vista, VISTAS in main.js)                         │
│                                                                                      │
│                                                                                      │
│   D E A D T I D E                                                                    │
│                                                                                      │
│   Continue      Honolulu run · Day 12                                                │
│   Worlds                                                                             │
│   Options                                                                            │
│   About                                                                              │
│                                                                              v0.1    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Scrim.** A left-to-right gradient `rgba(6,9,11,.78)` to transparent at 55%, plus a bottom 30% gradient.
- **Wordmark.** `t-mark`, flat `i1`, 32 px above the menu. No kicker, no gradient text, no drop-shadow glow.
- **Menu items.**
  - Text buttons, 40 px tall, `t-title` 500 `i2` with no box.
  - Hover or focus: `i1` and a 2 px × 18 px `--dt-acc` bar 12 px to the left, 80 ms. The padding animation is removed.
  - The secondary text on Continue is the world name and day in `t-meta` `i3`.
  - Arrow keys and `Enter` navigate.
- **Changes to the item list.** `Controls` is removed (it lives in Options > Controls). `Credits` becomes `About`. `Singleplayer` becomes `Worlds`.
- **Footer.** `v0.1` in `t-micro` `i3` at the bottom-right. The attribution footer moves to About.

**About.** A 560 px panel titled `About`. It is a two-column list of `Source` and `Licence` pairs, with no prose:

- Terrain: AWS Terrain Tiles (USGS 3DEP, SRTM, ETOPO1, GMRT)
- Textures: Poly Haven, CC0
- Sounds: Freesound, CC0 (via Tidewater)
- UI and look: after Tidewater, MIT
- Characters: Rocketbox, MIT
- Engine: three.js, MIT
- Fonts: Inter and JetBrains Mono, OFL
- Version `v0.1`

The link to Tidewater stays.

## 9. Worlds and new world

### 9.1 Worlds

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Worlds                                                         ⤓ Import  ✕ │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌────────┐ Honolulu run                                             ⋮       │  64 px rows
│ │ thumb  │ Survival · Normal · Day 12 · 3h 20m · Today 14:02                 │
│ └────────┘                                                                  │
│ ┌────────┐ Test                                   [Creative]        ⋮       │  selected: acc-weak + 1 px acc
│ │ thumb  │ Day 1 · 12m · Sep 28                                             │
│ └────────┘                                                                  │
│ ┌────────┐ Iron man                                   [Dead]        ⋮       │  hardcore dead: --dt-bad chip
│ │ thumb  │ Hardcore · Hard · Day 4 · 1h 02m · Sep 21                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ New world                                                          ▶ Play  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Panel.** 820 px. The thumbnail is 96 × 54 with radius 4.
- **Row text.** The meta line uses `t-meta` `i2`. Mode appears only when it is not Survival. The hardcore state is a chip (`Hardcore`, `Dead`).
- **Kebab menu** (5.6 style): `Rename`, `Duplicate`, `Export`, `Details`, then a separator, then `Delete`. This replaces the global Edit, Export and Delete footer buttons. Details opens 9.3.
- **Keyboard.** Double-click or `Enter` plays the selected world. `F2` renames inline. `Delete` asks for confirmation.
- **Empty state.** One word, `None`, centred in `i3`, with the `New world` button primary.
- **Confirm delete.** Title `Delete “Honolulu run”?`, no body text, buttons `Cancel` and `Delete` (danger).

### 9.2 New world

```
┌──────────────────────────────────────────────────────────┐
│ New world                                             ✕  │
├──────────────────────────────────────────────────────────┤
│ Name          [ New World                              ] │
│ Seed          [ Random                                 ] │
│ Mode          [ Survival | Creative ]                    │
│ Difficulty    [ Easy | Normal | Hard ]                   │
│ Hardcore      (○  )                            One life  │  ← only when on, t-meta --dt-bad
│ Day length    [ 24 | 48 | 96 | 144 ] min                 │
│ Start         [ Morning | Noon | Evening | Night ]       │
│ Spawn         [ Random ▾ ]                               │
├──────────────────────────────────────────────────────────┤
│                                          Cancel  Create  │
└──────────────────────────────────────────────────────────┘
```

- **Panel.** 560 px. Rows are 36 px, labels are `t-body` `i2`, and every hint line under a label is removed.
- **Spawn select.** A custom dropdown (5.6 style) with `Random`, `Oʻahu`, `Kauaʻi`, `Maui`, `Hawaiʻi`, `Molokaʻi`, `Lānaʻi`, `Niʻihau`.
- **Keyboard.** `Enter` creates.

### 9.3 World details (was "Edit world")

The details panel is 520 px:

- Name input.
- Seed in `t-mono` with a copy button.
- `Created` date.
- A 3-cell stat row: `Kills 124`, `Deaths 3`, `Distance 42.1 km`.
- Footer: `Duplicate`, `Export`, spacer, `Cancel`, `Save`.

## 10. Options

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Options                                                                    ✕  │
├───────────────┬───────────────────────────────────────────────────────────────┤
│ Graphics  ▍   │ QUALITY                                                        │
│ Interface     │ Preset            [ Low | Medium | High | Ultra | Custom ]     │
│ Audio         │ VIEW                                                           │
│ Controls      │ Render distance ● ━━━━━━━●──────────────────────   1.4 km   ↺  │  ← dot = changed, ↺ on hover
│ Keys          │ Field of view     ━━━━━━━━━●────────────────────     80°       │
│ Gameplay      │ Resolution        ━━━━━━━━━━━━●─────────────────    100%       │
│               │ DETAIL                                                         │
│               │ Shadows           [ Off | Medium | High | Ultra ]              │
│               │ Terrain           [ Low | Medium | High | Ultra ]              │
│               │ Vegetation        [ Low | Medium | High | Ultra ]              │
│               │ Grass             (  ●)                                        │
│               │ …                                                              │
├───────────────┴───────────────────────────────────────────────────────────────┤
│ Reset tab                                                               Done  │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Panel.** 820 × up to 80vh. A 160 px left rail holds the tabs as `t-body` 500 rows, 32 px tall; the active tab gets `--dt-s3` and a 2 px `--dt-acc` left bar. Content scrolls and the footer stays pinned. In game the panel opens over `--dt-scrim`; from the title it opens over the vista.
- **Row.** 36 px. The label is `t-body` `i1` on the left. The control is right-aligned in a 320 px column. The value is 56 px, right-aligned, `t-meta` tnum `i2`.
- **Changed dot.** A 4 px `--dt-acc` dot before the label when the value differs from `DEFAULTS`.
- **Row reset.** A `reset` glyph on row hover restores that key's default. This is new QoL.
- **Slider.** A 2 px `l2` track with an `--dt-acc` fill (`--p`). The thumb is a 12 px `i1` circle with a 1 px `rgba(0,0,0,.5)` stroke and grows to 14 px on drag. Arrow keys step, `Shift` steps ×10, and `Home`/`End` jump.
- **Segmented control.** 28 px tall, `--dt-s2` track, radius 6. Options are `t-meta` 500 `i2`. The selected option is `--dt-s4` with `i1` text and a 1 px `l3` stroke (no accent glow).
- **Toggle.** A 32 × 18 pill: off is `--dt-s4`, on is `--dt-acc`. The 14 px knob is `i1`, and `--dt-acc-ink` when on.
- **Section headers.** `t-cap` `i3` with 16 px above and 8 px below. They replace the orange ones.
- **Footer.** `Reset tab` (with confirm: title `Reset Graphics?`, no body) and `Done`. The global "Reset to defaults" and the subtitle "Saved automatically." are removed.

Tab contents. Every settings key keeps its current name. Keys the current UI does not expose are marked **new row**.

| Tab | Rows |
|---|---|
| Graphics | Preset `quality` (+ `Custom` shown when any detail key differs from `QUALITY_PRESETS[quality]`), Render distance `renderDistance` (0.4–4.0 km), Field of view `fov` (60–110°), Resolution `renderScale` (50–150%), Shadows, Terrain `terrainDetail`, Vegetation, Grass, Clouds, Water, Anti-aliasing (`Off | FXAA | MSAA`), Bloom, Night brightness |
| Interface | GUI scale `guiScale` (70–160%, applies on release so the panel doesn't jump under the cursor), HUD vitals `hudVitals` **new, UI-only** (`Auto | Always`), Crosshair (`Dot | Dynamic | None`), Compass, Minimap, Hit markers, Damage direction, Interaction hints `showInteractHints`, Key hints `tutorial`, FPS `showFps` |
| Audio | Master, Effects `sfxVolume`, Ambience, Music `musicVolume` **new row**, Interface `uiVolume`, Subtitles `subtitles` **new row** |
| Controls | Sensitivity, Invert Y, Toggle crouch, Toggle aim, Toggle sprint, Head bob `headBob` (moved from Display, since it is a comfort setting), then a collapsed **Reference** section: the read-only two-column list of every action and its keycaps (the single controls reference). |
| Keys | See below |
| Gameplay | Auto-pickup ammo `autoPickupAmmo`, Realistic map `realisticMap`, Units `units` **new row** (`Metric | Imperial`), Difficulty (read-only, current world) |

- **New UI-only keys** (`hudVitals`) are read as `settings.get('hudVitals') ?? 'auto'`, so `Settings.js` needs no change. The lead can add them to `DEFAULTS` later.
- **Keys tab.**
  - A search field at the top (placeholder `Search`) filters the rows by label.
  - Group headers use `t-cap`: Movement, Actions, Hotbar, Menus, Vehicle.
  - Each row has the label, a primary keycap button (96 × 28, `t-meta` 600) and a secondary one. `—` means unbound.
  - **Listening:** the button shows `Press key` with a 1 px `--dt-acc` stroke pulsing. For that moment only, a footer row shows `Esc Cancel` and `⌫ Clear` as keycaps. The long `title` tooltip is removed.
  - **Conflict:** a `--dt-bad` stroke on the cap, and the row shows `Also: Horn` in `t-meta` `--dt-bad` under the label. Vehicle and on-foot overlaps stay allowed (existing logic).
  - A reset glyph on each row, and `Reset keys` in the footer.

## 11. Pause

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│   PAUSED                                                                              │  t-cap i3
│   Honolulu run                                                                        │  t-title
│   Day 3 · 14:20                                                                        │  t-meta i2
│                                                                                      │
│   Resume                                      Esc                                    │
│   Options                                                                            │
│   Save                                                                               │
│   Creative mode                                                                      │  or "Survival mode"; hidden in hardcore
│   Quit to title                                                                      │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- The title-screen menu style over `--dt-scrim` from the left edge; the world stays visible on the right.
- Removed: the giant `PAUSED` wordmark, the `Controls` item and its wrong `F1` hint (F1 is Hide HUD), and the `Game mode` hint.
- `Save` confirms with a toast `Saved`.
- `Quit to title` saves first (as today).

## 12. Death

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                                   You died                                           │  t-display i1
│                                   Bled out                                           │  t-title --dt-bad (info.cause)
│                                                                                      │
│                            2d 4h          14                                          │  t-num tnum
│                          SURVIVED        KILLS                                        │  t-cap i3
│                                                                                      │
│                              [ Respawn ]   [ Quit ]                                   │  hardcore: [ Title ] only
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Background.** A flat `rgba(6,9,11,.82)` with a 3 s desaturate-to-grey fade of the world behind it (CSS `backdrop-filter: grayscale(1)` if affordable, otherwise the plain scrim).
- **Content.** Cause, time survived, kills and buttons (the text policy). Distance and lives move to Status.
- **Hardcore.** The subtitle becomes `World over` in `t-meta` `i3` and the only button is `Title`.
- **Removed.** The `You died` kicker plus `DEAD` wordmark (merged into one heading), the `Cause of death:` prefix, and the body paragraph (the death marker on the map says it).
- **Keyboard.** `Enter` equals `Respawn`.

## 13. Loader

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                         (key art, slow Ken Burns, unchanged)                         │
│                                                                                      │
│                                                                                      │
│   D E A D T I D E                                                                    │
│                                                                                      │
│   Building terrain                                                         64%       │  t-body i1 / t-meta tnum i2
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░                      │  2 px, 400 px, --dt-i1 fill
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Content.** Wordmark, then the status in 1–3 words, then the percentage, then a 2 px bar. The glint animation, sun-coloured glow, kicker, tagline and tips block are removed.
- **Error.** The status turns `--dt-bad` and the message wraps on a second line.
- **Markup constraint.** Keep `.loader-status`, `.loader-pct`, `.loader-fill` and `.loader-time` in the markup, because `main.js status()` queries all four. `.loader-time` is hidden with CSS (`display:none`), so no `main.js` logic changes.

## 14. Text to cut or shorten

The format is file → current string → new string. "Cut" means remove the element or string entirely.

### index.html

- `<title>Deadtide — Hawaiian Islands</title>` → `Deadtide`
- `.loader-kicker` "A Hawaiian Islands survival game" → cut
- `.loader-tagline` "Eight islands, one week after the outbreak. Scavenge the towns, arm yourself, and stay alive from Kauaʻi to the Big Island." → cut
- `.loader-tips` block: label "Tip" and all 8 `.loader-tip` sentences ("Look at loot and press F…", "Gunshots carry…", "Water first…", "Bleeding kills fast…", "Police stations…", "Boats and the tour helicopters…", "Press T for chat…", "The summits of Mauna Kea…") → cut
- `.loader-time` "0:00" → hidden (keep the node)

### src/main.js (status strings only)

- `'Entering the world'` → `'Entering world'`
- `'Populating the area'` → `'Spawning'`
- `'Failed to start: ' + e.message` → `'Failed: ' + e.message`

### src/ui/UI.js

- The `TIPS` array (5 sentences: "Move with …, sprint with …, crouch …", "Press … to check what you washed up with. Drag items onto your clothes to carry more.", "Find a town. Look at loot and press … to take it; cupboards, fridges and lockers can be searched.", "… opens the map. Double-click it to place a marker you'll see on the compass.", "… opens chat — type /help for commands (/give, /tp, /time, /locate, /summon…).") → cut, replaced by the key hints in 4.9
- `announceSpawn()`: `` `Creative mode — ${where}. Double-tap Space to fly.` `` and `` `You wake up on the shore. ${where}.` `` → cut (the location card and the `Space ×2 Fly` hint replace them)
- `'You need a map (realistic map is on in Options)'` → `'No map'`
- `journal()`: the 10 advice sentences ("You are bleeding. Use a bandage or rags (right-click → Bandage) — blood loss kills.", "Your leg is broken. A splint (sticks + rags) lets you walk while it heals.", "A bite wound is infected. Antibiotics …", "Food poisoning: drink plenty. …", "You are hungry. Houses, stores and fruit trees have food; …", "You are thirsty. Taps in some buildings still run; …", "You are cold. Get out of the wind …", "You are overheating. …", "You are exhausted. Coffee …", "You are holding up. Keep water and a bandage on you at all times.") → cut, replaced by the condition and treatment list in 5.10
- `journal()` labels:
  - `'Survival journal'` → `'Status'`
  - `'Infected killed'` → `'Kills'`
  - `'Distance travelled'` → `'Distance'`
  - `'Items looted'` → `'Looted'`
  - `'Total infected killed'` → `'All-time kills'`
  - Section `'Where'` and its location paragraph → cut
- `lockHint` `'Click to continue'` → `'Click to resume'`

### src/ui/HUD.js

- Compass readout `` `${deg}°  ·  ${hour}  ·  Day ${day}  ·  ${loc}` `` → heading number only
- Vital `title` attributes `'Health'`, `'Blood'`, `'Food'`, `'Water'`, `'Body temperature'`, `'Energy'`, `'Breath'` and `` `Body temperature … — outside … °C` `` → cut (they are not visible under pointer lock)
- Ring label `` `${label}…  (move to cancel)` `` → `` `${label} ${secondsLeft}` ``
- Prompt `<span class="dim">hold</span>` → cut (replaced by the hold ring on the keycap)
- Weapon card sub line: calibre `.toUpperCase()` and the `d?.cat` fallback (for example "tool") → cut. The mode `.toUpperCase()` → CSS small caps.
- Vehicle panel `'Fuel'`, `'Condition'`, `` `Gear ${gear}` `` → glyphs and the bare gear value; `` `ALT ${n} m` `` stays
- Minimap label (the long location) → cut
- Debug first line prefix `'Deadtide — '` → cut

### src/ui/InventoryUI.js

- `h2` `'Inventory'` → cut
- Hint `'Double-click: use / equip · Shift-click: move · Right-click: actions · 1–9: hotbar'` → cut
- Sub `` `${w} kg carried — overloaded` `` → weight meter `11.2 kg`
- `` `${used} / ${cap} space` `` → `` `${used} / ${cap}` ``
- Sort `title` `'Sort every container by type and name'` → `'Sort'`
- `'Wear clothes with pockets or a backpack to carry more.'` → cut
- Tab `'Crafting'` → `'Craft'`
- Ground `` `${n} items` `` → `` `${n}` ``
- `'Drop items here'` → cut
- Container `'Empty'` → cut
- Character header right side `'Creative'` / `` `Day ${day}` `` → cut (day moves to the top strip)
- `'Weapons'` header → cut
- `` `In hands: ${name}` `` / `'Hands empty'` → cut (the in-hands dot replaces it)
- Char stats labels `'Health'`, `'Blood'`, `'Infected killed'` → cut. `'Body temp'` / `'Outside'` → `36.8° / 26°`. `'Insulation'` → `'Insul'`. `'Bite protection'` → `'Bite'`.
- Slot label spans (`SLOT_LABEL` text in every empty slot) → cut (glyph, with the label on hover)
- Tag `'HELD'` → cut (accent dot)
- Tooltip:
  - Category·rarity line `` `${CATEGORY_LABEL} · ${rarity}` `` → cut
  - `d.desc` → cut (except books and notes)
  - `` `Double-click: ${label}` `` → cut
  - Pair labels: `'Rate of fire'` → `'RPM'`, `'Calibre'` → meta line, `'Bite protection'` → `'Bite'`, `'Treats infection'` → `'Infection'`, `'Stops bleeding'` → `'Bleed'`
  - `'Splints fractures' / 'yes'` → meta `Splint`. `'Raw' / 'cook it first'` → meta `Raw`. `'Sealed' / 'needs a can opener or a blade'` → meta `Sealed`. `'Alcohol' / 'yes'` → meta `Alcohol`.
  - `'Loaded' … (mag name)` → `30/30`
  - `'Contents' … 'empty'` → `Empty`, or `0.5 L water`
- Deny toasts:
  - `` `${def.name} doesn't go there` `` and `` `${def.name} doesn't go in that slot` `` → none (hover chip `Wrong slot`)
  - `"It can't go inside itself"` → chip `Invalid`
  - `'Not enough room'` → `'No room'`
  - `'Only part of it fits'` → chip `4 of 6`
  - `'No room — dropped it'` → `'Dropped'`
- Context menu:
  - `'Hold in hands'` → `'Hold'`
  - `` `Remove from hotbar ${n}` `` → `` `Unbind ${n}` ``
  - `'Add to hotbar'` → `'Bind'`, and hint `'hover + 1–9'` → keycap `1–9`
  - `'Split stack'` → `'Split'`
  - `` `Put in ${label}` `` → `` `Move to ${label}` ``
  - `'Remove magazine'` → `'Eject mag'`
  - `` `Insert magazine (${n})` `` → `'Insert mag'`
  - `'Empty magazine'` → `'Unload'`
  - `'Load rounds'` → `'Load'`
  - Hints `'Double-click'` → `'Dbl-click'`, `'Shift-click'` → `'⇧ Click'`
- Split popover `` `Split ${name}` `` → `'Split'`
- Catalog:
  - Placeholder `'Search items…'` → `'Search'`
  - `` `${ITEMS.size} items · click to take one, Shift-click for a full stack, or drag` `` → `` `${n}` ``
  - `'Nothing matches.'` → cut
- Crafting: `'Crafting is not available.'` → cut. `'No recipes.'` → cut. Need line `` `2× Rag, … · knife · at a fire` `` → chips (5.8).

### src/ui/Menus.js

Title screen:

- Kicker `'A Hawaiian Islands survival game'` → cut
- Menu hints `'Last world'` → world name and day; `'Worlds'` → cut
- `'Singleplayer'` → `'Worlds'`
- `'Controls'` item → cut
- `'Credits'` → `'About'`
- Footer `'Terrain: AWS Terrain Tiles … · Built with three.js · Deadtide v0.1'` → `'v0.1'`

Worlds:

- Sub `'Worlds are saved in this browser. Export them to keep a backup or move them to another computer.'` → cut
- `'Play selected world'` → `'Play'`
- `'Import world…'` → `'Import'`
- `'Create new world'` → `'New world'`
- `'That hardcore world is over — its survivor died.'` → `'World over'`
- Delete confirm body `'This world will be gone forever (export it first to keep a copy).'` → cut
- Empty `'No worlds yet.<br>Create one to wash up on a beach somewhere in Hawaiʻi.'` → `'None'`
- Row `` `played ${t}` `` → `` `${t}` ``
- `'seed ' + seed` → moved to Details
- Badge `'hardcore · dead'` → `'Dead'`

New world:

- Title `'Create new world'` → `'New world'`
- Sub `'Eight islands, the infected, and whatever you can find.'` → cut
- Hints `'Loot, the infected and events come from the seed'`, `'Creative: fly, no hunger or damage, every item in the catalog'`, `'How fast you get hungry and how hard the infected hit'`, `'No cheats; the world ends when you die'`, `'Real minutes per game day'` → cut
- `'On — one life'` → toggle, plus `One life` only when on
- Seed placeholder `'Leave blank for a random seed'` → `'Random'`
- `'Wash up on'` → `'Spawn'`
- `'Any island (random beach)'` → `'Random'`
- `'Hawaiʻi (Big Island)'` → `'Hawaiʻi'`
- `'2 h 24'` → `'144'` (the unit is shown once after the control)
- `'Create world'` → `'Create'`

World details:

- `'Edit world'` → `'World'`
- `'Survivor stats'` plus `` `${k} infected killed · ${d} deaths · ${km} km walked` `` → 3 stat cells `Kills`, `Deaths`, `Distance`

About (was credits): all three paragraphs → attribution list. `'Mahalo for playing. Stay off the beaches after dark.'` → cut.

Options:

- Sub `'Saved automatically.'` → cut
- Tab `'Display'` → split into `Graphics` and `Interface`
- Tab `'Key bindings'` → `'Keys'`
- `'Mouse sensitivity'` → `'Sensitivity'`
- `'Invert mouse Y'` → `'Invert Y'`
- `'Pick up ammo automatically'` → `'Auto-pickup ammo'`
- `'Realistic map & compass (need the items)'` → `'Realistic map'`
- `'Tutorial tips'` → `'Key hints'`
- `'Reset to defaults'` → `'Reset tab'`
- Confirm `'Reset all options?'` / `'Key bindings are kept.'` → `'Reset Graphics?'` (tab name), no body

Keys:

- Title tooltip `'Click, then press a key. Esc cancels, Backspace clears.'` → keycaps while listening
- `'Press a key…'` → `'Press key'`
- `'Also bound to: …'` → `'Also: …'`
- `'Reset key bindings'` → `'Reset keys'`

Pause:

- Kicker `` `Day ${d} · ${name}` `` → name, then `Day 3 · 14:20`
- h1 `'PAUSED'` → `t-cap` `'Paused'`
- Hints `'Esc'` (kept as keycap), `'F1'` (wrong binding) and `'Game mode'` → cut
- `'Controls'` → cut
- `'Switch to survival'` / `'Switch to creative'` → `'Survival mode'` / `'Creative mode'`
- `'Save world'` → `'Save'`
- `'Save & quit to title'` → `'Quit to title'`
- Toast `'World saved'` → `'Saved'`

Death:

- Kicker `'You died'` plus h1 `'DEAD'` → one heading `'You died'`
- `` `Cause of death: ${cause}` `` → `` `${cause}` ``
- `'Infected killed'` → `'Kills'`
- `'Travelled'` and `'Lives'` cells → cut
- `'Respawn on a beach'` → `'Respawn'`
- `'Quit to title'` → `'Quit'`
- `'Back to title'` → `'Title'`
- `'Hardcore: this world is over.'` → `'World over'`
- `'Your body — and everything you carried — stays where you fell. It is marked on your map.'` → cut

Controls screen: the whole screen → removed. Its item list moves to Options > Controls > Reference with shortened labels:

- `'Interact / pick up / open / drive'` → `'Interact'`
- `'Jump / vault / swim up'` → `'Jump'`
- `'Quick melee / shove'` → `'Shove'`
- `'Hold breath (scopes)'` → `'Hold breath'`
- `'Crouch / prone'` → two rows
- `'Creative: fly'` → `'Fly'`

The four tip paragraphs ("Looting.", "Staying alive.", "The infected", "Commands."), the sub `'Rebind keys in Options → Key bindings.'` and the `'Key bindings…'` button → cut.

### src/ui/MapUI.js

- Sub `'Drag to pan · wheel to zoom · double-click to mark · C to centre · Shift-click to teleport'` → cut
- Buttons `'Me'`, `'Islands'`, `'Close'`, `'+'`, `'−'` → icon rail
- Legend `'Highway / street'` → `'Road'`, `'Dirt road'` → `'Track'`, `'Your body'` → `'Body'`; the legend itself is collapsed by default
- Coords `'elev … m (real)'` → `` `${m} m` ``, `'depth … m'` → `` `-${m} m` ``, `` `${d} away` `` → `` `${d}` ``
- Scale `` `${dist} (game)` `` → `` `${dist}` ``
- Toast `'Teleported'` → cut
- Marker label `` `Marker ${n}` `` → `` `${n}` ``

### src/ui/Chat.js

- `'Welcome to Deadtide. Press T to chat, type /help for commands.'` → cut
- Placeholder `'Say something or type /help'` → cut (the `/` mode chip replaces it)

## 15. Text owned by other modules (for the lead)

The UI renders these, but they live in module files. Suggested replacements follow the same text policy.

- **src/game/Survival.js** `msg()`:
  - `'You are bleeding'` → `'Bleeding'`
  - `'The wound looks infected'` → `'Infected'`
  - `'Your leg is broken — find a splint'` → `'Broken leg'`
  - `'Your stomach turns…'` → `'Nauseous'`
  - `'Salt water makes it worse'` → `'Salt water'`
  - `'That water was bad'` → `'Bad water'`
  - `'You threw up'` → `'Vomited'`
  - `'You have a fever'` → `'Fever'`
  - `'Your leg has healed'` → `'Leg healed'`
  - `'You are freezing'` → `'Freezing'`
  - `'You feel cold'` → `'Cold'`
  - `'You are overheating'` → `'Overheating'`
  - `'You are starving'` → `'Starving'`
  - `'You are very hungry'` → `'Hungry'`
  - `'You are dehydrated'` → `'Dehydrated'`
  - `'You are very thirsty'` → `'Thirsty'`
  - `'You are exhausted — find somewhere to sleep'` → `'Exhausted'`
- **src/game/Game.js:** `"You can't sleep with the infected nearby"` → `'Infected nearby'`
- **src/game/Crafting.js:**
  - `check()` reasons (`` `Need ${q}× ${name}` ``, `` `Need a tool that can …` ``, `'Needs a lit fire or stove nearby'`, `'Pour it into a pot or canteen to boil (or carry a pot)'`, `'You carry no dirty water or seawater'`) → `` `${q}× ${name}` ``, `'Needs blade'` (per tool), `'Needs fire'`, `'Needs pot'`, `'No dirty water'`
  - Toasts:
    - `'No room — it is on the ground'` → `'Dropped'`
    - `'There is nothing left to burn — add firewood or sticks'` → `'No fuel'`
    - `'You need a lighter or matches'` → `'No lighter'`
    - `'The rain puts out the flame — try again'` → `'Rained out'`
    - `'Fuel added — light it again'` → `'Fuel added'`
    - `'You need sticks, firewood, planks or charcoal'` → `'No fuel'`
  - Prompts:
    - `'Lighting the fire'` → `'Lighting'`
    - `'Feeding the fire'` → `'Adding fuel'`
    - `` `Add ${fuel} to the fire` `` → `` `Add ${fuel}` ``
    - `'Burnt-out campfire'` / sub `'Add sticks or firewood to relight it'` → `'Campfire'` / `'No fuel'`
    - Sub `` `Burns for ${h} · hold to put out` `` → `` `${h}` `` (the hold action gets its own row)
- **src/weapons/Hands.js:**
  - `'Jammed — press R to clear it'` → `'Jammed'` (the HUD shows `R Clear`)
  - `` `${def.name}: ${mode}` `` → mode only (the HUD readout flashes)
  - `'No room: dropped the empty magazine'` / `'No room: dropped the magazine'` → `'Mag dropped'`
  - `` `No ${ammo}…` `` → `'No ammo'`
  - `'No lighter — the rag is not lit'` → `'No lighter'`
  - `` `${ammo} don't fit …` `` → `'Wrong ammo'`
  - `'No room: some rounds dropped'` → `'Rounds dropped'`
  - `` `${mag} doesn't fit …` `` → `'Wrong mag'`
  - `` `The ${gun} takes magazines` `` → `'Needs mag'`
  - `` `Wrong ammunition for the ${gun}` `` → `'Wrong ammo'`
  - `` `${att} attached to the ${gun}` `` → `'Attached'`
- **src/game/Water.js:**
  - Subs `'Boil or distil it before drinking'`, `'Salty — it will make you thirstier'`, `'Slow, but clean'` → cut
  - `'Drink the rain'` → `'Drink rain'`
  - `'A few mouthfuls of rainwater'` → `'+Water'`
- **src/game/items/WorldItems.js:** `'Not enough room for all of it'` → `'No room'`
- **src/game/items/Fishing.js:**
  - `'Stand at the water and look at it to cast'` → `'Face water'`
  - `'No room — it flops onto the ground'` → `'Dropped'`
  - `'Missed it — and it took the bait'` → `'Missed'`
  - `'Strike!'` → `'Strike'`
  - Sub `'Something is biting'` → cut
  - Sub `'Waiting for a bite…'` → cut
  - `'You reel in the line'` → cut
  - `'Cast the line'` → `'Cast'`
- **src/game/items/Gathering.js:**
  - `'Search the beach'` / `'Search the rocks'` / `'Search for sticks'` → `'Search beach'` / `'Search rocks'` / `'Gather sticks'`
  - Subs `'Driftwood, stones'`, `'Loose stones'`, `'Dry branches under the trees'`, `'Dry brush'` → cut
- **src/game/items/ItemUse.js:**
  - `'The battery is dead. Somebody…'` and `'A family grinning on Waikīkī beach. "…'` (lore) → cut, or move into book/note tooltips
  - `'Aim to look through the binoculars'` → `'Aim to use'`
  - `'You spill some of it opening it that way'` → `'Spilled some'`
  - `'You need a blade — a machete, a knife — to crack a coconut'` → `'Needs blade'`
  - `'You need a campfire to cook on — place a fire kit and light it'` → `'Needs fire'`
  - `` `${cooked} is ready` `` → `'Cooked'`
  - `'You have nothing to fill — find a bottle, canteen or pot'` → `'No container'`
  - `'It needs to be raining, and you need to be outside'` → `'Needs rain'`
  - `` `You need ${n} …` `` → `` `Needs ${n}` ``
  - `'Your leg is already splinted'` → `'Already splinted'`
  - `'You have no infection to treat'` → `'No infection'`
  - `'The infection is still there — keep treating it'` → `'Still infected'`
  - `'Leg splinted — take it slow while it heals'` → `'Splinted'`
  - `'You need a lighter or matches'` → `'No lighter'`
  - `` `The ${x} is dead — it needs batteries` `` → `'No battery'`
  - `'The panel needs direct sunlight'` → `'Needs sun'`
  - `` `Your ${x} died — the batteries are flat` `` → `'Battery dead'`
  - `'The fire is laid. Light it with a lighter or matches (F).'` → `'Fire laid'`
  - `'The canister is empty — fit a propane canister'` → `'Empty canister'`
  - `'The stove is good for ten more meals'` → `'Refilled'`
  - `` `You learned something about ${skill}` `` → `` `+${skill}` ``
  - Heading/time toasts `` `Heading ${deg}° ${cardinal}` `` and `` `${hour} — day ${d}` `` → `` `${deg}° ${cardinal}` `` and `` `${hour} · Day ${d}` ``
- **src/game/Bodies.js:** `'Search your body'` → `'Search body'`
- **src/city/Roads.js:** `'Searching the glovebox'` → `'Searching'`
- **src/core/Settings.js:**
  - Default `showFps: true` → `false`
  - `BINDING_LABELS`:
    - `'Interact / pick up'` → `'Interact'`
    - `'Jump / vault'` → `'Jump'`
    - `'Walk (hold)'` → `'Walk'`
    - `'Quick melee / shove'` → `'Shove'`
    - `'Free look (hold)'` → `'Free look'`
    - `'Hold breath / zoom'` → `'Hold breath'`
    - `'Climb (air / boat)'` → `'Climb'`
    - `'Descend (air)'` → `'Descend'`
    - `'Survival journal'` → `'Status'`
    - `'Debug overlay'` → `'Debug'`
- **src/game/items/recipes.js:** `desc` strings are no longer shown. They can stay as developer notes.

## 16. Implementation notes (mapping to code)

- **`ui.css`.** Rewrite on the tokens in section 2.
  - Delete `.tw-glass` gradients and inner highlights, `.loader-glint`, `.loader-tips` and the `tw-tip` keyframes, `.menu-btn` boxes, the `.badge.creative` sun colour, `.item.r-*` rarity borders, and the `.inv-col h3` sun colour.
  - Keep `--gui` and `--tw-u`.
  - One new stylesheet section per screen, in the order of this document.
- **`HUD.js`.**
  - Vitals become a single row `div.vitals` with `div.badges`, a divider and `div.stats`. Chips are created lazily and removed when hidden. The `S.conditions()` call per 20 frames stays.
  - Weapon card → `div.ammo` (number, divider, reserve, mode) with no image.
  - Location card → a new `div.place` driven from `ui.locationName()` every 30 frames.
  - Hold ring → an SVG around the `kbd` in the prompt.
  - Keep the `hitmarker`, `toast` and `item:pick` subscriptions, `hands.crosshairSpread()`, `vehicles.hud()` and `markers.list()`.
- **`InventoryUI.js`.**
  - Keep `move`, `_place`, `_quickMove`, `_dropOnItem`, `_takeAll`, `_sort`, `_split` and all `game.*` calls as they are.
  - Only the rendering (`render`, `_renderLeft`, `_renderMid`, `_container`, `_slot`, `_item`, `_tip`, `_menu`, `_crafting`, `_catalog`) changes.
  - Add `canDrop(stack, from, to)`, a dry-run of `move()`'s checks, to drive the hover feedback in 5.4.
  - Collapsed state: `this.collapsed = new Set()`.
- **`UI.js`.**
  - Remove `TIPS`, `_tips` and `tipEl`, and add `keyHints` (4.9) using the same `tutorial` setting.
  - `journal()` → Status (5.10).
  - `announceSpawn()` → `hud.showPlace()`.
- **`Menus.js`.**
  - `title`, `worlds`, `createWorld`, `editWorld`, `credits` (→ `about`), `options`, `_keybinds`, `pause` and `death` are restyled per sections 8–12.
  - `controls()` is removed. Its item list feeds Options > Controls > Reference. `F1` (`hideHud`) stops being mislabelled.
- **`MapUI.js`.** Tool rail, top bar, popovers, right-click menu and cursor readout per 6.1. `MapView.draw` is unchanged except the ocean base colour.
- **`Chat.js`.** Remove the welcome line. Add the mode chip. Restyle suggestions.
- **Test.** Build `test/preview/ui.html`: a stubbed `game` (survival values, inventory with pockets, backpack and a gun, markers, `vehicles.hud()`) that mounts `UI` with no world. Screenshot each state in section 4 plus every screen in sections 5–13. Then run one full-game session through `test/preview/session.mjs` on the `s5` spots (01 sun, 07 sand, 09 night) to check halo legibility.

## 17. References and what was taken

- **DayZ 1.2x `IngameHud` script** (dayzexplorer.zeroy.com, scripts 1.24 `ingamehud.c`):
  - Notifiers (always-present stats) versus badges (shown only while the value is above 0; bleeding shows a count).
  - 1–3 tendency arrows (`Math.Clamp(tendency,1,3)`).
  - Status colours 3 = yellow, 4 = red, 5 = blinking red.
  - Temperature auto-hides after 30 s.
  - Quickbar and crosshair fade timers.
  - Stance widget.
  - The vehicle panel swaps in for the foot HUD.
  - The HUD hides when a menu or the inventory is open.
- **DayZ HUD Redesign by Kuba Špiřík** (Behance, via search summary): conditions with no value (visible only when active) separated from stats by a thin vertical line; stats that kill (blood, health) separated from stats that feed them; white for contrast.
- **DayZ Modding Wiki, HUD overlay chapter** (stardz-team.github.io): the HUD stacks as status indicators over the quickbar, hides under inventory and pause, uses a clean sans, and fades with alpha timers.
- **Project Zomboid moodles guide** (projectzomboid.wiki/guides/moodles): moodles sit on the side and appear only when active, severity is carried by colour intensity, hovering tells you the fix, and the stack reads as a priority queue. Taken as the killers-first order and the condition-plus-treatment Status list.
- **Project Zomboid B42 UI scaling notes and the CleanUI mod** (pzfans.com; Steam Workshop 3437629766, via search summary): native size controls for moodles and inventory fonts; compact, readable container panels. Taken as the GUI-scale rule and compact container headers.
- **Arma Reforger Workshop CERTII-Minimal-HUD and HUD Key** (reforger.armaplatform.com): the weapon HUD trimmed to fire mode and zeroing, no control hints or popups, and the HUD on demand. Taken as the idle weapon readout at 70% and no permanent hints.
- **Arma Reforger BetterInventory** (Workshop): a bigger vicinity area and a single scroll column for storage. Taken as the Nearby column and one scroll list of carried containers.
- **Arma Reforger Modding Boot Camp #4** (reforger.armaplatform.com/news): HUD slots re-parent into menus, so notifications can persist on the map. Taken as toasts that stay visible over the map.
- **Escape from Tarkov menu UX redesign** (heiolenmarkus.com): an icon on every action destroys hierarchy; confirm dialogs should use verbs (`Delete`/`Cancel`, not Yes/No); primary actions sit together. Taken as text-only context menus, verb buttons and one primary per footer.
- **Escape from Tarkov keybinding reference** (gist TheDonDope/8327101…): `Ctrl+Click` quick move, `Delete` to discard, `1–0` quick slots, `Alt+T` magazine check. Taken as the inventory modifier set in 5.4.
- **SCUM metabolism and BCU** (scum.wiki.gg): the HUD keeps a few vitals and a stamina ring, while deep detail lives in a separate BCU screen. Taken as a minimal HUD with a separate Status screen.
- **Game UI Database and Interface In Game** (gameuidatabase.com, interfaceingame.com): screenshot galleries used to confirm the DayZ inventory three-column layout (vicinity, character slots, cargo), which is kept here.
