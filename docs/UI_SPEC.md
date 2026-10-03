# Deadtide UI spec

## The direction: DayZ

The user asked to make the UI "more like DayZ". **[docs/UI_DAYZ.md](UI_DAYZ.md) is the target** and wins wherever it
and this file disagree. In short:

- **Almost nothing on screen.** Status notifiers and the stance bottom right, badges over them, a thin stamina bar
  and a numbered quickbar bottom centre, prompts right of the crosshair. Minimap, compass bar, ammo counter and
  location card are settings, off by default.
- **Near-black see-through panels** (`rgba(0,0,0,.62)`), white and grey ink, colour only for condition and danger
  (yellow `#D8B23A`, red `#C33A32`, green `#6AA84F` only where DayZ uses it). Selection is a white outline and a
  lighter fill; there is no orange accent any more.
- **Roboto Condensed in caps** (+0.06em) for headers, labels, buttons and menu entries; **Roboto** for reading text;
  JetBrains Mono only for chat commands, world seeds and the debug block.
- **Square corners** (0–2 px), 1 px lines, no drop shadows except a soft one under floating tooltips, menus and
  dialogs, no `backdrop-filter` anywhere.
- **Menus** are cinematic: the world behind, darkened from the left and at the edges; `DEADTIDE` big in condensed
  caps; short lists of uppercase text entries, grey until hovered (white, with a thin bar); flat square panels with
  caps tabs; `YOU ARE DEAD` on black.
- **The map is a paper map**: cream land, pale greens, muted water, brown contours, dark inks and condensed caps names.

**Where things live.** The values are in `src/ui/css/tokens.css`; each screen's look is in its own file under
`src/ui/css/` (`base`, `components`, `hud`, `inventory`, `menus`, `map`, `chat`), imported in that order by
`src/ui/ui.css`. Those files are the reference for sizes and colours: this spec no longer copies CSS. What follows
is what each screen shows, when, and how it behaves.

**History.** Task #21 chose a graphite and orange "Systems" look over the Survival and Cinematic proposals
(`docs/ui/proposal-*.md`). Its behaviour (units, GUI scale, show-on-change, the inventory rules and shortcuts, key
rebinding, the map tools) carried over into the DayZ look; its palette, radii, plates and type did not. The
reference renders in `docs/ui/spec-*.jpg` show that older look.

- **Scope:** `src/ui/*` (UI.js, HUD.js, InventoryUI.js, CharacterPreview.js, Menus.js, MapUI.js, MapView.js,
  maptile.js, Chat.js, widgets.js, dom.js, icons.js, itemIcons.js, ui.css and css/), the `index.html` loader markup and
  font links, the `status()` strings in `src/main.js`.
- **Units:** every size is in **u**. 1u = 1 px at 1920 × 1080 with GUI scale 100%. Sizes below are for that screen.

---

## 1. Principles

1. **Read the world, not the HUD.** Nothing shows that the scene or a glance at the inventory can tell you. A value
   appears when it is wrong or moving.
2. **Glyphs over numbers on the HUD, numbers in the panels.** The HUD says *how bad and which way* (colour and
   tendency arrows); the Status screen and the inventory's body table give the values.
3. **Monochrome.** White and greys; yellow for low, red for critical or danger, blue for cold, green only for a good
   tendency or a drop that fits.
4. **Legible without plates.** HUD text and glyphs are white with a tight dark halo straight on the scene; strings
   that need more (prompt names, toasts, chat, pickups) sit on a dark strip or a wash that fades out.
5. **Short words.** Verbs for prompts and buttons, a few words for toasts, no sentences, no flavour text.

---

## 2. Tokens

### 2.1 Unit and GUI scale

```css
--u: calc(var(--gui) * clamp(min(0.85px, 100vh / 700, (100vw - 32px) / 1104), min(100vh / 1080, 100vw / 1600), 1.5px));
```

- `--gui` is set on `<html>` by `main.js` from the `guiScale` setting (0.7–1.6), so the GUI-scale option multiplies
  every size.
- `min(height/1080, width/1600)` keeps the inventory inside the window at any aspect ratio. The floor (0.85 px) keeps
  11 px body text at 1280 × 720 and 1366 × 768; it drops lower only where the inventory would no longer fit. 4K stops
  at 1.5 px.
- Every length in the CSS is `calc(N * var(--u))`; hairlines stay 1 px.
- Canvas code needs the unit in pixels: `unitPx()` in `dom.js` measures it; `UI` caches it in `ui.u` (re-measured on
  resize and on `guiScale`). Canvas fonts, line widths and marker sizes are multiplied by `ui.u` (and by
  `devicePixelRatio`, capped at 2, for backing stores).

### 2.2 Colour (`tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--bg-0…3` | `#080808` `#101010` `#171717` `#222` | Backdrops, the loader |
| `--m-panel` | `rgba(0,0,0,.62)` | Panels, inventory columns, HUD strips |
| `--m-slot` | `rgba(0,0,0,.45)` | Slots, quickbar squares, badges |
| `--m-hud` | `rgba(0,0,0,.5)` | Small plates (menu toasts, lock hint) |
| `--m-pop` | `rgba(12,12,12,.97)` | Tooltip, context menu, popover, confirm |
| `--m-bar` | white `.07` | Header bars (VICINITY, HANDS, container names, panel heads) |
| `--scrim` | `rgba(0,0,0,.6)` | Behind in-game panels |
| `--fill-1…4` | white `.04 / .07 / .11 / .16` | Rest / hover / pressed / selected fills |
| `--line-1…3` | white `.07 / .12 / .24` | Dividers / edges / strong edges and outline key caps |
| `--ink-1…4` | `#FFF` `#C8C8C8` `#8A8A8A` `#555` | Text: primary / secondary / labels / disabled |
| `--hud-1`, `--hud-2` | white `.96`, `.70` | HUD text |
| `--accent` | `#EDEDED` | Selection, focus, primary button: **white**, not a hue |
| `--accent-soft` / `--accent-line` | white `.14` / `.5` | Selected fill / selected or droppable outline |
| `--on-accent` | `#0A0A0A` | Text on white fills |
| `--warn` / `--alarm` / `--cold` / `--good` | `#D8B23A` / `#C33A32` / `#86B6DC` / `#6AA84F` | Low / critical, danger, errors / cold body / good tendency, a fitting drop |
| `--c-worn…ruined` | grey, yellow, orange, red tints (`--c-*-ink` for text) | Item condition: the tint of a cell's background |
| `--wet` / `--hot` | `#5B9BD5` / `#D6463D` | Wet drop and hot dot on cells, liquid fill bars |

### 2.3 Legibility rules

1. HUD text uses `--hud-1` / `--hud-2` with the HUD halo (`hud.css`), or sits on a dark strip.
2. Status hues colour glyphs, bars, dots, cell tints and short caps words (`JAM`, `WORLD OVER`), never body text on
   the scene.
3. Panels sit on `--scrim` in game (or on the title's dark gradient), so `--ink-3` stays readable; `--ink-4` never
   carries information.
4. Colour is never the only signal: a state also changes a glyph, a blink, an arrow or a word.

### 2.4 Type

Google Fonts in `index.html`: `Roboto:wght@400;500;700`, `Roboto+Condensed:wght@400;500;700`, and
`JetBrains+Mono:wght@500;600`.

| Class | Size / line (u) | Face | Use |
|---|---|---|---|
| `.t-label` | 11 / 14, 500, caps +0.06em | Roboto Condensed | Section heads, captions, tags |
| `.t-body` | 13 / 18, 400 | Roboto | Rows, values, prompts, toasts |
| `.t-title` | 17 / 24, 500, caps +0.06em | Roboto Condensed | Panel titles (18u 700 in panel heads) |
| `.t-num` | 28, 500, tabular | Roboto Condensed | Big numbers |
| `.t-display` | 40 / 44, 700, caps | Roboto Condensed | Display text |
| `.t-mono` | 12 / 16, 500 | JetBrains Mono | Chat commands, seeds, debug |
| `.wordmark` | 96, 700, +0.14em | Roboto Condensed | `DEADTIDE` on the title and the loader |
| `.menu-item` | 26, 500, caps +0.08em | Roboto Condensed | Title, pause and death entries |

- Every number uses tabular figures. Source strings are sentence case; capitals come from CSS.
- Only item names and world names truncate (one line, ellipsis).

### 2.5 Space and sizes

4u base: `--s-1…7` = 4, 8, 12, 16, 24, 32, 48. `--edge` (HUD inset) 24. Buttons and inputs 32 h (small 24, large 40),
segmented controls 28, option rows 40, context-menu rows 26, menu entries 46 (death 40), world rows 72, quickbar
squares 44 (inventory strip 46), inventory grid cells `--gc` (58u, smaller when two 6-cell grids no longer fit),
gear slots `--sl` 60.

### 2.6 Shape, stacking

- `--r-xs` 2 px (key caps), every other radius 0.
- `--sh-pop` (`0 8px 24px -6px rgba(0,0,0,.7)`) under tooltips, menus, popovers, drag ghosts and dialogs; nothing
  else has a shadow. **No `backdrop-filter`** anywhere (it re-samples the WebGL canvas every frame).
- Focus: `outline: 1px solid var(--accent)` on `:focus-visible` only; selected cells and rows get a white inset line
  and `--accent-soft`.
- Stacking inside `#ui.tw-root`: `.hud` 1, `.chat` 2, `.lock` 3, `.screen` 10, `.feed` (toasts) 20, `.menu-toasts`
  30, `.pop` 40, `.confirm-wrap` 50, `.drag-ghost` 60. `#loader` is outside, at 200.

### 2.7 Motion and timers

| Token | ms | Use |
|---|---|---|
| `--d-1` | 80 | Hover, press |
| `--d-2` | 160 | HUD element in, popover in, toggle |
| `--d-3` | 240 | Panel in, toast out, menu column swap |
| `--d-4` | 400 | HUD element out |

- Easing: entries `cubic-bezier(0.2, 0, 0, 1)`, exits `cubic-bezier(0.4, 0, 1, 1)`.
- Timers: HUD linger 3 s; toast 3.5 s (`bad` 5 s); pickup 2.4 s; badge caption 4 s; location card 3 s hold; key hint
  10 s at most; tooltip delay 250 ms; chat line 8 s.
- Only critical notifiers blink (1 Hz, `steps(1)`), and the stamina bar when nearly spent.
- `prefers-reduced-motion: reduce`: every animation and transition becomes an 80 ms fade; no blink, no slide.

---

## 3. Icons

- `src/ui/icons.js` is the set (`PATHS`, `icon( name, size, cls )` → `<svg class="i">`); `canvasIcons.js` draws the
  same paths on canvas for the map.
- 24 × 24 grid, outline `stroke-width: 1.5` (1 px at 16u), round caps and joins; filled shapes only where the markup
  says `fill="currentColor"`. Sizes 16u (inline), 24u (slots, map tools), 12u (in key caps).
- Families: status notifiers `nf_health`, `nf_blood`, `nf_food`, `nf_water`, `nf_temp`, `nf_energy` (solid); stance
  `stance_stand`, `stance_crouch`, `stance_prone`, `stance_swim`; conditions keyed by `Survival.conditions()` id (plus
  the moodle faces `stress`, `unhappy`, `bored` added by `HUD.js`); gear-slot glyphs (`head`, `eyes`, `face`, `torso`,
  `vest`, `back`, `gloves`, `hands`, `legs`, `feet`, `belt`, `primary`, `sidearm`, `melee`); chrome (`close`, `sort`,
  `search`, `plus`, `minus`, `locate`, `fit`, `layers`, `pin`, `edit`, `duplicate`, `export`, `import`, `trash`,
  `chevron`, `check`, `reset`, `fuel`, `wrench`, `altitude`, `breath`, `flame`, `car`, `skull`, `mouseL`, `mouseR`,
  `player`).
- Item renders (`itemIcons.js`, from `render/Icons.js`) stay full colour everywhere.

---

## 4. Components (`components.css`)

Every interactive component has hover, pressed, `:focus-visible` and disabled (`opacity .4`) states.

- **Screen and panel.** `.screen` fills the window on `--scrim` (fade 240 ms); on the title it is `.screen.bare`
  (no scrim, the title's backdrop stays). `.panel` is flat and square on `--m-panel` with a 1 px `--line-2` edge;
  `.panel-head` 48 h on `--m-bar` (caps title, optional meta and buttons, close); `.panel-body` scrolls; `.panel-foot`
  56 h, secondary buttons then the one primary at the right. Esc and a click on the scrim close a non-sticky screen.
- **Buttons.** `.btn` 32 h, condensed caps on `--fill-2`; `.primary` white with dark text; `.danger` red text;
  `.ghost` text only; `.sm` 24 h, `.lg` 40 h; `.icon` 32 × 32, transparent, always with a `title`.
- **Key cap.** `.kc` 20 h, condensed caps, 2 px radius: solid white with dark text, or `.out` (outline); on the HUD a
  white outline square like DayZ's `[F]`. Mouse buttons draw the `mouseL` / `mouseR` glyph. Labels always come from
  `input.label( action )`.
- **Segmented control** `.seg`: flat caps segments; the chosen one lit (`--fill-4`) with a 2 px white underline.
  ←/→ change it when focused.
- **Toggle** `.toggle` (`role="switch"`): a 36 × 18 square switch; on = white track, dark knob.
- **Slider** `.slider`: 2 px track filled white to `--p`, an 8 × 16 white square thumb; value label `.val` to its
  right. Shift + arrow steps ×10. Expensive settings apply on release.
- **Input** `.input`: 32 h on `rgba(0,0,0,.5)` with a `--line-2` edge, white edge when focused. `.search` adds the
  icon; **select** is a `.btn.select` with a chevron that opens a `.pop.menu` under it (no native `<select>`).
- **Rows.** `.sec-head` 32 h caps label; `.row` 40 h: label left (`--ink-2`), control right in a fixed column, a
  6u white square left of the label when the setting differs from its default, and a reset slot; `.stats` two-column
  value table on `rgba(0,0,0,.55)` cells; `.lrow` world rows; `.prow` popover rows.
- **Pop** `.pop` on `--m-pop` with `--sh-pop`; `.tip` tooltip (6.x); `.menu` context menu, 26 h rows, key hints as
  faint text, `.def` default row, `.danger` red row, `.sep` hairline.
- **Toasts.** In game, plain lines at the top left (5); menu toasts (`ui.toastScreen`) a small dark plate 48u above
  the bottom centre for 2.5 s (`Saved`, `Imported`, `Copied`, errors 5 s with a red mark).
- **Confirm** (`ui.confirm( title, text = null, ok = 'OK', cls = 'primary' )`): a 400u `.pop.confirm` over the scrim,
  caps title, then `Cancel` and the verb (`.primary` or `.danger`). Enter presses the focused button (Cancel first for
  danger), Esc cancels.
- **Scrollbars:** 4 px, `--fill-4` thumb, square.

---

## 5. HUD (`HUD.js`, `hud.css`)

DayZ: almost nothing on screen. Every element is built once; `update()` writes to the DOM only when a formatted value
or a class changes and never reads layout.

### 5.1 Layout (1920 × 1080, u = 1)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ toasts (.feed, top left, above screens)       [compass bar, setting]                [minimap,     │
│ fps / debug (.tl)                                [ 318°  1.2 km ]                    setting]     │
│ chat (top left, under the toasts)               [location card, setting]                         │
│                                                                                                  │
│                                        ·   ┌ CANNED TUNA ×2 ┐   prompt: name strip, [F] Take,    │
│                                            [F] Take              other actions grey               │
│                                                                                                  │
│                                                                              pickups  Rice ×2 ▢   │
│                                                                              weapon   M4A1         │
│                                                                                       31 / 90 SEMI │
│                                     key hints                                badge caption        │
│                                ┌1┐┌2┐┌3┐┌4┐┌5┐┌6┐┌7┐┌8┐┌9┐  quickbar          [▣][▣][▣] badges     │
│                                ━━━━━━━━━━━━━━━  stamina        ♥↓ ◆ ✕↓↓ ▮ ⌇  🧍  notifiers, stance │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Where | Notes |
|---|---|---|
| Notifiers + stance `.ntfs` | bottom right, `--edge` | always (energy only when low); creative: none |
| Badges `.badges`, caption `.bcap` | above the notifiers, right-aligned, wrapping at 320u | conditions |
| Weapon readout `.wpn` / vehicle panel `.veh` | above the badges | |
| Pickups `.pickups` | above those | plain lines on a wash from the right edge |
| Quickbar `.qbar`, stamina `.stamina`, key hints | bottom centre | |
| Prompt `.iprompt`, timed action `.tact` | left 50% + 36u, top 50% − 12u | right of the crosshair |
| Crosshair, hit flash | centre | |
| Toasts `.feed` | top left; under the FPS / debug block | a sibling of `.hud` at z 20, so it shows over screens |
| Compass bar, heading tab, location card | top centre | settings, off by default |
| Minimap | top right, 192u | setting, off by default |
| Lock hint | centre, 58% down | `Click to resume` on a dark strip |

While a screen is open `.hud` gets `.under` (fades out); `F1` (`hideHud`) and death set `.off` on `.hud`, `.feed`
and the closed chat. Over the map the toasts move under its title; over the inventory only the newest shows, in the
band above the columns.

### 5.2 Visibility

`hudMode` (`'auto'` | `'always'`) and a 3 s linger (`wake( key )` / `shown( key, cond )`). Elements fade with `.gone`
(in 160 ms, out 400 ms).

| Element | Shows | Setting |
|---|---|---|
| Notifiers | always (energy below 30, hysteresis to 33); creative never | |
| Badges | any condition (creative never); `[K] Bandage` while bleeding with something that stops it | |
| Stamina bar | stamina below its maximum, or underwater (breath); lingers 1 s | |
| Quickbar | 3 s after a slot key, the wheel, a new held item, a new binding or a bound stack used (`always`: whenever any slot is bound) | |
| Weapon readout | see 5.5 | `ammoCounter` (off) |
| Compass bar + heading | setting on and (`realisticMap` off, carrying a compass, or creative); **a compass in the hands always shows it** | `compass` (off) |
| Minimap | setting on and (`realisticMap` off, carrying `map_hawaii`, or creative) | `minimap` (off) |
| Location card | a new place that holds 2 s, or spawn (not the same name again within 60 s) | `locationCard` (off) |
| Prompt | a target, nothing busy, no screen | `showInteractHints` |
| Key hints | one set at a time (`UI.js` `HINTS`) | `tutorial` |
| Crosshair | on foot, not aiming, no screen | `crosshair`: `dot` / `lines` / `none` |
| Hit flash, damage glow | on a hit | `hitMarkers`, `damageIndicators` |

**Aiming:** the crosshair hides; the quickbar, key hints and pickups step aside (160 ms). **In a vehicle:** the
crosshair, quickbar and weapon readout hide and the vehicle panel takes their place.

### 5.3 Notifiers, stance, badges

- **Notifiers**, left to right: health, blood, food, water, body temperature, energy (only when low). A solid 26u
  glyph, white when fine, **yellow** when low, **red and blinking** when critical; temperature turns **blue** when
  cold (blinking below 35.2°).

| Notifier | Value | Low | Critical |
|---|---|---|---|
| health | `S.health` | < 50 | < 25 |
| blood | `S.blood / 50` (% of 5000 ml) | < 76 | < 60 |
| food | `min( 100, S.hunger )` | < 30 | < 10 |
| water | `min( 100, S.thirst )` | < 30 | < 10 |
| temp | `S.temp` | cold < 36.0, warm > 38.0 | < 35.2 (freeze), > 38.6 |
| energy | `S.energy` | < 25 | < 10 |

- **Tendency arrows** (DayZ's ↑ ↑↑ ↑↑↑): an EMA of the rate of change per minute; tiers at 4, 15, 45 /min
  (temperature 0.08, 0.3, 0.9 °C/min, shown only outside 36.4–37.4°). Green when the change is good, red when it is
  bad and fast (tier 3) or the value is already low, else white. Updated at 10 Hz.
- **Stance** silhouette right of the notifiers: standing, crouched, prone, swimming; none in a vehicle.
- **Badges**: 28u dark squares over the notifiers, the condition's glyph in its colour (red bad, yellow warn, grey
  good), most urgent first (bleeding, fracture, infection, cuts, …; low blood and tiredness are already notifiers).
  Bleeding shows its count; moodles show four level pips. A new badge or a new label (Cold → Hypothermia, a level)
  names itself in caps above the row for 4 s. `[K] Bandage` (the `quickHeal` key) leads the row while bleeding with
  a bandage carried.
- A dark breathing vignette rises with panic (`S.panic` above 35).

### 5.4 Stamina, quickbar, key hints

- **Stamina:** DayZ's thin white bar, 240u × `--max` (the part lost to weight, hunger or blood is not drawn), 3u
  high; flashes below 15. Underwater it shows the breath with a small bubbles glyph, red below 25.
- **Quickbar:** nine 44u dark squares numbered 1–9, item renders with quantity or rounds; the held one white-outlined
  over a lighter fill. Empty slots stay as dark squares, so positions never shift.
- **Key hints:** `[key caps] Verb` groups, 16u apart, over the quickbar, from `input.label()` so rebinding updates
  them; each set once per session and at most 10 s. Survival: Move / Sprint / Crouch, then Inventory, then Map (only
  when the map is allowed); creative: Fly (Space ×2), then Chat.

### 5.5 Weapon readout, vehicle

- **Weapon** (bottom right, over the badges): the name in grey caps, then rounds `/` spare and the fire mode.
  With **Ammo counter off** (default) it shows only what changed, for 2.5 s: the name and mode when you switch, the
  rounds after a reload or a check; `JAM` (a red caps chip) always shows. With it on, rounds, spare and mode stay
  for a firearm (yellow at 20% of the magazine, red at 0) and the name fades after 3 s. Other held items: litres for
  liquids and fuel, percent for batteries, the count for stacks.
- **Vehicle:** name and gear chip in caps, speed (`km/h`, `kn` for boats), fuel and condition as glyph + thin bar +
  percent (yellow when low, red when nearly gone), altitude for aircraft.

### 5.6 Prompt, timed action, crosshair, damage

- **Prompt** (right of the crosshair): the target's name in white caps on a dark strip (with its detail, for example
  a weight or a state, in grey beside it), then `[F] Take` under it; other actions of a placeable in grey with
  `Hold for all`. A hold target fills a thin bar under the action. Verbs whose object is the target split as
  `TARGET` / `[F] Verb` (`Take`, `Search`, `Open`, `Drive`, `Fly`, `Fill`, …); anything else is the action as given.
  With no target: `[R] Clear` while jammed, `[R] Reload` when empty with spare rounds (Key hints on).
- **Timed action:** its name in caps and the seconds left on the strip, a thin white bar under it; a cancel flashes
  the bar red for 200 ms.
- **Crosshair:** a 3u dot (or Dynamic lines, or none). **Hit:** four short red ticks for 120 ms (a kill 250 ms,
  wider). **Damage:** a soft red glow on the screen edge towards the hit, fading with `lastHitDir.t`.

### 5.7 Toasts, pickups, compass, minimap, location card, FPS

- **Toasts** (`.feed`, top left): one plain white line on a dark wash that fades out to the right; an item render,
  or a small yellow / red square for `warn` / `bad`; the same text within 2 s becomes `×2`; at most 4, newest at the
  bottom; 3.5 s (`bad` 5 s, with `ui_error`). A fire-mode toast is dropped (the readout shows it).
- **Pickups** (bottom right): the same lines from the right edge, `Name ×n` + render; the same item within 1.5 s
  merges; 2.4 s; none while the inventory is open; queued while aiming.
- **Compass bar** (setting): 480 × 26 strip, ticks every 5° and 15°, `N E S W` white, intercardinals grey, markers at
  their bearing (user white, `/locate` outline, death red skull); the heading tab under it adds the distance of the
  nearest user or locate marker within ±20°.
- **Minimap** (setting): 192u heading-up square on a dark strip, the paper map of 8.2 without names, white markers
  and player chevron, an `N` badge on the rim, a footer with the short place and (with a watch or the rule off) the
  time; dimmed at night.
- **Location card** (setting): the place in large caps, the island under it, top centre, 3 s.
- **FPS** (`showFps`) small grey figures top left; **debug** (F3) a dark monospace block under it (the toasts and
  the chat move down).

---

## 6. Inventory (`InventoryUI.js`, `CharacterPreview.js`, `inventory.css`)

The DayZ inventory (Tab): the game keeps running behind a dark overlay; three columns sit over it with the quickbar
strip under them. The volume rules of `Inventory.js` decide what fits; the screen only draws them as grids.

### 6.1 Layout

```
┌ VICINITY │ CRAFT │ CATALOG ┐ ┌ DAY 3 · 14:20          (⌕)(✕) ┐ ┌ INVENTORY   ▬▬|▬▬|▬▬ 11.2 kg (⇅) ┐
│ ˅ FRIDGE         5/12 [TAKE ALL]│ [head]  ┌──────────────┐ [top]  │ HANDS                             │
│ ▢▢▢▢▢▢                         │ [face]  │  3D survivor │ [vest] │ ┌ held item ┐  [mag][optic]…    │
│ ▢▢▢▢▢▢                         │ [eyes]  │  (idle, turns│ [back] │ ˅ ▣ POCKETS              3.5/4     │
│ ˅ GROUND                    1  │ [gloves]│   with drag) │ [legs] │ ▢▢▢▢▢▢                            │
│ ▢▢▢▢▢▢                         │ [belt]  └──────────────┘ [feet] │ ˅ ▣ HIKING BACKPACK     12/30     │
│                                │    [primary][secondary][side][melee]  ▢▢▢▢▢▢ (a rifle 2×5, a can 1×1) │
│                                │    [Bleeding ×2] [Wet]   body table   │                            │
└────────────────────────────────┘ └──────────────────────────────────────┘ └────────────────────────────┘
                                      ┌1┐┌2┐┌3┐┌4┐┌5┐┌6┐┌7┐┌8┐┌9┐  quickbar strip
```

- `.screen.inv` darkens the whole window (`rgba(0,0,0,.72)`); the first-person arms and gun hide while it is open.
- Columns: left and right are `6 × --gp + 22u` wide (`--gc` 58u cells, `--gg` 2u gap; the cells shrink when a large
  GUI scale leaves too little width), the centre 300–560u. The outer two scroll on their own; the centre never
  scrolls at 1280 × 720.
- Closing: Esc, the Inventory key, the close button, or a click on the overlay. While the search has text, the first
  Esc clears it.

### 6.2 Header bars

Small caps bars on `--m-bar` (28u): **left** the tabs `VICINITY`, `CRAFT` (omitted without `game.crafting`; the Craft
key opens it), `CATALOG` (creative only), the open one underlined in white; **centre** `DAY 3 · 14:20` (the time
follows the watch rule of the minimap), the search toggle (Ctrl+F; non-matching stacks dim) and close; **right**
`INVENTORY`, the weight meter (0–45 kg, ticks at 18 kg where stamina starts to drop and 30 kg overloaded; white, then
yellow, then red) with `11.2 kg`, and Sort.

### 6.3 Centre: the character

- A live Rocketbox survivor (`CharacterPreview`) idles under soft light on a dark gradient and turns with a mouse drag.
  The avatar follows the worn top and legs; it renders only while the screen is open, into one small render target.
  Until it is ready a neutral silhouette shows. Dropping gear on the figure wears it.
- Gear slots either side, DayZ order: left `head`, `face`, `eyes`, gloves (`hands`), `belt`; right `torso`, `vest`,
  `back`, `legs`, `feet`. Under the figure the weapons: `primary` and `secondary` (wide), `sidearm`, `melee`. An empty
  slot is a dark square with a faint grey glyph; its name is the hover tooltip (Head, Face, Eyewear, Gloves, Belt, Top,
  Vest, Back, Pants, Shoes, Primary, Secondary, Sidearm, Melee).
- Under the weapons: condition chips (kind-coloured glyph + label, only when any) and the body table (Health, Food,
  Blood, Water, Body, Energy, Air, Wet, Insulation, Bite), values coloured by the HUD thresholds (5.3).

### 6.4 Vicinity

- The open world container (`this.other`: a fridge, a locker, a trunk, a body) as a section titled with its label,
  then `GROUND` (items within 2.6 m). `TAKE ALL` sits on the first section header when anything can be taken. Walking
  more than 4 m from the container fades its section out.

### 6.5 Inventory column

- **HANDS** first: the held stack (wherever it really lives) and, for a gun, its fittings in a small row (magazine
  well and each rail, filled or as a faint glyph), each a drop target. Dropping a carried item on HANDS holds it;
  double-click holsters.
- Then each worn container in body order (pockets, top, vest, pants, backpack, …): a header bar (collapse chevron,
  render or glyph, the NAME in caps, `used/cap` right-aligned, red when over) over its grid. Collapsed state lives in
  `this.collapsed` for the session. The whole section is the drop target, so a collapsed one still takes drops.

### 6.6 Grids and cells

- Every container is `GCOLS` = 6 cells wide. Each stack fills a rectangle from its volume and shape (`footprint()`:
  long things such as rifles, spears and bats one or two cells tall and as long as they need; the rest as square as
  their shape allows: a can 1×1, a pistol 2×2, a jacket 3×2, a backpack 3×4), auto-packed in order. Faint empty
  squares show the capacity; if packing fragments, the grid grows a row rather than refuse what the volume allows.
- **Condition** is the tint of the cell's background: none above 85%, grey (worn) below it, yellow (damaged) below
  60%, orange (badly damaged) below 35%, red (ruined) below 10%.
- In a cell: the render; quantity or rounds as small white digits bottom right; one bar along the bottom edge (liquid,
  fuel or charge fill in blue / yellow, else condition or freshness); a small blue drop when wet, a red dot when hot;
  a white corner mark on the held item and a red one when spoiled.
- Selection and keyboard focus: a white inset line over `--accent-soft`.

### 6.7 Quickbar strip

Nine 46u dark squares under the columns, numbered 1–9, bound items with their quantity, the held one outlined in
white. Dropping a **carried** stack on a square binds it (`inv.hotbar[ i ] = uid`, removing that uid from any other
slot); right-click or hover + Del unbinds; hover + 1–9 over an item binds it there.

### 6.8 Mouse and keyboard

| Input | Over | Action |
|---|---|---|
| Double-click | own item | `_default` (Hold / Wear / Take off / Put away / first item action) |
| Double-click | ground or container item | Take (`_quickMove`) |
| Click | catalog item | Give 1 (existing) |
| Shift+click **or Ctrl+click** | any item | `_quickMove` (catalog: full stack) |
| **Alt+click** | own item | `_default` |
| Right-click | item, slot, quickbar square | context menu (6.10) |
| Drag | item | move (6.9) |
| Hover + `1`–`9` | carried item | bind to that slot (existing) |
| **Hover + `Del`** | own item | Drop (`move( …, { type: 'ground' } )`) |
| **Hover + `Del`** | quickbar strip square | Unbind |
| **Hover + `Space`** | stack with qty > 1 in a container | Split popover (6.11) |
| **Ctrl+F** | anywhere | Focus the search field |
| Esc / Inventory key | anywhere | Clear search, else close |

These are pointer and keydown handlers inside `InventoryUI`; no new Input bindings.

### 6.9 Drag and drop

- Drag starts after 5 px. The ghost is the stack's rectangle (its footprint in cells) with the render and quantity, following the cursor, `pointer-events: none`, at z 60; it turns green where the stack fits and red where it does not, and the grid under it shows the landing rectangle in green. The source cell gets `.src`.
- **On drag start**, compute `_accepts( stack, from, to )` for every registered drop target and add `.can` to each accepted one. `_accepts` is a dry run of the same rules as `move()` and `_dropOnItem()`, returning `{ ok, verb?, reason?, part? }`:

| Target | Accepts when | Otherwise |
|---|---|---|
| Equipment slot | `clothing.slot` / `backpack.slot` matches (backpack cat → `back`) | `Wrong slot` |
| Weapon slot | melee → `melee`; sidearm firearm → `sidearm`; any firearm → `primary` / `secondary` | `Wrong slot` |
| Ground | the source is not the ground | (no highlight) |
| Container section | the source is not the same items array; `container.owner !== stack`; a clone dry run of `addToItems` fits all → ok; fits some → `part: 'n/qty'`; fits none → `No room` | `Can't nest` / `No room` |
| Quickbar strip square | source is carried (equip, weapon, container) | `Not carried` |
| HANDS | source is carried | `Not carried` |
| The character figure | wearable gear (it is worn) | `Wrong slot` |
| Item (item-on-item) | ammo → magazine of the same calibre: `Load`; ammo → internal-feed gun of the same calibre: `Load`; magazine → gun that lists it in `firearm.mags`: `Insert`; attachment → firearm: `Attach`; same id stackable with room: `Merge` | not a target (the drop falls through to its section) |
| Catalog | never | |

- **Hovered target:** accepted → `.over` (green); item-on-item → `.over` plus a white drag chip with the verb (`LOAD`, `INSERT`, `ATTACH`, `MERGE`, or a Combine verb from `game.combine`); partial → a yellow chip `4/6`; refused → `.deny` (red) plus a red chip with the reason (`WRONG SLOT`, `NO ROOM`, `CAN'T NEST`, `NOT CARRIED`). Chips sit centred 4u above the hovered element.
- Sections show `.can` / `.over` / `.deny` as an outline: faint white / green / red.
- **Dropping on a refused target does nothing and shows no toast** (the chip already said why); `_deny()` only plays `ui_error` while dragging. Outside a drag (Shift-click, Take all) `_deny()` still toasts, with the short text in 17.
- **Dropping on the overlay** outside the columns and the quickbar strip drops the stack to the ground (same path as `move( …, { type: 'ground' } )`), except from the ground or the catalog.
- On drop, clear every `.can`, `.over`, `.deny` and chip.

### 6.10 Context menu

Component 4.14. Rows in this order (separators where shown); hints on the right are `.kc.out` key caps or `--ink-3` text:

| Where | Rows |
|---|---|
| Own item | **default action** (`.def`, hint `[mouseL 2×]`) · item actions: `Eject mag` (firearm with a mag), `Unload` (firearm with rounds), `Detach <attachment>`, `Insert mag` (hint: count of fitting mags), `Load` (magazine not full, ammo carried), `Unload` (magazine with rounds), `Attach to <gun>` (up to 4 guns), then every `itemUse.actions( stack )` label not already shown · **sep** · `Hold` · `Bind` (hint `[1–9]`) or `Unbind` (hint: slot number) · `Split` (qty > 1 in a container, hint `[Space]`) · `Move to <container>` (only while a world container is open, hint `[Shift]`) · `Drop` (hint `[Del]`) · **sep** · `Delete` (creative only, `.danger`) |
| Ground / world container item | `Take` (hint `[Shift]`) · `Wear` (clothing, backpack) · item actions except any whose label matches `/drop/i` |
| Catalog item | `Give 1` (hint `[mouseL]`) · `Give 5` · `Give <stack size>` (hint `[Shift]`, only when stack > 1) |
| Quickbar strip square | `Unbind` (hint `[Del]`) |

An item that mixes with others (`game.combine`) gets a `Combine ›` row with a count, opening a list of what it combines with (the same verbs the drag chip shows). The cell whose menu is open gets `.sel`. `Hotbar full` stays as the deny toast for `Bind` with no free slot.

### 6.11 Split popover

`.pop` 240 w, padding 12, anchored under the cell: row 1 a `.slider` (flex 1, min 1, max qty − 1, value floor( qty / 2 )) and a 56u number input (tnum, same range); row 2, 12u below: `½` (`.btn.sm`) at left, `Split` (`.btn.sm.primary`) at right. Enter confirms, Esc cancels, ↑/↓ ±1, Shift ±10. No title.

### 6.12 Craft tab

```
[ All | Ready ]                                                     .seg, 12u below the tabs
MEDICAL                                                             .sec-head per recipe.cat
┌────┐ Rag bandage                                   [ Craft ]     row 64 h, grid 40u | 1fr | auto, 12u gap, bottom hairline
│ ic │ [▢ Rags 2/2]                                                chips 20 h, 4u gap, wrap
└────┘
┌────┐ Improvised splint                             [ Craft ]     not craftable: row at 55% opacity, button disabled
│ ic │ [▢ Stick 0/2] [▢ Rags 2/2]                                  missing chip text --alarm
└────┘
SURVIVAL
┌────┐ Torch                                         [ Craft ]
│ ic │ [▢ Stick 1/1] [▢ Rags 2/2] [fuel 0.1 L] [Blade] [flame Fire]
```

- Sections in the order Medical, Survival, Food, Tools, Weapons (from `recipe.cat`); inside each, craftable first, then by name. `Ready` hides recipes where `C.canCraft( r )` is false; a section with no rows is omitted.
- Row: 40u output render; line 1 `r.name` (t-body 600) and `×n` (`--ink-3`) when `r.out[ 1 ] > 1`; line 2 requirement chips:
  - Ingredient: 16u render + `have/need` (`inv.count( id )` / qty) — the ingredient name is in the chip's tooltip (hover shows the item tooltip).
  - Tool: the word for the tool kind: `cut` → `Blade`, `chop` → `Axe`, `saw` → `Saw`, `hammer` → `Hammer`, `pot` → `Pot`, `toolbox` → `Toolbox`, `canopener` → `Opener`, other kinds capitalised. Missing when `inv.hasTool( kind )` is false.
  - Station `fire`: `flame` icon + `Fire`, missing when `game.nearFire?.( player.pos )` is false.
  - Liquid: `water` or `fuel` icon + `0.1 L`, missing when `C.liquidAvailable( kind ) < litres`.
  - `special: 'boil'`: one `water` chip with the boilable litres from `C.boilable()`, missing when 0.
- `Craft` (`.btn.sm`, `.primary` when craftable) calls `C.craft( r )` and closes the screen so the action ring is visible (existing).
- **Removed:** `Crafting is not available.`, `No recipes.`, the comma list `2× Rag, … · knife · at a fire`, `recipe.desc`.

### 6.13 Catalog tab (creative)

- `.search` 32 h full width, placeholder `Search`, the filtered count at its right (`412`, tnum `--ink-3`). Focused when the tab opens.
- Category chips 8u below: one `.seg` row (`All`, then `CATEGORY_LABEL` names), horizontally scrollable, no wrap.
- 6-across cell grid 12u below, up to 400 cells (existing cap). Click gives 1, Shift-click gives a full stack, drag places (existing).
- **Removed:** `Search items…`, `412 items · click to take one, Shift-click for a full stack, or drag`, `Nothing matches.`

### 6.14 Tooltip

`.pop.tip`: a dark box, 260u wide (DayZ): the name in caps, the category line, the item's one-line description (`d.desc`, two lines at most), then rows for condition (in its colour), the item's values, quantity, wetness and temperature. Opens 250 ms after the pointer rests on a cell, 12u right/below the cursor, flipped to stay 8 px inside the viewport; hidden while dragging.

```
┌──────────────────────────────┐
│ M4A1 CARBINE ×2              │  .ttl condensed caps --ink-1 (displayName, ×qty when qty > 1)
│ FIREARM · 5.56               │  .meta t-label --ink-3: category · (calibre | slot | liquid)
│ Gas-operated carbine.        │  .desc --ink-2, clamped to 2 lines
├──────────────────────────────┤  hr, full bleed
│ Condition              Worn  │  .kv rows, 20 h: label --ink-3 / value tnum --ink-1 (condition word in its colour)
│ Loaded                31/30  │
│ Damage             34  +6    │  compare delta: .d.up --good / .d.down --alarm, 6u left margin
│ Rate              800 rpm    │
│ Red dot · Suppressor         │  attachments line, --ink-2
│ Quantity 2/5 · Wetness Damp  │  stackables; Damp / Wet / Soaked in blue; Temperature Hot in red
│ Raw · Sealed                 │  .flags line, --warn (Spoiled in --alarm)
├──────────────────────────────┤
│ 3.40 kg              Size 4  │  .foot: weight (2 decimals) left, size right, --ink-2 tnum
└──────────────────────────────┘
```

Rows by category (only non-zero rows render):

| Category | Meta after the category | Rows | Flags |
|---|---|---|---|
| Firearm | calibre | Condition, Loaded `31/30` (`ammoOf` / mag or internal capacity), Damage (`damage × pellets`), Rate `800 rpm`, Modes `Semi · Auto`, Range `400 m`, attachments line | |
| Magazine | calibre | Rounds `18/30` | |
| Ammo | calibre | | |
| Melee | | Condition, Damage, Speed `1.4/s`, Reach `1.2 m` | |
| Clothing, backpack | slot name (6.3) | Condition, Storage, Insulation %, Bite %, Ballistic %, Waterproof % | |
| Food | | Food `+13` (`kcal / 20`), Water `+40`, Freshness `72%` | Raw, Sealed, Spoiled |
| Drink | | Water `+50`, Food `+5` when it has kcal | Alcohol |
| Medical | | Bleeding `−1`, Health `+20`, Infection `−60%`, Blood `+500 ml` | Splint |
| Tool | liquid name when filled | Condition, Battery `72%`, Contents `0.8 L water` or `Empty`, Fuel `4.2 L` | |

- **Compare:** when the hovered item is clothing, a backpack or a firearm/melee weapon and would replace an occupied slot (`inv.equip[slot]` / `inv.weapons[slot]`), numeric rows show the delta against the worn item: `Storage 8 +2`. Equal values show no delta.
- No rarity, no `Double-click: …` hint; weight and size sit in the footer, calibre, slot and liquid in the category line.
- **Empty-slot tooltip:** `.ttl` only (the slot name).

---

## 7. Status (`UI.journal()`, the `log` key)

A 560u panel on the scrim: head `STATUS` with `DAY 4` and close; then `CONDITIONS` (only when any), `BODY`, `SKILLS`
(only those practised), `THIS LIFE`, `ALL LIVES`. No sentences.

- Condition rows 40 h: kind-coloured glyph, label, a value where one applies (`35.4°`, `58%`, `11.2 kg`, a moodle's
  level), and a 1–2 word remedy at the right, white when a matching item is carried, grey otherwise (`REMEDY` in
  `UI.js`: Bandage, Splint / Rest, Antibiotics, Charcoal, Warm clothes / Fire, Shade, Shelter, Saline, Sleep, Drop
  weight, Rest / Comfort / Read for moodles, Vinegar, Antihistamine, Aloe, Burn cream, Disinfect, Clean bandage,
  Cough syrup, Sling, Eye drops).
- Body table: Health, Food, Blood, Water, Body, Energy, Air, Stamina, Wet, Weight, coloured by the HUD thresholds
  (Body blue when cold). This life: Survived (`fmtDur`), Kills, Distance, Looted. All lives: Lives, Kills.
- Esc or the `log` key closes.

---

## 8. Map and minimap

### 8.1 Full map (`MapUI`, `map.css`)

A paper map that fills the window, with the controls on dark strips:

- **Title** top left: the place (`ui.locationName( pos, true )` before its first comma) in caps, then island · time
  (watch rule) · `DAY N`. **Close** top right with the Map key cap. **Tools** on the right edge: Zoom in (+), Zoom
  out (−), Centre (C), All islands, Layers (Roads, Buildings, Grid, Markers, Vehicles toggles), Markers (the list,
  with a count). **Scale bar** bottom left in dark ink; **cursor readout** bottom right: `x, z · elevation m · distance`.
- **Canvas:** user markers are small dark squares edged in paper with their name in dark condensed caps beside them;
  `/locate` markers open squares; the death marker a red skull; known vehicles a dark car glyph; the player a white
  arrow on a dark disc with a faint ink view cone. The grid is 1 km (250 m close up) in faint ink.
- **Where you are** follows the game's rules. With `realisticMap` off (Options › Gameplay › Map and compass:
  Always), or in creative, the map opens centred on you and shows the arrow. With it on (Need item) the map needs
  `map_hawaii` to open at all and, like DayZ's, shows you only while you carry a **GPS with charge left**; without one
  there is no arrow, the title reads `Hawaiian Islands`, Centre and C do nothing, the readout and the marker list
  leave out distances, and the map opens where it was last left (all the islands the first time). Picking up or
  running down a GPS updates it within half a second.
- **Interaction:** drag pans, the wheel zooms at the cursor, W A S D / arrows pan, + / − zoom ×1.5, C centres;
  double-click adds a numbered marker; right-click on a marker: Rename, Remove; on the map: Add marker (and Teleport
  in creative, also Shift-click). The marker list: death first, then by distance; click centres, double-click or F2
  renames, Del removes, `Clear` keeps the death marker. Esc or the Map key closes (a popover first).
- A faint brown edge around the window reads as the edge of the sheet; the toasts move under the title.

### 8.2 Palette (`maptile.js`, `MapView.js`)

Printed-map colours, retuned from the old relief; the renderer is unchanged (worker tiles at 64, 16 and 4 m per
pixel, the coarse level preloaded, finer tiles fading in over 200 ms, vectors bucketed by cell).

| Layer | Look |
|---|---|
| Land | cream paper `#ECE5CF`; scrub and wet ground pale green tints; lava grey-brown; sand at the shore; snow near white; built-up ground a darker grey-beige |
| Relief | a soft hillshade from the north-west (0.8–1.06) |
| Contours | brown, every 25 m (stronger every 100 m), about a pixel wide where a pixel can hold one |
| Coastline | a thin dark blue-grey line at sea level |
| Sea | muted blue-greys a few steps apart from the reef to the deep channel; the deepest stop `#89AABD` is also the out-of-world fill (`INK.void`, `.map-screen`) |
| Freeways | a muted red line cased in dark ink |
| Highways | pale cream cased in dark ink |
| Streets | pale lines (they read on the darker built-up ground), real width close up |
| Dirt tracks | dashed dark brown |
| Buildings, runways | dark grey-brown footprints |
| Names | Roboto Condensed with a paper-coloured halo: metros and towns in dark caps, islands in widely tracked caps, water in blue-grey italics, peaks (with a summit mark) brown, other places dark, areas grey italics |

Label sizes and halos are multiplied by `opts.u`; names never overlap each other, the player, the markers or the
controls, and a name cut by the edge is not drawn.

### 8.3 Minimap

A setting (5.7), off by default: the same tiles, heading-up, no names.

---

## 9. Chat and commands (`Chat.js`, `chat.css`)

- **Top left**, like DayZ's, under the toast lines (top 144u; lower while the debug block is up), 460u wide.
- **Closed:** the last six lines, plain white text, each on a faint dark wash that fades out to the right; each line
  fades after 8 s and then leaves the flow, so new lines start at the top. `sys` lines grey, `cmd` echoes in
  JetBrains Mono, `err` on a red wash.
- **Open** (T, or / with a slash): the whole log on a dark panel (300u, scrolls; Page Up / Down), the input under it
  (mono while the value starts with `/`), then up to eight suggestions under the input (command and arguments in mono,
  a short description at the right). The best match is ghosted after the caret: Tab takes it, ↑/↓ walk the list (or
  the history from an empty line), Enter runs (a picked suggestion completes first), Esc closes. The open column runs
  to the bottom edge, so at a large GUI scale the log shrinks rather than push the input off screen.
- The closed log hides under screens, with Hide HUD and when dead.

---

## 10. Title screen and credits (`Menus.title`, `Menus.about`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  (the live title camera, VISTAS in main.js, darkened from the left and at the edges)     │
│                                                                                          │
│  D E A D T I D E                .wordmark 96u, left 120, top 104                         │
│                                                                                          │
│                                                                                          │
│ ▌CONTINUE   Honolulu run · Day 12      entries 46u: condensed caps 26u, grey; the         │
│  WORLDS                                highlighted one white with a thin white bar        │
│  OPTIONS                                                                                 │
│  CREDITS                               bottom 112                                v0.1   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Entries: `CONTINUE` (the last living world, with `name · Day N`) or, when there is none, `NEW WORLD`; then
  `WORLDS`, `OPTIONS`, `CREDITS`. (A browser tab cannot close itself, so there is no Exit.)
- One highlight shared by the pointer and the keyboard: ↑/↓ wrap, Enter runs, the first entry starts highlighted;
  `ui_hover` on hover. Returning from a screen highlights the entry that opened it.
- Backdrop: a radial vignette plus a gradient from the left (`menus.css`); the panels opened from the title use the
  same one (`.screen.bare`), so swapping between them never flashes, and sit on a darker panel (`.8`).
- Below 760 px of height the name and the entries close up (72u margins).
- **Credits** (`about()`): a 600u panel, a key–value list: Version, Terrain, Scale, Textures, Sounds, Characters,
  Interface basis (link), Engine, Fonts (`Roboto, Roboto Condensed, JetBrains Mono (Google Fonts)`).

---

## 11. Worlds, new world, world details

### 11.1 Worlds (`Menus.worlds`)

An 880u panel (up to 640u tall, then the list scrolls): head `WORLDS` with `IMPORT` and `NEW WORLD`, close; rows
72 h; foot `PLAY` (disabled when nothing is selected or the world is dead).

- Row: 96 × 54 thumbnail (black ones are replaced by a dark placeholder; grayscale when dead); the name in condensed
  caps; tags `EASY` / `NORMAL` / `HARD` or `CREATIVE`, then `HARDCORE`, `DEAD` in red; `Day N · play time · last
  played`. Row actions on hover or selection: Details, Duplicate, Export, Delete (red on hover; confirm `Delete
  “Name”?`).
- Keyboard: ↑/↓ select, Home / End, Enter or double-click plays, F2 details, Del deletes, N new world, Esc back.
- No worlds: only a centred `NEW WORLD` button. A world file dropped anywhere on the screen imports it (the panel
  outlines white while dragging); toasts `Imported` or the short error (`Newer version`, `Not a world file`).

### 11.2 New world (`createWorld( back )`)

A 600u panel `NEW WORLD`, option rows: Name (focused, selected), Seed (mono, placeholder `Random`), Mode (Survival /
Creative), Difficulty (Easy / Normal / Hard), Hardcore (toggle, off and disabled in Creative), Day length (24 / 48 /
96 / 144 `MIN`), Start time (07:30 / 12:00 / 17:30 / 21:00), Spawn (select: Random and the seven islands). Foot
`CANCEL` and `CREATE`. Enter creates, Esc goes back to where it was opened from (the world list, or the title's `NEW
WORLD`).

### 11.3 World details (`editWorld`)

A 600u panel `WORLD`: Name, Seed (mono + Copy, toast `Copied`), then a stats table (Created, Played, Day, Distance,
Kills, Deaths). Foot: `DELETE` (danger) at the left; `DUPLICATE`, `EXPORT`, `SAVE`.

---

## 12. Options (`Menus.options`)

### 12.1 Frame

```
┌ OPTIONS ──────────────────────────────────────────────────────────── (✕) ┐  860 × 680u at most, fixed size
│ GRAPHICS  INTERFACE  AUDIO  CONTROLS  KEYS  GAMEPLAY                     │  flat caps tabs, the open one underlined
├──────────────────────────────────────────────────────────────────────────┤
│ DISPLAY                                                                  │  section heads in caps over a line
│ GUI scale                         ━━━━━━■─────────────   100%            │  rows 40 h, the hovered row lit
│▪HUD                                         [AUTO|ALWAYS]   ↺            │  ▪ changed from its default, ↺ resets it
├──────────────────────────────────────────────────────────────────────────┤
│ [RESET TAB]                                                     [DONE]   │
└──────────────────────────────────────────────────────────────────────────┘
```

- The tabs start focused; ←/→ switch them. The last tab is remembered (`this._optTab`).
- `RESET TAB` asks `Reset <Tab>?` (Keys: `Reset keys?`) and restores that tab's keys (`TAB_KEYS`; Graphics through
  `applyPreset( DEFAULTS.quality )`; Keys `DEFAULT_BINDINGS`).
- `DONE` and Esc return to the caller (title or pause). Changes apply live. In game the screen sits on the scrim;
  from the title on the title's backdrop.

### 12.2 Tabs and rows

**Graphics** — Quality: Preset (Low / Medium / High / Ultra, and a disabled Custom shown when any preset key
differs). View: Render distance (0.4–4 km, on release), Field of view (50–90°), Resolution (50–150%, on release).
Detail: Shadows, Terrain, Vegetation, Grass, Clouds, Water. Image: Anti-aliasing (Off / FXAA / MSAA / TAA), Ambient
occlusion, Bloom, Sun shafts, Lens flare, Motion blur, Exposure (±2 EV), Night brightness. Preset-controlled rows
compare against the chosen preset, so picking Low does not mark every row.

**Interface** — Display: GUI scale (70–160%, on release), HUD (Auto / Always), Crosshair (Dot / Dynamic / None).
HUD: Compass bar, Minimap, Ammo counter, Location card (DayZ shows none of these: off by default), Hit markers,
Damage direction, Prompts, Key hints, FPS.

**Audio** — Master, Effects, Ambience, Music, Interface (0–100%).

**Controls** — Sensitivity, Invert Y, Crouch / Aim / Sprint (Hold / Toggle), Head bob; then a Vehicles key
reference (Camera, Lights, Horn, Siren ×2, Handbrake, Climb / descend, Roll) from the current bindings.

**Keys** — 12.3.

**Gameplay** — Auto-pickup ammo; Map and compass (Always / Need item = `realisticMap`; see 8.1 and 5.2).

### 12.3 Keys

- A search field stays above its own scrolling list (Ctrl+F focuses it; Esc in a filled search clears it). It matches
  the start of a word in a label (`r` finds Right and Reload) or the name of a bound key (`f`, `shift`, `rmb`).
- Groups Movement, Actions, Hotbar, Menus, Vehicle. Each row: the label and two bindings, dark square cells with the
  key's name in condensed caps (`W`, `SHIFT`, the mouse glyph for LMB / RMB); the hotbar is one row of nine small
  cells; Pause is fixed (`ESC`).
- Click a cell to listen (white outline, blinking caret, the footer shows `[ESC] Cancel  [BACKSPACE] Clear`): the next
  key, mouse button or wheel binds it; Esc cancels; Backspace or Delete clears; a click elsewhere cancels.
- A key shared by two actions of the same kind (on foot or in a vehicle, unless both had it by default, or the
  handbrake and climb pair) outlines both cells red with a red corner mark; the title reads `Also: …`.
- Labels are the UI's (`KEY_LABELS`), else `BINDING_LABELS`.

---

## 13. Pause (`Menus.pause`)

Same language as the title: the world stays behind, darker. Top left `PAUSED` (56u condensed caps) and `NAME · DAY
N` under it; bottom left the entries `RESUME [ESC]`, `OPTIONS`, `SAVE` (toast `Saved`), `CREATIVE MODE` /
`SURVIVAL MODE` (not in hardcore; runs `/gamemode`), `MAIN MENU` (saves, then the title). Keyboard as the title; Esc
resumes. Saving runs inside an animation frame so the world list gets a real thumbnail.

---

## 14. Death (`Menus.death`)

DayZ: the screen fades to black (1.2 s), `YOU ARE DEAD` fades in in large white condensed caps (72u, tracking
settling from wide), then the stats and the buttons (about 2 s in):

```
                                   Y O U   A R E   D E A D

                              2 d 9 h          7          BLED OUT
                              SURVIVED       KILLS         CAUSE

                                    RESPAWN        MAIN MENU            (hardcore: WORLD OVER in red, MAIN MENU only)
```

- Sticky screen. Enter runs the first button (nothing is highlighted, so no focus ring greets it); ←/→ move the
  highlight.
- Survived `fmtDur( info.days * 24 )`; Kills `info.kills ?? g.stats.lifeKills`; Cause `causeTitle( info.cause )`.
- `RESPAWN` → `g.respawn()`, hide the screen, unpause, lock the pointer. `MAIN MENU` → `app.quit( ! hardcore )` then
  the title. A hardcore death stores the world as dead at once (inside a frame, so its thumbnail is the last view).
- **Cause** from `info.cause` (`CAUSES` in `Menus.js`):


| `info.cause` | Title |
|---|---|
| `blood loss` | Bled out |
| `starvation` | Starved |
| `dehydration` | Dehydrated |
| `hypothermia` | Hypothermia |
| `heat stroke` | Heat stroke |
| `drowning` | Drowned |
| `infection` | Infection |
| `injuries` | Injuries |
| `a fall`, `fall` | Fall |
| `a gunshot`, `bullet` | Shot |
| `an explosion`, `explosion` | Explosion |
| `fire`, `burn` | Burned |
| `bite`, `scratch` | Bitten |
| `melee` | Beaten |
| `animal` | Mauled |
| `vehicle` | Crash |
| `suicide` | Died |
| anything else | the text with a leading `a ` / `an ` removed, first letter capitalised |

---

## 15. Loader (`index.html`, `main.js` strings, `menus.css`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  D E A D T I D E          .loader-title: where the title's wordmark sits, same size       │
│                           (key art .loader-art under the title's own vignette)           │
│                                                                                          │
│  BUILDING TERRAIN                                  55%   .loader-status condensed caps   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░             .loader-bar 480u × 2 px, white  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Black, with the key art under the same vignette as the title; the name sits exactly where the title screen's
  wordmark lands, so the curtain lifts (600 ms) into the title without a jump. It drops at once when a world starts
  (`Menus._curtain()`), before the blocking build.
- Markup: `.loader-art-fallback`, `.loader-art`, `.loader-scrim`, `h1.loader-title`, `.loader-inner` (`.loader-row`
  with `.loader-status`, `.loader-pct`, `.loader-time`; `.loader-bar > .loader-fill`). `main.js status()` writes the
  status, percent, time (hidden by CSS) and `scaleX` of the fill; keep those selectors.
- Status words are the world's and `main.js`'s short steps (`Entering world`, `Spawning`), set in caps by CSS. Error
  (`#loader.tw-error`): the status in red, sentence case, wrapping (`Failed: …`); the fill red.

---

## 16. Dialogs, menu toasts, lock hint

| Call | Title | Verb |
|---|---|---|
| Delete world | `Delete “Name”?` | `Delete` (danger; Cancel focused) |
| Reset a settings tab | `Reset Graphics?` (the tab name) | `Reset` |
| Reset keys | `Reset keys?` | `Reset` |

Menu toasts: `Saved`, `Imported`, `Copied`, short errors. Lock hint: `Click to resume`. Map denied: toast `No map`.

---

## 17. Text

Player-facing text is short and plain: verbs for prompts and buttons (`Take`, `Respawn`, `Main menu`), a few words
for toasts (`Saved`, `No room`), labels of one or two words, numbers with units, no sentences of instruction, no
flavour text, no `!`. Source strings are sentence case; capitals come from CSS. (The string-by-string cut lists of
task #21 that used to be here are history; section 18 keeps the suggestions for module-owned text.)

---

## 18. moduleTextToTrim (for the lead; not edited by the UI)

Suggestions from task #21 for strings owned by game modules; some may have been applied since. Check the file before acting.

| File | Current | Suggested |
|---|---|---|
| `src/core/Settings.js` | `DEFAULTS.showFps: true` | `false` (the FPS plate is on in every screenshot) |
| `src/core/Settings.js` | `BINDING_LABELS` long forms (`Interact / pick up`, `Jump / vault`, `Walk (hold)`, `Fire / attack`, `Aim down sights`, `Quick melee / shove`, `Free look (hold)`, `Hold breath / zoom`, `Climb (air / boat)`, `Descend (air)`, `Survival journal`, `Debug overlay`, `Move forward`, `Strafe left`…) | optional: the UI overrides them (12.3) |
| `src/game/World.js` | `'Loading the islands'` · `'Starting world workers'` · `'Loading materials'` · `'Building terrain'` | `'Islands'` · `'Workers'` · `'Materials'` · `'Terrain'` |
| `src/game/Survival.js` `msg()` | `'You are bleeding'` · `'The wound looks infected'` · `'Your leg is broken — find a splint'` · `'Your stomach turns…'` · `'Salt water makes it worse'` · `'That water was bad'` · `'You threw up'` · `'You have a fever'` · `'Your leg has healed'` · `'You are freezing'` · `'You feel cold'` · `'You are overheating'` · `'You are starving'` · `'You are very hungry'` · `'You are dehydrated'` · `'You are very thirsty'` · `'You are exhausted — find somewhere to sleep'` | `'Bleeding'` · `'Infected'` · `'Broken leg'` · `'Nauseous'` · `'Salt water'` · `'Bad water'` · `'Vomited'` · `'Fever'` · `'Leg healed'` · `'Freezing'` · `'Cold'` · `'Overheating'` · `'Starving'` · `'Hungry'` · `'Dehydrated'` · `'Thirsty'` · `'Exhausted'`. Better: drop the toasts for bleed, infection, fracture, cold, hot and tired, because the HUD condition chip now shows its label for 6 s when it appears. |
| `src/game/Survival.js` `conditions()` | `'Infected wound'` | `'Infected'` |
| `src/game/Water.js` | sub `'Boil or distil it before drinking'` · sub `'Salty — it will make you thirstier'` · label `'Drink the rain'` + sub `'Slow, but clean'` · toast `'A few mouthfuls of rainwater'` | `'Unsafe'` · cut · `'Drink rain'`, cut · cut (the water cell rises with up chevrons) |
| `src/game/Bodies.js` | label `'Search your body'`, sub `` `${n} items` `` | `'Search body'`, `` `${n}` `` |
| `src/game/Game.js` | `"You can't sleep with the infected nearby"` · `"You aren't tired"` · `` `You slept ${hours} hours` `` · `'Saving failed: ' + e.message` | `'Infected nearby'` · `'Not tired'` · `` `Slept ${hours} h` `` · `'Save failed'` |
| `src/game/Commands.js` | `/help` line `'Tab completes names. Up/Down recalls earlier commands.'` | cut |
| `src/game/Commands.js` | `` `Game mode: ${m}` `` + `' — double-tap Space to fly, the inventory has an item catalog'` | `` `Game mode: ${m}` `` |
| `src/game/Commands.js` | `'This deletes everything you carry. Type /clear confirm'` · `'Flying needs creative mode (/gamemode creative)'` · `'Needs creative mode'` · `` `Unknown command /${name}. Type /help` `` · `'Cheats are disabled in hardcore worlds'` | `'Type /clear confirm'` · `'Creative only'` · `'Creative only'` · `` `Unknown: /${name}` `` · `'No cheats in hardcore'` |
| `src/game/Commands.js` | `` `A day now lasts ${m} minutes` `` · `` `Day ${d}, ${hour} (a day lasts ${n} min)` `` · `/kill` desc `'Die (respawn on a beach)'` | `` `${m} min per day` `` · `` `Day ${d} · ${hour}` `` · `'Die'`. Keep every command `desc` at 1–3 words: the chat suggestion list shows it. |
| `src/game/items/ItemUse.js` | `` `Heading ${deg}° ${cardinal}` `` · `` `${hour}, day ${d}` `` (watch and phone) · `` `Weather: ${state}. Change in ~${h} h` `` · `'Need a lighter or matches'` · `` `${name}: batteries dead` `` | `` `${deg}° ${cardinal}` `` · `` `${hour} · Day ${d}` `` · `` `${State} · ${h} h` `` · `'No lighter'` · `` `${name} dead` `` |
| `src/game/Crafting.js` | `'Need a lighter or matches'` · `'Need sticks or firewood'` · `` `${x} L clean water` `` | `'No lighter'` · `'No fuel'` · `` `+${x} L water` `` |
| `src/game/items/Fishing.js` | `'Need a fishing rod'` · `'Look at open water'` | `'No rod'` · `'Face water'` |
| `src/weapons/Hands.js` | `'No room, magazine dropped'` · `'No room, rounds dropped'` · `'No room, dropped'` | `'Mag dropped'` · `'Rounds dropped'` · `'Dropped'` |
| `src/weapons/Hands.js` | `'Jammed'` toast every 3 s while firing | keep, or drop: the HUD shows `JAM` and `[R] Clear` |

---

## 19. Implementation map and integration contract

### 19.1 Per file

| File | Owns |
|---|---|
| `ui.css`, `css/tokens.css`, `css/base.css`, `css/components.css` | Tokens, reset, type, shared components (2, 4) |
| `css/hud.css`, `HUD.js` | The HUD (5); the status panel's rows |
| `css/inventory.css`, `InventoryUI.js`, `CharacterPreview.js` | The inventory (6), the 3D survivor |
| `css/menus.css`, `Menus.js` | Title, credits, worlds, new world, details, options, keys, pause, death (10–14), the loader (15) |
| `css/map.css`, `MapUI.js`, `MapView.js`, `maptile.js`, `canvasIcons.js` | The map (8) and the minimap's tiles |
| `css/chat.css`, `Chat.js` | Chat and commands (9) |
| `UI.js` | Screens, hotkeys, pointer lock, key hints, Status (7), confirm, menu toasts, place names |
| `widgets.js`, `dom.js`, `icons.js`, `itemIcons.js` | Controls (seg, toggle, slider, select, popMenu), helpers (`h`, `kc`, `fmt*`, `unitPx`), icons, item renders |
| `index.html` | Font links, the loader markup |
| `main.js` | `status()` strings, `--gui` |

### 19.2 Integration points that must keep working (grep before changing)

- `game.hands`: `aiming`, `ammoInfo() → { reserve, mode }` (`mode === 'jammed'`), `crosshairSpread()`, `viewFov()`, `held`, `select( stack )`, `holster()`, `loadMagazine`, `unloadMagazine`, `loadWeapon`, `unloadWeapon`, `insertMagazine`, `removeMagazine`, `attach`, `detach`.
- `game.vehicles.hud() → { name, speed, fuel, health, gear, kind, altitude?, heading } | null`, `vehicles.known()`, `vehicles.driving`.
- `game.items3d.near( pos, r )` / `remove( wi, { taken } )`, `game.dropStack( stack )`, `game.give( id, n )`.
- `game.itemUse.actions( stack ) → [ { label, run } ]`, `use( stack )`.
- `game.crafting`: `recipes`, `canCraft( r )`, `check( r )`, `craft( r )`, `liquidAvailable( kind )`, `boilable()`; `game.nearFire( pos )`; `inv.hasTool( kind )`.
- `game.markers`: `list()`, `add( { x, z, label, kind } )`, `remove( id )`, `clear()`; markers are plain objects, so rename is `m.label = value`.
- `game.creatures.stats()` (debug), `game.survival` fields used in 5.3 and 7, `conditions()`, `moodles()`, `maxStamina()`, `lastHitDir`, `envTemp`, `wet`.
- `game.interact.target { label, sub?, key?, hold? }`, `interact.holdT`; `game.actions.busy / progress / current { label, t, time }`.
- Events: `toast { text, kind, icon }`, `hitmarker { kill, headshot }`, `item:pick { stack }`, `item:drop`, `chat { text, kind }`, `container:changed`, `container:close`, `kill`.
- `ui.openContainer`, `ui.menus.title()` / `pause()` / `death( info )` / `createWorld( back )`, `ui.mapAllowed()`, `ui.closeScreen`, `ui.inventory.other`, `ui.map.open`, `ui.locationName( pos, long )`, `ui.announceSpawn`, `ui.showDeath`, `ui.blocking`, `ui.enterGame`, `ui.exitGame`, `ui.hideAll`, `ui.showTitle`, `ui.update`.
- Settings keys, among them the HUD toggles `compass`, `minimap`, `ammoCounter`, `locationCard` and `hudMode` (read with `?? 'auto'`), and `realisticMap`; `settings.get / set / on / applyPreset / resetAll`, `DEFAULTS`, `DEFAULT_BINDINGS`, `QUALITY_PRESETS`, `BINDING_LABELS`.
- Input: `input.label( action )`, `input.codes( action )`, `input.codePressed( code )`, `input.capture`, `input.lock() / unlock()`, `prettyCode( code )`.
- `--gui` on `<html>` (set by `main.js`) multiplies `--u`.
- Loader selectors `.loader-status`, `.loader-pct`, `.loader-fill`, `.loader-time`; classes `tw-hidden`, `tw-error`.

### 19.3 Performance

- No `backdrop-filter` anywhere; no blur.
- The HUD writes to the DOM only when a formatted value or class changes: notifiers at 10 Hz, badges three times a
  second, the weapon readout every 4th frame, the vehicle every 3rd, the minimap every 2nd, the compass transform
  every frame.
- The character preview renders only while the inventory is open, into one small render target.
- The map redraws only when its view, the player, a marker, a layer or a tile changes (`_sig`); tiles render in the
  world workers; the minimap and the map share `MapView` and its tiles.

### 19.4 Verification

- UI harness: `test/preview/ui.html` + `ui.js` mount the real UI on a stubbed game (`?screen=` title, worlds, new,
  edit, options, keys, about, pause, death, inventory, loot, craft, catalog, map, status, chat, confirm, hud, kit;
  `?hud=` states; `?bg=` backgrounds; `?gui=`). Its page links only Inter and JetBrains Mono: add the Roboto link
  (as `index.html` has it) when judging type.
- Full game: `test/preview/hud-session.mjs` (any viewport) or `session.mjs`; check 1920 × 1080 and 1280 × 720, GUI
  70% and 160%, and one 4K shot, with no `src/ui` error logged.

---

## 20. Acceptance criteria

Each item is a yes/no check against the running game or the harness.

### Global

- [ ] Every size is `calc(N * var(--u))` or a 1 px hairline. At GUI 70% and 160% every screen scales and nothing
  overflows at 1280 × 720 (panels may scroll inside, never the page); 4K stops at 1.5 px per u.
- [ ] Colour only as white and greys plus `--warn`, `--alarm`, `--cold`, `--good` (and the item condition and wet /
  hot tints). No orange (`grep -rni "ff7a2e\|orange" src/ui/css` finds only the tokens comment).
- [ ] Square corners: every `border-radius` is a token (0, or 2 px on key caps) or a circle.
- [ ] No `backdrop-filter`; no Inter in any visible text; JetBrains Mono only for seeds, chat commands and debug.
- [ ] Headers, labels, buttons, tabs and menu entries are Roboto Condensed caps; reading text is Roboto.
- [ ] Keyboard focus is visible on every control; Esc closes the top screen everywhere.
- [ ] `prefers-reduced-motion` removes slides and blinks.

### HUD

- [ ] Idle at full health on foot: the dot crosshair and the notifiers with the stance, nothing else (no minimap,
  compass, ammo counter or location card unless switched on).
- [ ] Low food is a yellow notifier, critical water a blinking red one, a cold body a blue one; eating shows green up
  arrows; bleeding shows a red down arrow on blood, the bleeding badge with its count, its caption for 4 s, and
  `[K] Bandage` while a bandage is carried.
- [ ] The stamina bar shows only while not full and flashes when nearly spent.
- [ ] Looking at loot shows `CANNED TUNA ×2` on a dark strip and `[F] Take` under it, right of the crosshair.
- [ ] With the ammo counter off, switching weapons shows the name and mode for a moment; a jam shows `JAM` and
  `[R] Clear`. On, rounds / spare and the mode stay.
- [ ] A compass in the hands shows the compass bar even with the setting off.
- [ ] Toasts are plain lines top left; two identical within 2 s become one with `×2`; they stay visible over the map
  and the inventory.

### Inventory

- [ ] VICINITY | character with gear slots | INVENTORY (HANDS, then containers), the quickbar strip under them.
- [ ] Containers are grids of square cells; a rifle fills a long rectangle, a can one cell; condition tints the cell.
- [ ] The 3D survivor idles, turns with a drag, wears what is worn, and stops rendering when the screen closes.
- [ ] A drag outlines every valid target; the hovered one turns green (with the landing rectangle) or red with the
  reason chip; dropping on a refused target does nothing.
- [ ] Shift / Ctrl-click quick-move, Alt-click default action, hover + Del drop, hover + Space split, hover + 1–9
  bind, Ctrl+F search.

### Map

- [ ] Paper-toned land, muted water, brown contours, a thin coastline, dark condensed caps names; readable at every
  zoom; no hard tile edges.
- [ ] Markers are small dark squares (locate: open squares), death a red skull; add, rename, remove and list them.
- [ ] With Map and compass: Need item and no charged GPS, no player arrow, no place name, Centre disabled, no
  distances; with a GPS, all of them.

### Menus

- [ ] Title: `DEADTIDE` big top left, `CONTINUE` / `NEW WORLD`, `WORLDS`, `OPTIONS`, `CREDITS` bottom left, grey until
  highlighted (white + thin bar), `v0.1` bottom right; arrows and Enter work; the loader's name sits in the same spot.
- [ ] Worlds, new world, details, credits: flat square panels with caps titles; every action still works (play,
  import by button and by drop, export, duplicate, rename, delete with confirm, copy seed).
- [ ] Options: flat caps tabs, rows of label and control, the changed mark and per-row reset, `Reset tab`, every
  setting applies, key rebinding (listen, clear, cancel, conflicts, search) works; the HUD toggles are on Interface.
- [ ] Pause: `PAUSED`, world and day, `RESUME`, `OPTIONS`, `SAVE`, mode, `MAIN MENU`.
- [ ] Death: black, `YOU ARE DEAD` fading in, Survived / Kills / Cause, `RESPAWN` and `MAIN MENU` (hardcore: `WORLD
  OVER` and `MAIN MENU`); Enter runs the first.
- [ ] Chat top left on a faint wash; Status, confirm and menu toasts in the same flat style.

---

## 21. Outside UI scope: first-person arms (task #22)

Seen in s5 02, 05, 06, 07 and 08 and in every HUD render here (the renders reuse those frames). For the weapons view-model owner in `src/weapons`:

- The support hand does not grip the handguard. It floats under the rifle's front, palm up, fingers splayed flat like a paddle, with the wrist bent upward.
- The trigger hand sits on top of the receiver as a mitten instead of wrapping the pistol grip with the index finger on the trigger.
- The left forearm enters from the bottom centre of the screen at an unnatural angle instead of from the lower left toward the handguard.
- Both arms are untextured, flat saturated-orange cylinders with no shading, sleeve or wrist detail.
