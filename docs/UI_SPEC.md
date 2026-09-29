# Deadtide UI spec

This is the single source of truth for the UI redesign (task #21). It replaces `docs/ui/proposal-survival.md`, `proposal-cinematic.md` and `proposal-systems.md`; where they disagree with this file, this file wins.

- **Scope:** `src/ui/*` (UI.js, HUD.js, InventoryUI.js, Menus.js, MapUI.js, MapView.js, maptile.js, Chat.js, dom.js, itemIcons.js, ui.css), `index.html` loader markup, the `status()` strings in `src/main.js`. New UI files go under `src/ui/`.
- **Units:** every size is in **u**. 1u = 1 px at 1920 × 1080 with GUI scale 100%. Wireframes are drawn for that screen.
- **Reference renders** (built from the CSS and icon paths in this file, over HUD-free crops of the s5 screenshots): `docs/ui/spec-hud-damaged.jpg`, `spec-hud-vehicle.jpg`, `spec-inventory.jpg`, `spec-options.jpg`, `spec-title.jpg`, `spec-death.jpg`, and the icon sheet `spec-icons.png` (every icon at 48/24/16u).

---

## 0. Decision

| Proposal | Clarity (sun, night) | No fluff | Fits the realistic look | Covers every screen | Plain DOM/CSS | Consistency | Total /30 |
|---|---|---|---|---|---|---|---|
| Systems (precision product design) | 5: measured contrast on the worst backgrounds, plates, mocked | 4: keeps an "Inventory" title and a footer key legend | 4: graphite + one orange | 5 | 5: drop-in tokens, no blur on the HUD | 5 | **28** |
| Survival (hardcore) | 3: halo-only text over bright sky is not measured | 5 | 4: aqua accent matches the sea | 5 | 5 | 4 | 26 |
| Cinematic (minimal) | 3: halo only; minimap moved into foliage | 4: hero "DEAD", death sequence | 4: marker yellow | 5 | 3: ring gauges, conic masks, backdrop filters | 4 | 23 |

**Winner: Systems.** It is the only proposal that measured legibility over the actual scene (white sky, tropical sky, sand, foliage, night) and it ships a drop-in token block and a rendered icon set.

**Grafted in:**

- From Survival: vitals hidden while fine with **1–3 trend chevrons** (DayZ tiers); condition labels that **show only when a condition appears or escalates**; the `K Bandage` and `R Clear` contextual key caps; the weight meter with ticks at 18 kg and 30 kg (the real stamina and overload thresholds in `Survival.js`); **hover feedback before the drop** with a partial-fit chip; Tarkov inventory shortcuts (Ctrl-click, Alt-click, hover + Del, hover + Space); collapsible container sections; the changed-setting dot and per-row reset in Options; the Status screen's condition → remedy list; pickups merging; the pause menu's wrong `F1` label removed.
- From Cinematic: the prompt **to the right of the crosshair** with a **hold ring on the key cap**; the map **marker list** with distances and inline rename; tile fade-in and a preloaded coarse layer so the map never shows hard tile edges; hotbar **drop-to-bind**; the inventory **search filter**; the Keys filter that matches key names too; the desaturated death screen.
- From Systems as written: tokens, plates, `--u`, icons, compass heading tab, minimap footer, weapon panel (`31 ▮ 90`), vehicle panel, three-column inventory on the 56u grid with a **Hands** cell, tooltip rows, Options rail, cause-of-death titles, loader.

**Rejected:** ring-gauge vitals (hard to read numbers), minimap in the bottom-left (it sits over bright foliage), `hudMode: Minimal` and the F1 tap-peek (they change a binding people already use), label tiers and rarity edges, the inventory footer legend (key caps now sit in the context menu next to each action), a stance indicator (the camera height already shows it and the glyphs do not read at 16u), exposing `subtitles` and `units` (nothing in the game reads them yet), a UI low-health vignette (the renderer already grades `damage` and `lowBlood` in `Game.grade()`), `backdrop-filter` blur on panels (it re-samples the WebGL canvas every frame).

---

## 1. Principles

1. **Numbers, not words.** State is a value with a unit: `72`, `36.9°`, `31`, `1.2 km`, `3.5/40`. Words are for names and verbs only.
2. **Show on change.** A HUD element appears when its value matters or moves, then recedes after 3 s. Idle play shows the compass, the minimap and the held item.
3. **One accent, one alarm.** White ink on neutral graphite. Rescue orange `#FF7A2E` marks what you act on (selection, focus, markers, progress, primary button). Red `#FF5C5C` marks danger. Nothing else is saturated.
4. **Every HUD string sits on a plate.** Bare white text on the tropical sky measures 1.7:1. A 78% graphite plate keeps every HUD string at 5.9:1 or better on every background in the game, day and night. No blur anywhere on the HUD.
5. **Everything sits on the grid.** 4u base, one 56u cell for every item, fixed column widths. Layout never moves when content changes.

---

## 2. Tokens

The complete token and component CSS is in **2.8**; with the HUD CSS (5.13) and the screen CSS (22) it replaces today's `ui.css` entirely. Copy it verbatim; the tables below explain it.

### 2.1 Unit and GUI scale

```css
--u: calc(var(--gui) * clamp(0.75px, min(100vh / 1080, 100vw / 1600), 1.5px));
```

- `--gui` is still set on `<html>` by `main.js` from `guiScale`, so the GUI-scale option multiplies every size.
- `min(height/1080, width/1600)` keeps the 1104u inventory inside the window at any aspect ratio. The clamp keeps small windows readable (0.75 px at 960 × 540 or 1366 × 768) and stops 4K from getting huge (1.5 px).
- Every length in `ui.css` is `calc(N * var(--u))`. Hairlines stay `1px`; the 1.5 px selection strokes stay in px.
- `--tw-u` stays as an alias of `--u` until no rule uses it, then it is deleted.
- **Canvas code needs the unit in pixels.** `getPropertyValue('--u')` returns the unresolved `calc()` text, so add to `dom.js`:

```js
// px per u, measured: the custom property itself can't be read as a number
let _probe = null;
export function unitPx() {
	if ( ! _probe ) { _probe = document.createElement( 'div' ); _probe.style.cssText = 'position:absolute;visibility:hidden;width:calc(100 * var(--u))'; document.body.appendChild( _probe ); }
	return _probe.getBoundingClientRect().width / 100;
}
```

  Call it on `resize` and on the `guiScale` setting change, cache the result in `ui.u`, and multiply every canvas font size, line width and marker size by `ui.u` (and by `devicePixelRatio`, capped at 2, for backing-store sizes).

### 2.2 Colour

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0B0C0E` | Loader and title backdrop fallback |
| `--bg-1` | `#121316` | Stat-table cells, keycap text |
| `--bg-2` | `#1A1C20` | Inputs, bind buttons |
| `--bg-3` | `#23262B` | Selected segment thumb |
| `--m-hud` | `rgba(12,13,15,.78)` | **HUD plate**. No blur. |
| `--m-panel` | `rgba(16,17,20,.94)` | Panels (inventory, options, worlds, status, about). No blur. |
| `--m-pop` | `rgba(28,30,34,.98)` | Tooltip, context menu, popover, confirm, drag ghost |
| `--scrim` | `rgba(6,7,8,.6)` | Behind every modal screen |
| `--fill-1…4` | white at `.04 / .07 / .11 / .16` | Cell rest / hover / pressed / selected, button fills |
| `--line-1…3` | white at `.07 / .12 / .22` | Dividers / plate edge / strong edge and empty keycap |
| `--ink-1…4` | `#F2F3F5` `#B6BAC1` `#80858D` `#4B4F56` | Panel text: primary / secondary / labels / disabled only |
| `--hud-1`, `--hud-2` | white at `.96`, `.70` | HUD text: primary, secondary (lowest allowed on the HUD) |
| `--accent` | `#FF7A2E` | Selection, focus ring, held item, active hotbar slot, markers, progress, primary button |
| `--accent-hover` / `--accent-press` | `#FF8C47` / `#E8661A` | Primary button states |
| `--accent-soft` | `rgba(255,122,46,.16)` | Hovered valid drop target, selected row |
| `--accent-line` | `rgba(255,122,46,.56)` | Valid drop targets while dragging, selected row edge |
| `--on-accent` | `#140A04` | Text on accent, warn or alarm fills (never white) |
| `--warn` | `#FFC53D` | Low, worn, near full |
| `--alarm` | `#FF5C5C` | Critical, bleeding, damage, destructive, errors, death marker |
| `--cold` | `#8CCBFF` | Body temperature below 36.0° only |
| `--good` | `#6FD08C` | **Only** positive deltas in the tooltip comparison |
| `--tint-warn` / `--tint-alarm` / `--tint-cold` | `.16` / `.24` / `.16` of the hue | Plate tints for HUD states |

- Removed: aqua, sun, coral and green accents, blue-tinted greys, rarity colours (rarity is not shown anywhere), the orange section kickers.
- **Condition ramp** (replaces `condColor` in the UI; `ItemDB.condColor` stays for other callers): bar colour `--ink-2` at 50% or more, `--warn` below 50%, `--alarm` below 25%. The tooltip word comes from `condLabel()`.

### 2.3 Legibility rules

1. HUD text uses `--hud-1` or `--hud-2` only, always on a plate.
2. Status hues never colour HUD text smaller than 17u. They colour icons (16u or larger), bars (2 px or thicker), dots and plate tints. The number inside a tinted plate stays white.
3. Filled chips (`JAM`, drag chips, `TELEPORT`) use `--on-accent` text.
4. Panels sit on `--scrim`, so `--ink-3` holds 5.1:1. `--ink-4` never carries information.
5. Colour is never the only signal: every state also changes fill level, tint area, icon or blink.

### 2.4 Type

Google Fonts link in `index.html`:
`https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,500..600&family=JetBrains+Mono:wght@500;600&display=swap`

| Class | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `.t-label` | 11 / 14 | 600, uppercase via CSS, `case` feature | +0.06em | Section headers, fire mode, units after big numbers, island names, stat captions |
| `.t-body` | 13 / 18 | 500 (`.t-strong` 600) | −0.003em | Everything else: rows, buttons, prompts, toasts, values |
| `.t-title` | 17 / 24 | 600 (menu items 500) | −0.013em | Panel titles, title and pause menu items, location card name |
| `.t-num` | 28 / 28 | 600, tabular | −0.021em | Rounds loaded, vehicle speed, death stats |
| `.t-display` | 40 / 44 | 600 | −0.02em | Death cause only |
| `.t-mono` | 12 / 16 | 500, JetBrains Mono, tabular | 0 | Chat input when it starts with `/`, command suggestions, coordinates, seed, debug |
| `.t-micro` | 10 / 12 | 600, JetBrains Mono | 0 | Slot numbers in cells and hotbar |
| `.wordmark` | 56 / 56 | 600 | +0.30em | `DEADTIDE` on the title screen and loader only |
| key caps | 11 / 11 | 600, JetBrains Mono | 0 | `.kc` |

- Every number uses `font-variant-numeric: tabular-nums` so counters never jitter.
- Only item names and world names may truncate (one line, ellipsis).
- Source strings are sentence case. Uppercase only through `.t-label`.

### 2.5 Space and sizes

| Token | u | Token | u |
|---|---|---|---|
| `--s-1` | 4 | `--edge` (HUD inset) | 24 |
| `--s-2` | 8 | Keycap | 20 h, min 20 w, 5 side padding |
| `--s-3` | 12 | Small button, chip, small icon button | 24 h |
| `--s-4` | 16 | Segmented control | 28 h (segments 24) |
| `--s-5` | 24 | Button, input, icon button | 32 h |
| `--s-6` | 32 | Context menu row | 28 h |
| `--s-7` | 48 | Option row, title and pause menu row | 40 h |
| | | World list row | 72 h |
| | | Hotbar cell | 48 × 48, gap 4 |
| `--cell` | **56** | Item cell | **56 × 56, gap 4 (60 pitch)** |
| | | Toggle | 36 × 20 |

Grouping rhythm: 4–8u inside a group, 16u between groups, 24–32u between sections.

### 2.6 Radii, strokes, elevation, stacking

| Token | u | Use |
|---|---|---|
| `--r-xs` | 3 | Keycaps |
| `--r-sm` | 4 | Item cells, chips, stat tables, minimap map area |
| `--r-md` | 8 | HUD plates, buttons, inputs, popovers, menus |
| `--r-lg` | 12 | Panels |

- Hairline 1 px `--line-1` between rows and columns; plate edge `inset 0 0 0 1px var(--line-2)`.
- Selected cell or slot `inset 0 0 0 1.5px var(--accent)`. Focus ring `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` only.
- Icons: 1.5 stroke on a 24 grid (exactly 1 px at 16u).
- Shadows: plate `0 1px 2px rgba(0,0,0,.35)`; panel `0 24px 64px -16px rgba(0,0,0,.7)`; pop `0 12px 32px -8px rgba(0,0,0,.6)`.
- **No `backdrop-filter`** anywhere except the death screen (2.7).
- **Stacking inside `#ui.tw-root`:** `.hud` 1, `.chat` 2, `.lock` 3, `.screen` 10, `.feed` (toasts) 20, `.menu-toasts` 30, `.pop` 40, `.confirm` 50. The drag ghost is on `<body>` at 60.

### 2.7 Motion and timers

| Token | ms | Use |
|---|---|---|
| `--d-1` | 80 | Hover, press |
| `--d-2` | 160 | Toast, prompt, chip, popover in; segmented thumb; toggle |
| `--d-3` | 240 | Panel in (opacity 0 → 1, translateY 8u → 0); scrim; toast out |
| `--d-4` | 400 | HUD element fade-out, location card out |

- Easing: entries `cubic-bezier(0.2, 0, 0, 1)`, exits `cubic-bezier(0.4, 0, 1, 1)`.
- Timers: HUD linger 3 s after the last change; toast 3.5 s (`bad` 5 s); pickup 2.4 s; location card 3 s hold; condition label 6 s; tooltip delay 250 ms; key hint 20 s maximum.
- Only critical vitals blink (the icon, 1 Hz, 1 → 0.4 opacity, `steps(1)`), never a whole plate.
- `prefers-reduced-motion: reduce`: every animation and transition becomes an 80 ms opacity fade; no blink, no translate.
- Death screen: `backdrop-filter: grayscale(1) brightness(.55)` transitions in over 600 ms. It is the only backdrop filter in the UI.

### 2.8 Reference CSS

This block is the new top of `ui.css` (tokens, base, components). It was rendered to make the reference images, so the numbers are checked. Screen CSS follows it: the HUD in 5.13, everything else in 22.

```css
/* ---- tokens ------------------------------------------------------------------------------------ */
:root {
	--gui: 1;
	/* 1u = 1px at 1920x1080 and GUI 100%; follows the smaller of height/1080 and width/1600 so the 1104u inventory always fits */
	--u: calc(var(--gui) * clamp(0.75px, min(100vh / 1080, 100vw / 1600), 1.5px));
	--tw-u: var(--u);

	--bg-0: #0B0C0E; --bg-1: #121316; --bg-2: #1A1C20; --bg-3: #23262B;
	--m-hud: rgba(12, 13, 15, 0.78);
	--m-panel: rgba(16, 17, 20, 0.94);
	--m-pop: rgba(28, 30, 34, 0.98);
	--scrim: rgba(6, 7, 8, 0.6);
	--fill-1: rgba(255, 255, 255, 0.04); --fill-2: rgba(255, 255, 255, 0.07); --fill-3: rgba(255, 255, 255, 0.11); --fill-4: rgba(255, 255, 255, 0.16);
	--line-1: rgba(255, 255, 255, 0.07); --line-2: rgba(255, 255, 255, 0.12); --line-3: rgba(255, 255, 255, 0.22);
	--ink-1: #F2F3F5; --ink-2: #B6BAC1; --ink-3: #80858D; --ink-4: #4B4F56;
	--hud-1: rgba(255, 255, 255, 0.96); --hud-2: rgba(255, 255, 255, 0.70);
	--accent: #FF7A2E; --accent-hover: #FF8C47; --accent-press: #E8661A;
	--accent-soft: rgba(255, 122, 46, 0.16); --accent-line: rgba(255, 122, 46, 0.56); --on-accent: #140A04;
	--warn: #FFC53D; --alarm: #FF5C5C; --cold: #8CCBFF; --good: #6FD08C;
	--tint-warn: rgba(255, 197, 61, 0.16); --tint-alarm: rgba(255, 92, 92, 0.24); --tint-cold: rgba(140, 203, 255, 0.16);
	--halo: 0 0 2px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.6);

	--font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
	--mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

	--s-1: calc(4 * var(--u)); --s-2: calc(8 * var(--u)); --s-3: calc(12 * var(--u)); --s-4: calc(16 * var(--u));
	--s-5: calc(24 * var(--u)); --s-6: calc(32 * var(--u)); --s-7: calc(48 * var(--u));
	--edge: calc(24 * var(--u));
	--r-xs: calc(3 * var(--u)); --r-sm: calc(4 * var(--u)); --r-md: calc(8 * var(--u)); --r-lg: calc(12 * var(--u));
	--cell: calc(56 * var(--u)); --gap: calc(4 * var(--u)); --hot: calc(48 * var(--u));

	--d-1: 80ms; --d-2: 160ms; --d-3: 240ms; --d-4: 400ms;
	--ease-out: cubic-bezier(0.2, 0, 0, 1); --ease-in: cubic-bezier(0.4, 0, 1, 1);

	--sh-plate: 0 1px 2px rgba(0, 0, 0, 0.35);
	--sh-panel: 0 24px 64px -16px rgba(0, 0, 0, 0.7);
	--sh-pop: 0 12px 32px -8px rgba(0, 0, 0, 0.6);
}

/* ---- base -------------------------------------------------------------------------------------- */
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--bg-0); }
#app { position: fixed; inset: 0; }
#app canvas { display: block; outline: none; touch-action: none; width: 100%; height: 100%; }
.tw-root { position: fixed; inset: 0; z-index: 100; pointer-events: none; font: 500 calc(13 * var(--u)) / calc(18 * var(--u)) var(--font); letter-spacing: -0.003em; color: var(--ink-1); font-optical-sizing: auto; -webkit-font-smoothing: antialiased; user-select: none; }
.tw-root *, .tw-root *::before, .tw-root *::after { box-sizing: border-box; }
.tw-root [hidden] { display: none !important; }
:where(.tw-root) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; }
:where(.tw-root) :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
:where(.tw-root) :focus:not(:focus-visible) { outline: none; }
.tnum { font-variant-numeric: tabular-nums; }

.t-label { font: 600 calc(11 * var(--u)) / calc(14 * var(--u)) var(--font); letter-spacing: 0.06em; text-transform: uppercase; font-feature-settings: 'case'; }
.t-body { font: 500 calc(13 * var(--u)) / calc(18 * var(--u)) var(--font); letter-spacing: -0.003em; }
.t-strong { font-weight: 600; }
.t-title { font: 600 calc(17 * var(--u)) / calc(24 * var(--u)) var(--font); letter-spacing: -0.013em; }
.t-num { font: 600 calc(28 * var(--u)) / 1 var(--font); letter-spacing: -0.021em; font-variant-numeric: tabular-nums; }
.t-display { font: 600 calc(40 * var(--u)) / calc(44 * var(--u)) var(--font); letter-spacing: -0.02em; }
.t-mono { font: 500 calc(12 * var(--u)) / calc(16 * var(--u)) var(--mono); font-variant-numeric: tabular-nums; }
.t-micro { font: 600 calc(10 * var(--u)) / calc(12 * var(--u)) var(--mono); }
.wordmark { margin: 0; font: 600 calc(56 * var(--u)) / 1 var(--font); letter-spacing: 0.3em; margin-right: -0.3em; color: var(--ink-1); }

/* icons: 24 grid, stroke 1.5 → exactly 1px at 16u */
.i { width: calc(16 * var(--u)); height: calc(16 * var(--u)); flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.i.i24 { width: calc(24 * var(--u)); height: calc(24 * var(--u)); }
.i.i12 { width: calc(12 * var(--u)); height: calc(12 * var(--u)); }

/* ---- HUD plate ----------------------------------------------------------------------------------- */
.plate { background: var(--m-hud); border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--line-2), var(--sh-plate); color: var(--hud-1); }
.plate.warn { background: linear-gradient(var(--tint-warn), var(--tint-warn)), var(--m-hud); }
.plate.alarm { background: linear-gradient(var(--tint-alarm), var(--tint-alarm)), var(--m-hud); }

/* ---- key cap ----------------------------------------------------------------------------------- */
.kc { display: inline-flex; align-items: center; justify-content: center; gap: 2px; flex: none; min-width: calc(20 * var(--u)); height: calc(20 * var(--u)); padding: 0 calc(5 * var(--u)); border-radius: var(--r-xs); background: var(--ink-1); color: var(--bg-1); font: 600 calc(11 * var(--u)) / 1 var(--mono); }
.kc .i { width: calc(12 * var(--u)); height: calc(12 * var(--u)); }
.kc.out { background: transparent; color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--line-3); }
.kc-hold { --p: 0; display: inline-flex; padding: calc(2 * var(--u)); border-radius: calc(5 * var(--u)); background: conic-gradient(var(--accent) calc(var(--p) * 1turn), var(--line-3) 0); }
.hint { display: inline-flex; align-items: center; gap: calc(6 * var(--u)); white-space: nowrap; }

/* ---- buttons ------------------------------------------------------------------------------------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); height: calc(32 * var(--u)); padding: 0 var(--s-4); border-radius: var(--r-md); background: var(--fill-2); color: var(--ink-1); font-weight: 500; white-space: nowrap; transition: background var(--d-1) var(--ease-out), color var(--d-1) var(--ease-out); }
.btn:hover { background: var(--fill-3); }
.btn:active { background: var(--fill-4); }
.btn.primary { background: var(--accent); color: var(--on-accent); font-weight: 600; }
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:active { background: var(--accent-press); }
.btn.danger { background: transparent; color: var(--alarm); }
.btn.danger:hover { background: var(--tint-alarm); }
.btn.ghost { background: transparent; color: var(--ink-2); }
.btn.ghost:hover { color: var(--ink-1); background: var(--fill-2); }
.btn.sm { height: calc(24 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); }
.btn.lg { height: calc(40 * var(--u)); padding: 0 var(--s-5); }
.btn.icon { width: calc(32 * var(--u)); padding: 0; background: transparent; color: var(--ink-2); }
.btn.icon:hover { background: var(--fill-2); color: var(--ink-1); }
.btn.icon.sm { width: calc(24 * var(--u)); height: calc(24 * var(--u)); }
.btn:disabled { opacity: 0.4; pointer-events: none; }

/* ---- segmented --------------------------------------------------------------------------------- */
.seg { display: inline-flex; gap: 2px; padding: 2px; height: calc(28 * var(--u)); border-radius: calc(7 * var(--u)); background: var(--fill-2); }
.seg > button { height: 100%; padding: 0 var(--s-3); border-radius: calc(5 * var(--u)); color: var(--ink-2); font-weight: 500; white-space: nowrap; transition: background var(--d-2) var(--ease-out), color var(--d-2) var(--ease-out); }
.seg > button:hover { color: var(--ink-1); }
.seg > button.on { background: var(--bg-3); color: var(--ink-1); box-shadow: inset 0 0 0 1px var(--line-2), 0 1px 2px rgba(0, 0, 0, 0.4); }
.seg > button:disabled { color: var(--ink-4); pointer-events: none; }
.seg.fill { display: flex; } .seg.fill > button { flex: 1; }

/* ---- toggle ------------------------------------------------------------------------------------ */
.toggle { position: relative; width: calc(36 * var(--u)); height: calc(20 * var(--u)); border-radius: 999px; background: var(--fill-4); transition: background var(--d-2) var(--ease-out); flex: none; }
.toggle::after { content: ''; position: absolute; left: calc(2 * var(--u)); top: calc(2 * var(--u)); width: calc(16 * var(--u)); height: calc(16 * var(--u)); border-radius: 50%; background: var(--ink-2); transition: transform var(--d-2) var(--ease-out), background var(--d-2); }
.toggle.on { background: var(--accent); }
.toggle.on::after { transform: translateX(calc(16 * var(--u))); background: #fff; }

/* ---- slider (input[type=range].slider, --p = fill percent) ------------------------------------------- */
.slider { -webkit-appearance: none; appearance: none; width: calc(200 * var(--u)); height: calc(20 * var(--u)); margin: 0; background: transparent; cursor: pointer; --p: 50%; }
.slider::-webkit-slider-runnable-track { height: 2px; border-radius: 1px; background: linear-gradient(90deg, var(--accent) var(--p), var(--fill-3) var(--p)); }
.slider::-webkit-slider-thumb { -webkit-appearance: none; width: calc(14 * var(--u)); height: calc(14 * var(--u)); margin-top: calc(1px - 7 * var(--u)); border-radius: 50%; background: var(--ink-1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.slider::-moz-range-track { height: 2px; background: var(--fill-3); }
.slider::-moz-range-progress { height: 2px; background: var(--accent); }
.slider::-moz-range-thumb { width: calc(14 * var(--u)); height: calc(14 * var(--u)); border: 0; border-radius: 50%; background: var(--ink-1); }
.val { width: calc(56 * var(--u)); text-align: right; color: var(--ink-2); font-variant-numeric: tabular-nums; }

/* ---- input ------------------------------------------------------------------------------------- */
.input { height: calc(32 * var(--u)); padding: 0 var(--s-3); border: 0; border-radius: var(--r-md); background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line-2); color: var(--ink-1); font: inherit; outline: none; }
.input:focus { box-shadow: inset 0 0 0 1px var(--accent); }
.input::placeholder { color: var(--ink-3); }
.search { position: relative; display: flex; align-items: center; }
.search > .i { position: absolute; left: var(--s-3); color: var(--ink-3); pointer-events: none; }
.search > .input { width: 100%; padding-left: calc(36 * var(--u)); }
.search > .count { position: absolute; right: var(--s-3); color: var(--ink-3); }

/* ---- chips --------------------------------------------------------------------------------------- */
.chip { display: inline-flex; align-items: center; gap: calc(6 * var(--u)); height: calc(24 * var(--u)); padding: 0 var(--s-2) 0 calc(6 * var(--u)); border-radius: var(--r-sm); background: var(--fill-2); color: var(--ink-2); white-space: nowrap; }
.chip.req { height: calc(20 * var(--u)); padding: 0 calc(6 * var(--u)) 0 2px; gap: var(--s-1); }
.chip.req img { width: calc(16 * var(--u)); height: calc(16 * var(--u)); object-fit: contain; }
.chip.miss { color: var(--alarm); }
.chip-drag { position: absolute; display: inline-flex; align-items: center; height: calc(20 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); transform: translate(-50%, -100%); pointer-events: none; }
.chip-drag.bad { background: var(--alarm); } .chip-drag.part { background: var(--warn); }

/* ---- meter ------------------------------------------------------------------------------------- */
.meter { position: relative; height: 2px; border-radius: 1px; background: var(--fill-3); overflow: hidden; }
.meter > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink-2); }
.meter.warn > i { background: var(--warn); } .meter.alarm > i { background: var(--alarm); }

/* ---- panel ------------------------------------------------------------------------------------- */
.screen { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: var(--scrim); animation: fade-in var(--d-3) var(--ease-out); }
@keyframes fade-in { from { opacity: 0; } }
.panel { display: flex; flex-direction: column; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); border-radius: var(--r-lg); background: var(--m-panel); box-shadow: inset 0 0 0 1px var(--line-2), var(--sh-panel); overflow: hidden; animation: panel-in var(--d-3) var(--ease-out); }
@keyframes panel-in { from { opacity: 0; transform: translateY(calc(8 * var(--u))); } }
.panel-head { display: flex; align-items: center; gap: var(--s-3); height: calc(56 * var(--u)); padding: 0 var(--s-3) 0 var(--s-5); border-bottom: 1px solid var(--line-1); flex: none; }
.panel-head .t-title { flex: 1; min-width: 0; }
.panel-body { flex: 1; min-height: 0; overflow: auto; padding: var(--s-4) var(--s-5); }
.panel-foot { display: flex; align-items: center; gap: var(--s-2); height: calc(56 * var(--u)); padding: 0 var(--s-5); border-top: 1px solid var(--line-1); flex: none; }
.panel-foot .sp { flex: 1; }

.sec-head { display: flex; align-items: center; gap: var(--s-2); height: calc(32 * var(--u)); color: var(--ink-3); }
.sec-head .t-label { flex: 1; }
.sec-head .meta { color: var(--ink-2); font-variant-numeric: tabular-nums; }

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line-1); border-radius: var(--r-sm); overflow: hidden; }
.stats > div { display: flex; align-items: center; justify-content: space-between; height: calc(28 * var(--u)); padding: 0 var(--s-2); background: var(--bg-1); }
.stats > div > span:first-child { color: var(--ink-3); }
.stats > div > span:last-child { font-variant-numeric: tabular-nums; }

.row { display: flex; align-items: center; gap: var(--s-3); height: calc(40 * var(--u)); border-bottom: 1px solid var(--line-1); }
.row > .lab { flex: 1; min-width: 0; display: flex; align-items: center; gap: calc(6 * var(--u)); color: var(--ink-2); }
.row > .lab::before { content: ''; width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 50%; background: transparent; flex: none; margin-left: calc(-12 * var(--u)); }
.row.changed > .lab::before { background: var(--accent); }
.row > .ctl { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-3); width: calc(320 * var(--u)); }
.row > .rst { width: calc(24 * var(--u)); }

/* ---- item cell ----------------------------------------------------------------------------------- */
.cell { position: relative; width: var(--cell); height: var(--cell); border-radius: var(--r-sm); background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--line-1); transition: background var(--d-1); }
.cell:hover { background: var(--fill-3); box-shadow: inset 0 0 0 1px var(--line-3); }
.cell > img { position: absolute; left: 50%; top: 50%; width: calc(44 * var(--u)); height: calc(44 * var(--u)); transform: translate(-50%, -50%); object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); pointer-events: none; }
.cell > .q { position: absolute; right: calc(4 * var(--u)); bottom: calc(6 * var(--u)); font: 600 calc(11 * var(--u)) / 1 var(--font); font-variant-numeric: tabular-nums; color: var(--ink-1); text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9); }
.cell > .n { position: absolute; right: calc(4 * var(--u)); top: calc(3 * var(--u)); font: 600 calc(10 * var(--u)) / 1 var(--mono); color: var(--ink-3); }
.cell > .dot { position: absolute; left: calc(5 * var(--u)); top: calc(5 * var(--u)); width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 50%; background: var(--accent); }
.cell > .dot.spoiled { background: var(--alarm); }
.cell > .meter { position: absolute; left: calc(6 * var(--u)); right: calc(6 * var(--u)); bottom: calc(4 * var(--u)); }
.cell.empty { background: transparent; box-shadow: inset 0 0 0 1px var(--line-2); color: var(--ink-3); display: flex; align-items: center; justify-content: center; }
.cell.empty .i { width: calc(24 * var(--u)); height: calc(24 * var(--u)); }
.cell.w2 { width: calc(116 * var(--u)); } .cell.w3 { width: calc(176 * var(--u)); }
.cell.w2 > img, .cell.w3 > img { width: calc(100% - 16 * var(--u)); height: calc(44 * var(--u)); }
.cell.sel { box-shadow: inset 0 0 0 1.5px var(--accent); }
.cell.can { box-shadow: inset 0 0 0 1px var(--accent-line); }
.cell.over { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); }
.cell.deny { box-shadow: inset 0 0 0 1.5px var(--alarm); cursor: not-allowed; }
.cell.src { opacity: 0.32; }
.cell.dim { opacity: 0.25; }
.cell.spoiled > img { opacity: 0.5; }
.well { height: var(--cell); border-radius: var(--r-sm); box-shadow: inset 0 0 0 1px var(--line-2); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, var(--cell)); gap: var(--gap); }

/* ---- tooltip / popover / context menu ------------------------------------------------------------ */
.pop { position: fixed; border-radius: var(--r-md); background: var(--m-pop); box-shadow: inset 0 0 0 1px var(--line-2), var(--sh-pop); pointer-events: auto; animation: pop-in var(--d-2) var(--ease-out); z-index: 40; }
/* stacking inside .tw-root: .hud 1, .chat 2, .lock 3, .screen 10, .feed 20, .menu-toasts 30, .pop 40, .confirm 50; .drag-ghost (on body) 60 */
@keyframes pop-in { from { opacity: 0; transform: translateY(calc(-4 * var(--u))); } }
.tip { width: calc(240 * var(--u)); padding: var(--s-3); pointer-events: none; }
.tip .ttl { font-weight: 600; }
.tip .meta { color: var(--ink-3); margin-top: 2px; }
.tip hr { border: 0; border-top: 1px solid var(--line-1); margin: var(--s-2) calc(-1 * var(--s-3)); }
.tip .kv { display: flex; justify-content: space-between; gap: var(--s-2); height: calc(20 * var(--u)); align-items: center; }
.tip .kv > span:first-child { color: var(--ink-3); }
.tip .kv > span:last-child { font-variant-numeric: tabular-nums; }
.tip .d { margin-left: calc(6 * var(--u)); } .tip .d.up { color: var(--good); } .tip .d.down { color: var(--alarm); }
.tip .flags { color: var(--warn); }
.tip .foot { display: flex; justify-content: space-between; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.menu { min-width: calc(200 * var(--u)); max-width: calc(280 * var(--u)); padding: var(--s-1); }
.menu > button { display: flex; align-items: center; gap: var(--s-3); width: 100%; height: calc(28 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); text-align: left; }
.menu > button > span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu > button:hover, .menu > button.on { background: var(--fill-3); }
.menu > button.def > span:first-child { font-weight: 600; }
.menu > button.danger { color: var(--alarm); }
.menu > button .h { color: var(--ink-3); }
.menu > .sep { height: 1px; margin: var(--s-1) 0; background: var(--line-1); }

/* ---- toast / prompt ------------------------------------------------------------------------------- */
.toast { display: flex; align-items: center; gap: var(--s-2); height: calc(28 * var(--u)); max-width: calc(360 * var(--u)); padding: 0 var(--s-3) 0 calc(10 * var(--u)); white-space: nowrap; animation: toast-in var(--d-2) var(--ease-out); }
.toast > span { overflow: hidden; text-overflow: ellipsis; }
.toast > .x { color: var(--hud-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.toast > .sd { width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 50%; flex: none; }
.toast > .sd.warn { background: var(--warn); } .toast > .sd.bad { background: var(--alarm); }
.toast > img { width: calc(20 * var(--u)); height: calc(20 * var(--u)); object-fit: contain; margin-left: calc(-4 * var(--u)); }
.toast.out { opacity: 0; transition: opacity var(--d-3) var(--ease-in); }
@keyframes toast-in { from { opacity: 0; transform: translateX(calc(-8 * var(--u))); } }
.prompt { position: absolute; left: calc(50% + 28 * var(--u)); top: 50%; transform: translateY(-50%); display: grid; grid-template-columns: auto auto; column-gap: var(--s-2); align-items: center; max-width: calc(360 * var(--u)); padding: calc(6 * var(--u)) var(--s-3) calc(6 * var(--u)) calc(6 * var(--u)); }
.prompt > .lbl { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt > .sub { grid-column: 2; color: var(--hud-2); font-variant-numeric: tabular-nums; }
```

---

## 3. Icons

- **Grid:** 24 × 24 `viewBox`, 2u keyline (live area 20 × 20).
- **Style:** outline only, `fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round`. Filled shapes only where the markup says `fill="currentColor"` (mouse button half, player arrow), plus the filled marker diamond drawn on canvas.
- **Sizes:** 16u (inline, HUD, chips, buttons; stroke = 1 px), 24u (empty-slot glyphs, map tools), 12u (inside key caps, magazine glyph, collapse chevron), 10u (trend chevrons, stroke-width 2.5). Never in between.
- **Colour:** `--hud-1` / `--ink-1` by default; empty-slot glyphs `--ink-3`; state colours per 2.3.
- **Implementation:** replace `ICON` in `dom.js` with the table below. `icon( name, cls )` keeps its signature and renders `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">…</svg>`. `wind`, `bag`, `map` and `gear` are no longer used and are removed.
- **Item category fallbacks** (`itemIcons.js` `GLYPH`): keep the paths, change the stroke colour `#cfe6ee` → `#B6BAC1`.
- **Item renders** from `render/Icons.js` stay full colour everywhere.
- Rendered check: `docs/ui/spec-icons.png`.

### Status (vitals)

| Name | Use | Inner SVG markup (24 viewBox) |
|---|---|---|
| `health` | Health cell | `<path d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.2 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>` |
| `blood` | Blood cell; also condition `blood` (Low blood) | `<path d="M12 3.5c3 3.6 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.9 6-10.5Z"/>` |
| `food` | Food cell | `<path d="M6 3v5.5a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-1.8.9-3 3.4-3 6.5V13h3"/>` |
| `water` | Water cell (bottle) | `<path d="M9.5 3h5M10.25 3v2.5L8 8.25V19.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5V8.25L13.75 5.5V3M8 12.5h8"/>` |
| `temp` | Body temperature cell | `<path d="M14 14.3V5a2 2 0 0 0-4 0v9.3a4 4 0 1 0 4 0ZM12 17V9.5"/>` |
| `energy` | Energy cell; also condition `tired` | `<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>` |
| `stamina` | Status screen row only | `<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z"/>` |
| `breath` | Stamina bar swaps to breath underwater | `<circle cx="8.5" cy="15.5" r="3.25"/><circle cx="15.5" cy="8.5" r="3.75"/><circle cx="17" cy="18" r="1.75"/>` |

### Conditions (keyed by `Survival.conditions()` id)

| Name | Use | Inner SVG markup (24 viewBox) |
|---|---|---|
| `bleed` | `bleed` | `<path d="M10 3c2.4 2.9 4.8 5.8 4.8 8.4a4.8 4.8 0 0 1-9.6 0C5.2 8.8 7.6 5.9 10 3ZM18 13c1.1 1.4 2.2 2.7 2.2 3.9a2.2 2.2 0 0 1-4.4 0c0-1.2 1.1-2.5 2.2-3.9Z"/>` |
| `frac` | `frac` (broken and splinted) | `<path d="M7.2 15.3 10.5 12M13.5 12l3.3-3.3M10.5 12l1.2-2 .6 2.6 1.2-.6"/><path d="M7.2 15.3a2 2 0 1 0-2.4 2.4 2 2 0 1 0 1.5 1.5 2 2 0 1 0 .9-3.9ZM16.8 8.7a2 2 0 1 0 2.4-2.4 2 2 0 1 0-1.5-1.5 2 2 0 1 0-.9 3.9Z"/>` |
| `inf` | `inf` | `<circle cx="12" cy="12" r="4"/><path d="M12 8V5.5M12 18.5V16M15.46 10l2.17-1.25M6.37 15.25 8.54 14M15.46 14l2.17 1.25M6.37 8.75 8.54 10"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="18.93" cy="8" r="1.5"/><circle cx="5.07" cy="16" r="1.5"/><circle cx="18.93" cy="16" r="1.5"/><circle cx="5.07" cy="8" r="1.5"/>` |
| `sick` | `sick` | `<circle cx="12" cy="12" r="8.5"/><path d="M7.5 15.5q1.125-1.25 2.25 0t2.25 0 2.25 0 2.25 0M9 9.75h.01M15 9.75h.01"/>` |
| `cold` | `cold` (Cold, Hypothermia) | `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>` |
| `hot` | `hot` (Overheating, Heat stroke) | `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>` |
| `wet` | `wet` | `<path d="M7 15a4 4 0 0 1 .6-7.95 5 5 0 0 1 9.5 1.5A3.25 3.25 0 0 1 17 15H7ZM8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>` |
| `drunk` | `drunk` | `<path d="M8 3h8l-.4 4.6a3.6 3.6 0 0 1-7.2 0L8 3ZM12 11.2V20M8.5 20.5h7M8.3 6.5h7.4"/>` |
| `caf` | `caf` | `<path d="M5 9h11v4.5A5.5 5.5 0 0 1 10.5 19A5.5 5.5 0 0 1 5 13.5V9ZM16 10.5h1.25a2.25 2.25 0 0 1 0 4.5H16M8.5 3.5v2.5M12.5 3.5v2.5"/>` |
| `pk` | `pk` | `<path d="M10.6 19.4 19.4 10.6a4.24 4.24 0 0 0-6-6L4.6 13.4a4.24 4.24 0 0 0 6 6ZM8.5 8.5l7 7"/>` |
| `heavy` | `heavy` (Overloaded) | `<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="14.5" r="6"/>` |

### Equipment and weapon slots (empty-slot glyphs, 24u)

| Name | Use | Inner SVG markup (24 viewBox) |
|---|---|---|
| `head` | `head` | `<path d="M4.5 16a6.5 6.5 0 0 1 13 0M4.5 16h17M11 9.5V8"/>` |
| `eyes` | `eyes` | `<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 13.5 2.5 9M20.5 13.5l1-4.5"/>` |
| `face` | `face` | `<path d="M4 9.5c2.5-1 5.2-1.5 8-1.5s5.5.5 8 1.5v2.5c0 4.4-3.6 8-8 8s-8-3.6-8-8V9.5ZM8.5 13h7M9.5 16h5"/>` |
| `torso` | `torso`; also the Pockets header | `<path d="M8.5 3.5 4 5.75 2.5 10.5l3 1V20.5h13v-9l3-1L20 5.75 15.5 3.5a3.5 3.5 0 0 1-7 0Z"/>` |
| `vest` | `vest` | `<path d="M7 3.5h2.5a2.5 2.5 0 0 0 5 0H17l2 3v14H5v-14l2-3ZM8.5 12h7v5h-7Z"/>` |
| `back` | `back` | `<path d="M7 9a5 5 0 0 1 10 0v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5V9ZM9.5 4V5.5M14.5 4v1.5M9.5 4h5M9.5 14h5v3.5h-5Z"/>` |
| `gloves` | `hands` equipment slot | `<path d="M8 21v-3.5l-3.2-4.3a1.4 1.4 0 0 1 2.2-1.7L8.5 13V5.25a1.25 1.25 0 0 1 2.5 0V11V4.25a1.25 1.25 0 0 1 2.5 0V11V5.25a1.25 1.25 0 0 1 2.5 0V11V7.25a1.25 1.25 0 0 1 2.5 0V15c0 2.5-1 4.5-2 6M8 18.25h9"/>` |
| `hands` | Hands cell (held item) | `<path d="M8 21v-3.5l-3.2-4.3a1.4 1.4 0 0 1 2.2-1.7L8.5 13V5.25a1.25 1.25 0 0 1 2.5 0V11V4.25a1.25 1.25 0 0 1 2.5 0V11V5.25a1.25 1.25 0 0 1 2.5 0V11V7.25a1.25 1.25 0 0 1 2.5 0V15c0 2.5-1 4.5-2 6"/>` |
| `legs` | `legs` | `<path d="M6 3.5h12l1 17h-5l-2-10-2 10H5l1-17ZM6 7h12"/>` |
| `feet` | `feet` | `<path d="M7 3.5h5v8.5l6.25 2.2A2.5 2.5 0 0 1 20 16.6V19H4.5v-3.2L7 12V3.5ZM4.5 19v1.5H20V19"/>` |
| `belt` | `belt` | `<path d="M2.5 10h6.5M15 10h6.5M2.5 14h6.5M15 14h6.5M9 8h6v8H9ZM12 12h3"/>` |
| `primary` | `primary` and `secondary` | `<path d="M2.5 10.5h12l1.5-1.5h5.5v3h-4.5l-1 1.5H11l-1.25 4.5h-2.5l1-4.5H2.5v-3Z"/>` |
| `sidearm` | `sidearm` | `<path d="M4 7h15.5v4.5H11l-1.25 5.5H6.25l1.2-5.5H4V7ZM11 11.5v1.75h2.25"/>` |
| `melee` | `melee` | `<path d="M4 20l3.25-3.25M5.75 14.75l3.5 3.5M8.25 15.75 18.5 5.5 20.5 3.5c.4 3.1-.9 6.3-3.6 9L12 17.25"/>` |

### Actions and chrome

| Name | Use | Inner SVG markup (24 viewBox) |
|---|---|---|
| `close` | Close buttons | `<path d="M6 6l12 12M18 6 6 18"/>` |
| `sort` | Carried header | `<path d="M4 6h10M4 12h7M4 18h4M17.5 5v14M14.5 16l3 3 3-3"/>` |
| `search` | Search fields, inventory filter | `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>` |
| `plus` | Map zoom in, New world | `<path d="M12 5v14M5 12h14"/>` |
| `minus` | Map zoom out | `<path d="M5 12h14"/>` |
| `locate` | Map: centre on me | `<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>` |
| `fit` | Map: all islands | `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>` |
| `layers` | Map layers popover | `<path d="M12 3.5l9 4.5-9 4.5-9-4.5 9-4.5ZM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>` |
| `pin` | Map markers popover | `<path d="M12 21s6-5.3 6-10.5a6 6 0 0 0-12 0C6 15.7 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2"/>` |
| `marker` | User marker (filled accent on canvas and compass) | `<path d="M12 3.5 18 12l-6 8.5L6 12l6-8.5Z"/>` |
| `edit` | World details | `<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>` |
| `duplicate` | Duplicate world, copy seed | `<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>` |
| `export` | Export world | `<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>` |
| `import` | Import world | `<path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>` |
| `trash` | Delete world | `<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"/>` |
| `chevron` | Trend (rotate 90 / -90), select, collapse (rotate 90 when open) | `<path d="M9 6l6 6-6 6"/>` |
| `check` | Toggle rows in popovers | `<path d="M5 12.5 9.5 17 19 7.5"/>` |
| `reset` | Per-row reset in Options | `<path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.5M4 3.5v5h5"/>` |
| `fuel` | Vehicle fuel; liquid chip for fuel | `<path d="M4.5 20.5v-15A1.5 1.5 0 0 1 6 4h6a1.5 1.5 0 0 1 1.5 1.5v15M3 20.5h12M4.5 10h9M13.5 8.5h2l2.5 2.5v6a1.25 1.25 0 0 0 2.5 0V9L18.5 7"/>` |
| `wrench` | Vehicle condition | `<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1Z"/>` |
| `magazine` | Reserve ammo in the weapon panel | `<path d="M9 3.5h6.5l-1.5 17H8.5L9 3.5ZM9 8h6"/>` |
| `altitude` | Aircraft altitude | `<path d="M2.5 19.5 9 9.5l4 6 2.5-3.5 6 7.5Z"/>` |
| `flame` | Crafting station chip | `<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3C8 9 6 11.5 6 15a6 6 0 0 0 6 6Z"/>` |
| `car` | Known vehicles on the map | `<path d="M3.5 16v-3.5L5.7 7h12.6l2.2 5.5V16H3.5Zm0 0v2.5h3V16m11 0v2.5h3V16M3.5 12.5h17"/>` |
| `skull` | Death marker | `<path d="M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.9 3-5.4a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2M14 20v-2"/>` |
| `mouseL` | Keycap for Mouse0 / click | `<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/><path d="M12 3a6 6 0 0 0-6 6h6V3Z" fill="currentColor"/>` |
| `mouseR` | Keycap for Mouse2 | `<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/><path d="M12 3a6 6 0 0 1 6 6h-6V3Z" fill="currentColor"/>` |
| `player` | Player arrow on map and minimap | `<path d="M12 3 19 20l-7-4-7 4 7-17Z" fill="currentColor"/>` |

---

## 4. Components

Class names are from 2.8. Every interactive component has hover, pressed, `:focus-visible` and disabled states; disabled is `opacity: .4; pointer-events: none` unless stated.

### 4.1 Screen and panel

```
screen (.screen)  full viewport, --scrim, fade in 240 ms, pointer-events auto
└ panel (.panel)  --m-panel, radius 12, inset 1px --line-2, shadow panel, max 100vw−32px × 100vh−32px
   ├ .panel-head   56 h, padding 0 12 0 24, bottom hairline: [t-title, flex 1] [meta] [close icon button 32]
   ├ .panel-body   flex 1, scroll, padding 16 24
   └ .panel-foot   56 h, padding 0 24, top hairline: [secondary …] [spacer] [primary]
```

- One primary button per footer, rightmost. Verb labels, never OK/Yes.
- Esc closes the top screen (existing `UI` key handler). Clicking the scrim outside a panel closes screens that are not `sticky`.
- In game, screens use `.screen` (scrim). On the title, screens use `.screen.bare` (no scrim; the title camera and its gradient stay behind). The old `.screen.clear` variant is removed.

### 4.2 Buttons

| Variant | Class | Size | Rest | Hover | Pressed |
|---|---|---|---|---|---|
| Secondary (default) | `.btn` | 32 h, padding 0 16, radius 8, t-body 500 | `--fill-2`, `--ink-1` | `--fill-3` | `--fill-4` |
| Primary | `.btn.primary` | same, 600 | `--accent`, `--on-accent` | `--accent-hover` | `--accent-press` |
| Danger | `.btn.danger` | same | transparent, `--alarm` text | `--tint-alarm` | same |
| Ghost (text) | `.btn.ghost` | same | transparent, `--ink-2` | `--fill-2`, `--ink-1` | `--fill-3` |
| Small | `.btn.sm` | 24 h, padding 0 8, radius 4 | as its variant | | |
| Large | `.btn.lg` | 40 h, padding 0 24 | as its variant | | |
| Icon | `.btn.icon` | 32 × 32, 16u icon, transparent, `--ink-2` | | `--fill-2`, `--ink-1` | `--fill-3` |
| Small icon | `.btn.icon.sm` | 24 × 24 | | | |

An icon button always has a `title` (1–2 words). An icon + label button puts the 16u icon before the label with an 8u gap.

### 4.3 Key cap

| Variant | Class | Look | Where |
|---|---|---|---|
| HUD | `.kc` | 20 h, min 20 w, padding 0 5, radius 3, **solid** `--ink-1` fill, `--bg-1` text, JetBrains Mono 11/600 | Prompts, key hints, `K Bandage`, `R Clear`, pause Resume |
| Outline | `.kc.out` | transparent, `--ink-2` text, `inset 0 0 0 1px --line-3` | Context menus, map close, Keys tab footer |
| Mouse | `.kc` or `.kc.out` | the 12u `mouseL` / `mouseR` icon instead of text; double-click is `mouseL` + `2×` in the same cap | Labels `LMB` / `RMB` from `prettyCode`, default-action menu rows |
| Hold | `.kc-hold > .kc` | 2u ring around the cap: `conic-gradient(var(--accent) calc(var(--p) * 1turn), var(--line-3) 0)`, radius 5; `--p` = hold progress 0..1 | Interaction prompts with `t.hold` |

- Labels always come from `input.label( action )` (which uses `prettyCode`). Hard-coded UI-only keys use these exact labels: `Shift`, `Ctrl`, `Alt`, `Del`, `Space`, `Esc`, `Tab`, `Backspace`, `1–9`.
- A key cap is always followed by a 1–2 word verb (`.hint` wrapper, 6u gap): `F Search`, `R Reload`, `K Bandage`. Never a sentence.

### 4.4 Segmented control

`.seg`: 28 h track `--fill-2`, radius 7, padding 2, gap 2. Segments 24 h, padding 0 12, t-body 500 `--ink-2`; hover `--ink-1`. Selected (`.on`): `--bg-3` thumb, `--ink-1`, `inset 0 0 0 1px --line-2, 0 1px 2px rgba(0,0,0,.4)`. Left/Right arrows change the value when focused. `.seg.fill` stretches segments to equal widths (inventory left tabs). A disabled segment that is `.on` (Graphics preset `Custom`) keeps the thumb and uses `--ink-4` text.

### 4.5 Slider

`input[type=range].slider`: 200 w, 20 h hit area, 2 px track `--fill-3` with the filled part `--accent` via `--p` (percent, set on input), 14u `--ink-1` thumb with `0 1px 3px rgba(0,0,0,.5)`. Value label `.val` 56 w, right-aligned, t-body tnum `--ink-2`, to the right of the slider with a 12u gap. Arrow keys step, Shift+arrow steps ×10 (handled in the keydown listener: `value += step * 10`). The GUI-scale slider commits on `change` (release) only, and updates its value label on `input`.

### 4.6 Toggle

`.toggle` button with `role="switch"` and `aria-checked`: 36 × 20 pill. Off: track `--fill-4`, 16u knob `--ink-2` at x 2. On (`.on`): track `--accent`, knob `#fff` translated 16u. 160 ms.

### 4.7 Input, search, select

- `.input`: 32 h, padding 0 12, radius 8, `--bg-2`, `inset 0 0 0 1px --line-2`, t-body. Focus: `inset 0 0 0 1px --accent`. Placeholder `--ink-3`.
- `.search`: wrapper with a 16u `search` icon at left 12 (`--ink-3`), input padding-left 36, optional `.count` (t-body tnum `--ink-3`) at right 12. Placeholder `Search`.
- **Select:** a `.btn` with the current label and a 12u `chevron` (rotated 90°) at the right, 280 w. Click opens a `.pop.menu` directly under it, same width, one row per option, the current option `.on`. No native `<select>` (it cannot be styled).

### 4.8 Tabs

- **Rail** (Options): vertical list of 32 h buttons, padding 0 12, radius 4, t-body; rest `--ink-2`; selected `--fill-3` background + `--ink-1`. ↑/↓ move between tabs when the rail has focus.
- **Segmented tabs** (inventory left column): `.seg.fill`.

### 4.9 Rows

- **Section header** `.sec-head`: 32 h, `.t-label` `--ink-3` flex 1, optional right meta (t-body tnum `--ink-2`) and one small icon button.
- **Option row** `.row`: 40 h, bottom hairline. `.lab` (t-body `--ink-2`, flex 1) with a 6u `--accent` dot 12u to the left of the text when `.changed`; `.ctl` 320 w, right-aligned, 12u gaps; `.rst` 24 w slot that holds a small `reset` icon button only while the row is changed (the slot is always reserved so rows never shift).
- **List row** (worlds): 72 h, padding 8, grid `96u 1fr auto`, 12u gap, bottom hairline. Hover `--fill-2`; selected `--accent-soft` + `inset 0 0 0 1px --accent-line`.
- **Stat table** `.stats`: 2 columns, 1 px `--line-1` gaps, radius 4. Cells 28 h, padding 0 8, `--bg-1`; label `--ink-3` left, value tnum right (`--ink-1`, or `--warn` / `--alarm` when that vital is low / critical).

### 4.10 Chips

| Variant | Class | Look |
|---|---|---|
| Panel chip | `.chip` | 24 h, padding 0 8 0 6, radius 4, `--fill-2`, 16u icon + t-body `--ink-2`. Condition chips in the inventory tint the icon with the condition kind. |
| Requirement chip | `.chip.req` | 20 h, padding 0 6 0 2, 16u item render or icon + text. `.miss` turns the text `--alarm`. |
| HUD chip | `.cond.plate` | 24 h, padding 0 4, radius 4 on `--m-hud`; 16u icon in the kind colour; `.lab` adds padding-right 8 and the label |
| Drag chip | `.chip-drag` | 20 h, padding 0 8, radius 4, **filled**: `--accent` (verb), `--warn` (`.part`), `--alarm` (`.bad`); `.t-label` text in `--on-accent`; centred 4u above the hovered target |

### 4.11 Meter

`.meter`: 2 px high, radius 1, track `--fill-3`, fill `<i>` `--ink-2`; `.warn` / `.alarm` recolour the fill. On the HUD the track is `rgba(255,255,255,.14)` and the fill `--hud-1` (or the state hue).

### 4.12 Item cell and slot

```
┌──────────────────┐  56 × 56, radius 4, --fill-1, inset 1px --line-1
│●               4 │  ● held: 6u --accent dot at (5,5)   4: hotbar slot, .t-micro --ink-3 at right 4, top 3
│      [render]    │  item render 44u centred (category glyph 32u), drop-shadow 0 1px 2px rgba(0,0,0,.5)
│               30 │  quantity / rounds: Inter 11/600 tnum --ink-1, text-shadow 0 1px 1px #000, right 4, bottom 6
│ ▔▔▔▔▔▔▔▔▔▔       │  .meter: left 6, right 6, bottom 4
└──────────────────┘
```

**One bar per cell** (the item's key consumable); hidden at 99.9% or more except fill and charge, which always show:

| Item | Bar |
|---|---|
| Firearm, melee, clothing, backpack, tool, attachment | condition `stack.cond` |
| Food with `food.spoil` | `freshness( stack )` |
| Liquid container (`tool.liquid` = capacity in litres) | `data.amount / tool.liquid` |
| Battery device (`tool.battery`) | `data.charge / tool.battery` |
| Fuel | `data.amount / fuel.litres` |

Colour: `--ink-2`, `--warn` below 50%, `--alarm` below 25%.

**Quantity text:** `ammoOf( stack )` when it is not null (guns, magazines), else `qty` when above 1, else nothing.

**States:**

| State | Look |
|---|---|
| Rest | `--fill-1`, `inset 0 0 0 1px --line-1` |
| Hover | `--fill-3`, `--line-3`; tooltip after 250 ms |
| Pressed | `--fill-4` |
| Context menu open for it (`.sel`) | `inset 0 0 0 1.5px --accent` |
| Drag source (`.src`) | opacity .32 |
| Valid target while dragging (`.can`) | `inset 0 0 0 1px --accent-line` |
| Hovered valid target (`.over`) | `--accent-soft` + `inset 0 0 0 1.5px --accent` |
| Hovered invalid target (`.deny`) | `inset 0 0 0 1.5px --alarm`, `cursor: not-allowed` |
| Filtered out by search (`.dim`) | opacity .25 |
| Spoiled (`freshness <= 0`) | render at 50% opacity, bar at 0, 6u `--alarm` dot at (5,5) (moves to (13,5) if the held dot is there) |

**Slots:** the same cell. Empty slots are `.cell.empty`: transparent, `inset 0 0 0 1px --line-2`, the 24u slot glyph in `--ink-3`, no text. Hovering an empty slot shows a one-line tooltip with the slot name (see 6.3). Wide slots: `.w3` 176 × 56, `.w2` 116 × 56; their render is 44u tall and up to (width − 16u) wide.

**Well** `.well`: an empty container's drop area, full width × 56, radius 4, `inset 0 0 0 1px --line-2`, no text.

Removed: rarity border classes (`.r-*`), the `HELD` text tag, slot text labels, `Empty` / `Drop items here` placeholders, the sepia filter on spoiled food.

### 4.13 Tooltip

`.pop.tip`: 240 w, padding 12, `--m-pop`, radius 8, shadow pop. Opens 250 ms after the pointer rests on a cell, 12u right/below the cursor, flipped to stay 8 px inside the viewport; hidden while dragging.

```
┌──────────────────────────────┐
│ M4A1 Carbine ×2              │  .ttl t-body 600 --ink-1 (displayName, ×qty when qty > 1)
│ FIREARM · 5.56               │  .meta t-label --ink-3: category · (calibre | slot | liquid)
├──────────────────────────────┤  hr, full bleed
│ Condition              Worn  │  .kv rows, 20 h: label --ink-3 / value tnum --ink-1
│ Loaded                31/30  │
│ Damage             34  +6    │  compare delta: .d.up --good / .d.down --alarm, 6u left margin
│ Rate              800 rpm    │
│ Red dot · Suppressor         │  attachments line, --ink-2
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
| Book (`cat === 'book'`) | | `d.desc` as one line (it is the book's effect, for example `Read: better fishing.`) | |

- **Compare:** when the hovered item is clothing, a backpack or a firearm/melee weapon and would replace an occupied slot (`inv.equip[slot]` / `inv.weapons[slot]`), numeric rows show the delta against the worn item: `Storage 8 +2`. Equal values show no delta.
- Removed: the `category · rarity` line, `d.desc` for everything except books, the `Double-click: …` hint, the `Weight` / `Size` / `Slot` / `Calibre` rows (moved to the meta and footer).
- **Empty-slot tooltip:** `.ttl` only (the slot name).

### 4.14 Context menu and popover

`.pop.menu`: `--m-pop`, radius 8, padding 4, min 200 w, max 280 w. Rows 28 h, padding 0 8, radius 4, 12u gap: label t-body (flex 1, ellipsis) and an optional right hint (`.kc.out` key cap, or t-body `--ink-3` text such as a count). Hover or keyboard row: `--fill-3`. The default action row is `.def` (600). Separator `.sep`: 1 px `--line-1`, 4u vertical margin. Destructive row `.danger` (`--alarm`).

- Opens at the pointer; its measured `getBoundingClientRect()` is used to flip it left/up so it stays 8 px inside the viewport (today's code estimates `items.length * 32`).
- ↑/↓ move, Enter runs, Esc or any outside pointerdown closes. The row that ran plays `ui`.
- Popovers (map layers, marker list, select lists) use the same surface and open under their anchor button, right-aligned to it.

### 4.15 Toast and menu toast

- **HUD toast** `.toast.plate`: 28 h, max 360 w, padding 0 12 0 10, t-body `--hud-1`, one line with ellipsis. Leading 6u dot `.sd.warn` / `.sd.bad` (none for `info` / `good`), or a 20u item render when the event has `icon`. A repeat of the same text within 2 s adds or bumps a `×2` suffix (`.x`, 600 `--hud-2`) and restarts its timer instead of stacking.
- **Menu toast** (`ui.toastScreen`): same plate, bottom centre, 48u above the bottom edge, 2.5 s. Examples: `Saved`, `Imported`, `Copied`.

### 4.16 Prompt

`.prompt.plate`: left = 50% + 28u, vertically centred on the crosshair, padding 6 12 6 6, 8u column gap, max 360 w. Row 1: key cap (HUD `.kc`, or `.kc-hold` for hold actions) + label (t-body 600, ellipsis). Row 2 (only when `t.sub` exists): `t.sub` in `--hud-2`, aligned under the label. Hidden when `showInteractHints` is false, while an action runs, or when a screen is open.

### 4.17 Confirm

`ui.confirm( title, text = null, ok = 'OK', cls = 'primary' )` keeps its signature and promise. `.pop.confirm` centred over a `--scrim` wrapper: 400 w, padding 24, `t-title`, then `text` in t-body `--ink-2` only when the caller passes one (no current caller does), then a 24u gap and right-aligned buttons: `Cancel` (secondary) and the verb (`.primary` or `.danger`). Enter confirms, Esc cancels. Focus starts on `Cancel` for danger, on the verb otherwise.

### 4.18 Scrollbars

6 w thumb `--fill-4`, radius 3, no track; `scrollbar-width: thin; scrollbar-color: var(--fill-4) transparent` for Firefox.

---

## 5. HUD

Reference renders: `docs/ui/spec-hud-damaged.jpg` (bright street, damaged, looting), `docs/ui/spec-hud-vehicle.jpg` (bright sand, driving, timed action, key hints).

### 5.1 Layout (1920 × 1080, u = 1)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌fps┐ 24,24               ┌─────────── compass 480×28, top 24 ───────────┐        ┌─ minimap ────┐ │
│ ┌toast─────────┐          │ '  '  W  '  '  '  NW  '  '  |  ◆  '  '  N  ' │        │              │ │
│ ┌toast────┐               └──────────────────────────────────────────────┘        │  184 × 184   │ │
│ (feed, above screens)                  ┌ 318° ┐  heading tab 20h, top 56           │      ▲       │ │
│                                    ┌──────────────┐                                │              │ │
│                                    │   Waikīkī    │  location card, top 88         ├──────────────┤ │
│                                    │    OʻAHU     │  (on change, 3 s)              │ Waikīkī 17:37│ │
│                                    └──────────────┘                                └─ 192×216 ────┘ │
│                                                                                                    │
│                                          ·   ┌──────────────────────────┐                          │
│                                     crosshair│ (F) Search Kitchen cupbd │  prompt, left 50%+28     │
│                                              └──────────────────────────┘                          │
│                                        ┌ Bandaging 2.4 s ┐  action label, top 50%+36              │
│                                                                                                    │
│ chat, left 24, bottom 160, 440 w                                          ┌─────────────────────┐  │
│                                                                           │ ▢ Canned tuna   ×2  │  │
│ ┌Bleeding ×2┐┌╳┐┌☂┐┌K Bandage┐  conditions                                │ ▢ 5.56 round   ×30  │  │
│ ┌────┬────┬────┬──────┐          ┌───── key hints 32h ─────┐              └─────────────────────┘  │
│ │ hp │ bl │ wa │ temp │          ━━━━━━━━━━━━  stamina 160×3               ┌ M4A1 CARBINE ───────┐ │
│ │ 41 │ 58 │ 44 │ 35.8°│          ┌1┐┌2┐┌3┐┌ ┐┌5┐  hotbar 48, gap 4          │ 31  ▮90        SEMI │ │
│ └────┴────┴────┴──────┘          └─┘└─┘└─┘└─┘└─┘                           └ ━━━━━━━━━━━━━━━━━━  ┘ │
│ vitals 48×56 cells, left 24, bottom 24         bottom 24                  weapon 240 w, right 24   │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Container | Box | Position |
|---|---|---|---|
| FPS | `.hud .tl` | auto × 20 | left 24, top 24 |
| Debug (F3) | `.hud .tl` | ≤ 720 w | under FPS, 8 gap |
| Toasts | `.feed` (sibling above screens) | ≤ 360 × 28 each, 4 gap, max 4 | left 24; top = 24 + height of `.tl` + 8 when `.tl` is non-empty |
| Compass | `.hud` | 480 × 28 plate | centred, top 24 |
| Heading tab | `.hud` | auto × 20 plate | centred, top 56 |
| Location card | `.hud` | auto × 56 plate | centred, top 88 |
| Minimap | `.hud` | 192 × 216 plate | right 24, top 24 |
| Crosshair | `.hud` | 4 × 4 dot, or four 2 × 8 bars | centre |
| Hit marker | `.hud` | 26 × 26 box | centre |
| Damage arc | `.hud` | 240 × 240 box (radius 120) | centre |
| Action ring | `.hud` | 48 × 48 | centre |
| Action label | `.hud` | auto × 28 plate | centred, top = 50% + 36 |
| Prompt | `.hud` | auto × 32 (50 with sub), ≤ 360 w | left = 50% + 28, vertically centred |
| Bottom-left stack `.bl` | `.hud` | column, 8 gap | left 24, bottom 24: conditions row above the vitals strip |
| Chat | `.chat` | 440 w | left 24, bottom 160 |
| Bottom-centre stack `.bc` | `.hud` | column, 12 gap, centred | bottom 24: key hints, stamina bar, hotbar (top to bottom) |
| Bottom-right stack `.br` | `.hud` | column, 12 gap, right-aligned | right 24, bottom 24: pickups above the weapon or vehicle panel |
| Lock hint | `.lock` | auto × 32 plate | centred, top 58% |

**While a screen is open** (`ui.screen`), `.hud` gets `.under` (opacity 0, 160 ms) and `.chat` hides unless it is open. The `.feed` toast layer stays visible above screens (so `No room` shows over the inventory). `F1` (`hideHud`) toggles `.off` on `.hud`, `.feed` and `.chat` (closed log only). `g.dead` sets `.off`.

### 5.2 Visibility

A new setting `hudMode` (`'auto'` | `'always'`, read as `settings.get( 'hudMode' ) ?? 'auto'`, written with `settings.set`) controls the elements marked Auto. Settings.js needs no change.

| Element | Auto: visible when | Always | Hides |
|---|---|---|---|
| Crosshair | On foot, not aiming, no screen, style ≠ `none` | same | at once |
| Compass, heading tab | `compass` setting on and (`realisticMap` off, or carrying `compass`, or creative) | same | at once |
| Minimap | `minimap` setting on and (`realisticMap` off, or carrying `map_hawaii`, or creative) | same | at once |
| Vitals strip (per cell) | The cell is past its show threshold (5.5), or its trend tier ≥ 1 | all six cells | 3 s after the cell stops qualifying; the strip hides when no cell is visible |
| Conditions | Any active (creative: never) | same | when inactive |
| Stamina bar | `stamina < maxStamina() − 0.5`, or underwater (breath) (creative: never) | same | 1 s after full |
| Hotbar | Any slot bound and woken in the last 3 s (slot key, mouse wheel, `inv.hands` change, hotbar change) | any slot bound | 3 s after the last wake |
| Weapon panel | Held item and not in a vehicle | same, never collapses | firearm: name row and bar collapse after 3 s idle; other items: whole panel fades after 3 s idle |
| Vehicle panel | `vehicles.hud()` is not null | same | at once |
| Prompt | `interact.target`, not busy, no screen, `showInteractHints` on | same | at once |
| Action ring | `actions.busy` | same | at once |
| Toasts, pickups | On event | same | 3.5 s (bad 5 s) / 2.4 s |
| Location card | Place changed (5.8) or spawn | same | 3 s hold |
| Key hints | `tutorial` on, per-hint rule (5.11) | same | rule met or 20 s |
| Damage arc | `S.lastHitDir` and `damageIndicators` on | same | follows `lastHitDir.t` |

**Aiming** (`hands.aiming`): crosshair hides; vitals, conditions, hotbar, key hints and pickups fade to 0 over 160 ms (pickups queue and play after aiming); the weapon panel collapses; compass, minimap, toasts and the prompt stay.

**In a vehicle:** crosshair, hotbar and weapon panel hide; the vehicle panel takes the bottom-right slot.

**Implementation:** one helper in `HUD.js`: `wake( key )` stores `this.seen[ key ] = this.t`; `shown( key, cond ) = mode === 'always' || cond || this.t - ( this.seen[ key ] ?? -99 ) < 3`. Toggle a `.gone` class (opacity 0, 400 ms) rather than `hidden`, so elements fade. Write to the DOM only when a formatted string or class actually changes (cache the last value per field).

### 5.3 Compass and heading tab

- Plate 480 × 28 (`.compass.plate`), centred, top 24. The whole element is masked `linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)` so its ends fade.
- Strip: 3u per degree, built once for −360…720°. Ticks sit on the bottom edge: every 5° a 1 px × 5u `--hud-2` tick, every 15° a 1 px × 9u `--hud-1` tick.
- Labels (`.t-label`, top 4, centred on the tick): `N E S W` in `--hud-1`, `NE SE SW NW` in `--hud-2`. **The 15° degree numbers are removed.** N is not coloured.
- Needle: 2 px × 12u `--hud-1` bar at the bottom centre.
- Markers from `markers.list()`, drawn at their bearing, top 16, 10u:
  - `user`: filled `--accent` diamond (`marker` path) with a 1.5 px black stroke.
  - `locate`: the same diamond hollow (accent stroke, no fill).
  - `death`: `skull` in `--alarm`.
- **Heading tab** (`.heading.plate`): top 56, 20 h, padding 0 8, t-body 600 tnum: `318°`.
- **Marker distance:** the nearest `user` or `locate` marker within ±20° of the heading gets its distance in a second 20 h plate under its diamond (`1.2 km`, t-body tnum), top 56. If that plate would overlap the heading tab (centres closer than 60u), the distance joins the heading tab instead: `318°  1.2 km` (distance in `--hud-2`, 8u gap).
- The heading comes from `vehicles.hud().heading` in a vehicle, else `player.yaw` (existing formula).
- **Removed:** the readout line `318° · 17:37 · Day 1 · Waikiki`. Time moves to the minimap footer, the place to the location card and the minimap footer, the day to the inventory and Status.

### 5.4 Minimap

```
┌─ plate 192 × 216, padding 4 ──┐
│┌──────────────────────────────┐│
││             (N)              ││  N badge: 16u --bg-1 circle, white N (Inter 600 10u), on the rim toward north, 10u inset
││                              ││
││              ▲               ││  player chevron 16u, white fill, 1.5 px black stroke, fixed, pointing up
││        ◆                     ││  markers 12u (clamped 8u inside the edge; off-map → 6u accent triangle pointing out)
│└────────── 184 × 184 r4 ──────┘│
│ Waikīkī                 17:37  │  footer 24 h: short place (t-body --hud-1, ellipsis) · time (t-body tnum --hud-2)
└────────────────────────────────┘
```

- Rounded square, heading-up (the map rotates, the chevron does not), same `MapView.draw` call as today with `labels: false`.
- Canvas backing store: `round( 184 * ui.u * min( 2, devicePixelRatio ) )` square; redrawn every 2nd frame (existing).
- Zoom: 1.1 px/m on foot, 0.55 above 12 m/s (existing), eased over 600 ms (`zoom += ( target − zoom ) * ( 1 − exp( −dt / 0.2 ) )`).
- Markers: `user` filled accent diamond, `locate` hollow accent diamond, `death` `--alarm` skull, known vehicles `car` glyph 12u in `--hud-2`.
- Footer time: `fmtHour( g.hour )`. When `realisticMap` is on and the player carries no `watch` (and is not in creative), the time is hidden and the place takes the full width.
- Footer place: `ui.locationName( pos )` (short), refreshed every 30 frames.
- **Removed:** the circular mask, the orange N, the separate location label under the map.

### 5.5 Vitals strip

One plate (`.vitals`), cells 48 × 56 separated by 1 px `--line-1`, fixed order **health, blood, food, water, temp, energy**. Hidden cells are removed from the row, so the plate shrinks toward the left edge.

```
┌──────┐  48 × 56
│    ˅˅│  trend: 1–3 chevrons, 10u each, stroke 2.5, --hud-2, top 3 right 3, overlapping by 4u
│  ♡   │  icon 16u at top 10 (state colour)
│  41  │  value t-body 600 tnum, 4u under the icon
│ ━━━  │  2 px meter, left 8 right 8 bottom 6, filled to the value
└──────┘
```

| Cell | Value shown | Meter | Show when (Auto) | Low (warn tint) | Critical (alarm tint + icon blink) |
|---|---|---|---|---|---|
| health | `round( S.health )` | health / 100 | < 95 | < 50 | < 25 |
| blood | `round( S.blood / 50 )` (% of 5000 ml) | blood / 5000 | < 95 | < 76 (3800 ml) | < 60 (3000 ml) |
| food | `round( min( 100, S.hunger ) )` | same / 100 | < 50 | < 30 | < 10 |
| water | `round( min( 100, S.thirst ) )` | same / 100 | < 50 | < 30 | < 10 |
| temp | `S.temp.toFixed( 1 ) + '°'` | comfort `1 − min( 1, abs( temp − 36.9 ) / 2.2 )` | outside 36.0–37.8° | < 36.0 → **cold tint** (`--tint-cold`, icon `--cold`); > 38.0 → warn tint | < 35.2 or > 38.6 |
| energy | `round( S.energy )` | energy / 100 | < 30 | < 25 | < 10 |

- **Trend chevrons:** per cell keep an EMA of the rate of change of the displayed value in units per minute, `rate += ( inst − rate ) * ( 1 − exp( −dt / 1.5 ) )`. Tiers by `abs( rate )`: ≥ 4 → 1 chevron, ≥ 15 → 2, ≥ 45 → 3 (temperature: ≥ 0.08, 0.3, 0.9 °C/min). Chevrons point down when falling and up when rising (the `chevron` icon rotated 90° / −90°). A cell whose tier is ≥ 1 counts as waking (so eating shows the food cell with up chevrons, and bleeding shows the blood cell falling). Normal hunger decay (1–2.5 per min) stays below tier 1.
- Updated at 10 Hz (every 6th frame). Creative mode: the strip never shows.
- **Removed:** the six always-on glass tiles, the vertical fill, the `▲▼` text arrows, the `title` tooltips (the pointer is locked in game), the separate stamina bar under the tiles.

### 5.6 Conditions

A row of HUD chips 8u above the vitals strip (above the bottom edge when the strip is hidden), 4u gap, wrapping at 440 w, in `S.conditions()` order (read every 20 frames).

- Chip: `.cond.plate`, 24 h, 16u icon (section 3, keyed by `id`; `blood` → `blood`, `tired` → `energy`) in the kind colour: `bad` `--alarm`, `warn` `--warn`, `good` `--hud-2`.
- **Label:** when a condition id first appears, or its label changes (for example Cold → Hypothermia, Bleeding → Bleeding ×2), the chip shows `icon + label` (t-body `--hud-1`) for 6 s, then collapses to the icon. For `bleed` with more than one wound, the collapsed chip keeps `×2` (t-body 600).
- **Contextual key cap:** while `S.bleeding > 0` and the inventory holds an item with `medical.bleed`, a chip `.cond.plate.act` shows `[K] Bandage` (HUD key cap with `input.label( 'quickHeal' )`) at the end of the row. It is not gated by the Key hints setting.
- Creative: no conditions row.

### 5.7 Weapon and held item panel

Plate `.weapon`, 240 w, padding 12, bottom-right.

```
┌────────────────────────────────────┐   expanded 78 h
│ M4A1 CARBINE                       │   name: t-label --hud-2, ellipsis (fades after 3 s idle)
│ 31  ▮90                       SEMI │   rounds t-num --hud-1 · 12u magazine glyph + reserve t-body 600 --hud-2 · mode t-label --hud-1
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░   │   condition meter 6u below, --hud-2 fill (fades after 3 s idle)
└────────────────────────────────────┘   collapsed 52 h: only the middle row
```

- Rounds: `ammoOf( held )`. Reserve: `hands.ammoInfo().reserve`, after the magazine glyph (glyph omitted for internally fed guns, `firearm.feed === 'internal'`). This fixes the ambiguous `31 / 30`.
- Mode: `ammoInfo().mode` (uppercase through `.t-label`). When the mode is `'jammed'`, the mode slot shows a 20 h `--alarm` chip `JAM` (`--on-accent` text) and the prompt slot shows `[R] Clear` (5.9).
- Plate tint: `.warn` when rounds ≤ 20% of capacity, `.alarm` at 0. The number stays white.
- Condition meter colour: `--hud-2`, `--warn` below 50%, `--alarm` below 25%.
- **Wakes** (expand for 3 s): held uid changes, rounds or reserve or mode change, aim starts.
- Other held items:
  - melee, tool: name row + condition meter, no number; the panel fades out after 3 s idle.
  - stack (`qty > 1`, bandages, grenades): name row + `t-num` quantity.
  - liquid container: name row + `0.8` t-num + `L` t-label.
  - battery device: name row + `72` t-num + `%` t-label.
- Built once; update `textContent` and `style.width` only. The weapon render and the calibre line are removed (calibre lives in the tooltip).

### 5.8 Location card

- `.place.plate`, centred, top 88, padding 8 16: name `t-title --hud-1`, island `t-label --hud-2` 2u below (omitted when the name is the island itself, `Coast` or `Pacific Ocean`).
- Shows 1.2 s after spawn (replacing the spawn toasts) and whenever `ui.locationName( pos )` returns a new value that stays the same for 2 s. The same name is not shown again within 60 s (border flicker). Never while a screen is open.
- In 240 ms (opacity, translateY −4u → 0), hold 3 s, out 400 ms.

### 5.9 Prompt and contextual key caps

- Interaction prompt per 4.16. Key: `input.label( t.key || 'interact' )`. Label: `t.label` as given by the module. Sub: `t.sub` when present.
- Hold (`t.hold`): the key cap is wrapped in `.kc-hold` with `--p = interact.holdT / t.hold`. The word `hold` is removed; the ring shows it before and during the hold. There is no centre ring for holds.
- When there is no interaction target, the same slot shows:
  - `[R] Clear` while the held gun is jammed (always).
  - `[R] Reload` while the held firearm has 0 rounds and reserve > 0 (only when Key hints is on).

### 5.10 Timed action

- Ring (`.ring`, SVG 48 × 48 around the crosshair, rotated −90°): track circle r 21, 3 px `rgba(0,0,0,.45)`; arc r 21, 2 px `--accent`, round caps, `stroke-dasharray: 131.9`, `stroke-dashoffset: 131.9 * ( 1 − actions.progress )`.
- Label plate `.ring-label`: top = 50% + 36, 28 h, padding 0 10: `actions.current.label` (t-body 600) + remaining seconds `( current.time − current.t ).toFixed( 1 ) + ' s'` (t-body tnum `--hud-2`), 6u gap.
- On cancel the arc turns `--alarm` for 200 ms before hiding.
- **Removed:** the `…` and `(move to cancel)` text.

### 5.11 Key hints (replace `TIPS`)

Plate `.keyhints`, 32 h, padding 0 12, bottom-centre stack (above the stamina bar and hotbar). Groups of `[key caps] Verb` 16u apart. One set at a time, only when the `tutorial` setting (labelled **Key hints**) is on; each is shown once per game session.

| Order | Mode | Content | Shown | Ends |
|---|---|---|---|---|
| 1 | survival | `[W][A][S][D] Move  [Shift] Sprint  [C] Crouch` | 2.5 s after spawn | `player.distance > 30` or 20 s |
| 2 | survival | `[Tab] Inventory` | after 1 | inventory opened or 20 s |
| 3 | survival | `[M] Map` | after 2, only when the map is allowed (5.2 rule) | map opened or 20 s |
| 1 | creative | `[Space]×2 Fly` | 2.5 s after spawn | first flight or 20 s |
| 2 | creative | `[T] Chat` | after 1 | chat opened or 20 s |

Every key comes from `input.label( action )` (`forward left back right sprint crouch inventory map jump chat`), so rebinding updates the hints. Hidden while a screen is open or while aiming.

### 5.12 Stamina, toasts, pickups, hotbar, crosshair, damage, vehicle, FPS, debug, lock hint

**Stamina bar** (`.stamina`): 3 high, radius 2, width `160u × --max`, where HUD.js sets `--max` to `maxStamina() / 100` (the part lost to weight, hunger, thirst or blood loss is simply not drawn), track `rgba(0,0,0,.45)` with a 1 px `rgba(0,0,0,.25)` ring, fill `--hud-1` at `stamina / maxStamina()` of the bar. Fill `--alarm` (`.low`) below 20 stamina. Underwater the bar shows `breath / 100` with a 12u `breath` icon 6u to its left, `--alarm` below 25.

**Toasts** (`.feed`, top-left): per 4.15, newest at the bottom, max 4 (the oldest leaves first), in 160 ms (opacity, translateX −8u → 0), out 240 ms. `warn` and `bad` play `ui_error` at 0.25 (existing). Toasts from `game.toast` only; the UI's own spawn and teleport toasts are removed.

**Pickups** (`.br`, above the weapon panel): plate rows 28 h, padding 0 12 0 4, 4 gap, max 4: 20u item render, name (t-body), `×2` (t-body 600 tnum `--hud-2`). The same item id within 1.5 s merges (quantities add, timer restarts). Life 2.4 s. Suppressed while the inventory is open; queued while aiming.

**Hotbar** (`.hotbar`): 48 × 48 plates, 4 gap, centred. Slots 1 up to the highest bound slot render; unbound slots in between show as 40% empty plates so positions never shift. Cell: render 36u centred, slot number `.t-micro --hud-2` at (4, 3), quantity or rounds (Inter 11/600 tnum) at right 4, bottom 3. The held slot: `inset 0 0 0 1.5px --accent` and its number in `--accent`.

**Crosshair:** `dot`: 4u white dot with `0 0 0 1px rgba(0,0,0,.55)`. `lines` (Dynamic): four 2 × 8u white bars with a 1 px dark outline, gap from `hands.crosshairSpread()` with today's formula. `none`: nothing.

**Hit marker:** four diagonal ticks 6u × 1.5 px starting 5u from centre, white with a dark outline; a kill makes them `--alarm` and 8u long. Visible 180 ms (kill 350 ms), then fade 160 ms. Sounds unchanged.

**Damage arc** (`.dmg`, SVG 240 × 240): one 36° arc of radius 120 around the centre, 3 px `--alarm`, round caps, `drop-shadow(0 0 1px rgba(0,0,0,.8))`, rotated to the hit direction (today's angle formula), opacity `min( 1, lastHitDir.t )`. Replaces the blurred blob.

**Vehicle panel** (`.vehicle.plate`, 240 w, padding 12, replaces the weapon panel):

```
┌────────────────────────────────────┐
│ PICKUP TRUCK                  [ 3] │  name t-label --hud-2 · gear chip 20 h --fill-3 t-label --hud-1 (v.gear as given: R, N, 1…)
│ 84 KM/H                            │  t-num · unit t-label --hud-2 (KN for boats)
│ F  ━━━━━━━━━━░░░░░░░░       42%    │  `fuel` icon 16 (F) · meter flex · value t-body tnum 36 w right
│ W  ━━━━━━━━━━━━━━━━━░       88%    │  `wrench` icon (W) · condition
│ ▲  420 m                           │  altitude icon + value, only when v.altitude != null
└────────────────────────────────────┘  116 h (138 with altitude)
```

Speed `round( abs( v.speed ) * 3.6 )` km/h, or `/ 1.852` kn when `v.kind === 'boat'`. Fuel meter `--alarm` below 15%, condition `--alarm` below 30%. Built once, updated every 3rd frame by `textContent` / `style.width` (today it rewrites `innerHTML`).

**FPS:** `.fps.plate` 20 h, padding 0 8, JetBrains Mono 11/500 `--hud-2`: `41 fps`. Only when `showFps`.

**Debug (F3):** `.pop`-style block in `.tl` (`--m-pop`, radius 8, padding 8 12, max 720 w), `.t-mono`, `white-space: pre`. The first line loses the `Deadtide — ` prefix.

**Lock hint:** `.lock.plate` centred at top 58%, 32 h, padding 0 12, t-body: `Click to resume`.

### 5.13 HUD CSS

```css
/* ---- HUD layout ---------------------------------------------------------------------------------- */
.hud { position: absolute; inset: 0; pointer-events: none; transition: opacity var(--d-4) var(--ease-out); z-index: 1; }
.hud.off, .hud.under { opacity: 0; }
.hud .fade { transition: opacity var(--d-4) var(--ease-out); }
.hud .gone { opacity: 0; }

.crosshair { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.crosshair .dot { width: calc(4 * var(--u)); height: calc(4 * var(--u)); border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55); }
.crosshair .lines { position: relative; width: 0; height: 0; }
.crosshair .lines i { position: absolute; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45); }
.crosshair .lines i:nth-child(1) { width: 2px; height: calc(8 * var(--u)); left: -1px; top: calc(-8 * var(--u) - var(--gap-px, 6px)); }
.crosshair .lines i:nth-child(2) { width: 2px; height: calc(8 * var(--u)); left: -1px; top: var(--gap-px, 6px); }
.crosshair .lines i:nth-child(3) { height: 2px; width: calc(8 * var(--u)); top: -1px; left: calc(-8 * var(--u) - var(--gap-px, 6px)); }
.crosshair .lines i:nth-child(4) { height: 2px; width: calc(8 * var(--u)); top: -1px; left: var(--gap-px, 6px); }
.hitmarker { position: absolute; left: 50%; top: 50%; width: calc(26 * var(--u)); height: calc(26 * var(--u)); transform: translate(-50%, -50%) rotate(45deg); opacity: 0; transition: opacity var(--d-2) var(--ease-in); }
.hitmarker.on { opacity: 1; transition: none; }
.hitmarker i { position: absolute; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45); }
.hitmarker i:nth-child(1), .hitmarker i:nth-child(2) { left: calc(50% - 0.75px); width: 1.5px; height: calc(6 * var(--u)); }
.hitmarker i:nth-child(1) { top: calc(50% - 11 * var(--u)); } .hitmarker i:nth-child(2) { top: calc(50% + 5 * var(--u)); }
.hitmarker i:nth-child(3), .hitmarker i:nth-child(4) { top: calc(50% - 0.75px); height: 1.5px; width: calc(6 * var(--u)); }
.hitmarker i:nth-child(3) { left: calc(50% - 11 * var(--u)); } .hitmarker i:nth-child(4) { left: calc(50% + 5 * var(--u)); }
.hitmarker.kill i { background: var(--alarm); }
.hitmarker.kill i:nth-child(1), .hitmarker.kill i:nth-child(2) { height: calc(8 * var(--u)); } .hitmarker.kill i:nth-child(1) { top: calc(50% - 13 * var(--u)); }
.hitmarker.kill i:nth-child(3), .hitmarker.kill i:nth-child(4) { width: calc(8 * var(--u)); } .hitmarker.kill i:nth-child(3) { left: calc(50% - 13 * var(--u)); }

.compass { position: absolute; top: var(--edge); left: 50%; width: calc(480 * var(--u)); height: calc(28 * var(--u)); margin-left: calc(-240 * var(--u)); overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
.compass-strip { position: absolute; left: 50%; top: 0; height: 100%; will-change: transform; }
.compass-tick { position: absolute; bottom: 0; width: 1px; height: calc(5 * var(--u)); background: var(--hud-2); }
.compass-tick.major { height: calc(9 * var(--u)); background: var(--hud-1); }
.compass-label { position: absolute; top: calc(4 * var(--u)); transform: translateX(-50%); color: var(--hud-2); }
.compass-label.card { color: var(--hud-1); }
.compass-marker { position: absolute; top: calc(16 * var(--u)); width: calc(10 * var(--u)); height: calc(10 * var(--u)); margin-left: calc(-5 * var(--u)); color: var(--accent); }
.compass-marker.death { color: var(--alarm); }
.dist { position: absolute; top: calc(56 * var(--u)); transform: translateX(-50%); display: flex; align-items: center; height: calc(20 * var(--u)); padding: 0 var(--s-2); font-variant-numeric: tabular-nums; }
.heading .d { margin-left: var(--s-2); color: var(--hud-2); font-weight: 500; }
.compass-needle { position: absolute; left: 50%; bottom: 0; width: 2px; height: calc(12 * var(--u)); margin-left: -1px; background: var(--hud-1); }
.heading { position: absolute; top: calc(56 * var(--u)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; height: calc(20 * var(--u)); padding: 0 var(--s-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.place { position: absolute; top: calc(88 * var(--u)); left: 50%; transform: translateX(-50%); padding: var(--s-2) var(--s-4); text-align: center; }
.place .isl { color: var(--hud-2); margin-top: 2px; }
.place { transition: opacity var(--d-4) var(--ease-in); }

.tl { position: absolute; left: var(--edge); top: var(--edge); display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2); }
.debug { max-width: calc(720 * var(--u)); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--m-pop); color: var(--ink-1); white-space: pre; }
/* toasts live outside .hud so they stay above screens; HUD.js sets top when .tl changes height */
.feed { position: absolute; left: var(--edge); top: var(--edge); z-index: 20; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-1); pointer-events: none; }
.feed.off { opacity: 0; }
.lock { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); z-index: 3; display: flex; align-items: center; height: calc(32 * var(--u)); padding: 0 var(--s-3); pointer-events: none; }
.fps { display: flex; align-items: center; height: calc(20 * var(--u)); padding: 0 var(--s-2); color: var(--hud-2); font: 500 calc(11 * var(--u)) / 1 var(--mono); }

.minimap { position: absolute; right: var(--edge); top: var(--edge); width: calc(192 * var(--u)); height: calc(216 * var(--u)); padding: var(--s-1); }
.minimap canvas, .minimap .map { display: block; width: calc(184 * var(--u)); height: calc(184 * var(--u)); border-radius: var(--r-sm); }
.minimap .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); height: calc(24 * var(--u)); padding: 0 var(--s-1); }
.minimap .foot > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.minimap .foot > span:last-child { color: var(--hud-2); font-variant-numeric: tabular-nums; }

.bl { position: absolute; left: var(--edge); bottom: var(--edge); display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2); }
.conds { display: flex; flex-wrap: wrap; gap: var(--s-1); max-width: calc(440 * var(--u)); }
.cond { display: inline-flex; align-items: center; gap: calc(6 * var(--u)); height: calc(24 * var(--u)); padding: 0 var(--s-1); border-radius: var(--r-sm); }
.cond.lab { padding-right: var(--s-2); }
.cond.bad .i { color: var(--alarm); } .cond.warn .i { color: var(--warn); } .cond.good .i { color: var(--hud-2); }
.cond .x { font-weight: 600; font-variant-numeric: tabular-nums; }
.cond.act { padding-left: 2px; }
.vitals { display: flex; }
.vital { position: relative; display: flex; flex-direction: column; align-items: center; width: calc(48 * var(--u)); height: calc(56 * var(--u)); padding-top: calc(10 * var(--u)); }
.vital + .vital { box-shadow: -1px 0 0 var(--line-1); }
.vital:first-child { border-radius: var(--r-md) 0 0 var(--r-md); } .vital:last-child { border-radius: 0 var(--r-md) var(--r-md) 0; }
.vitals > .vital { background: var(--m-hud); }
.vitals { border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--line-2), var(--sh-plate); }
.vital .v { margin-top: calc(4 * var(--u)); font-weight: 600; font-variant-numeric: tabular-nums; }
.vital .meter { position: absolute; left: var(--s-2); right: var(--s-2); bottom: calc(6 * var(--u)); background: rgba(255, 255, 255, 0.14); }
.vital .meter > i { background: var(--hud-1); }
.vital .tr { position: absolute; right: calc(3 * var(--u)); top: calc(3 * var(--u)); display: flex; color: var(--hud-2); }
.vital .tr .i { width: calc(10 * var(--u)); height: calc(10 * var(--u)); stroke-width: 2.5; margin-left: calc(-4 * var(--u)); }
.vital.warn { background: linear-gradient(var(--tint-warn), var(--tint-warn)), var(--m-hud); } .vital.warn > .i { color: var(--warn); } .vital.warn .meter > i { background: var(--warn); }
.vital.crit { background: linear-gradient(var(--tint-alarm), var(--tint-alarm)), var(--m-hud); } .vital.crit > .i { color: var(--alarm); animation: blink 1s steps(1) infinite; } .vital.crit .meter > i { background: var(--alarm); }
.vital.cold { background: linear-gradient(var(--tint-cold), var(--tint-cold)), var(--m-hud); } .vital.cold > .i { color: var(--cold); } .vital.cold .meter > i { background: var(--cold); }
@keyframes blink { 50% { opacity: 0.4; } }

.bc { position: absolute; left: 50%; bottom: var(--edge); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--s-3); }
.hotbar { display: flex; gap: var(--gap); }
.hot { position: relative; width: var(--hot); height: var(--hot); }
.hot > img { position: absolute; left: 50%; top: 50%; width: calc(36 * var(--u)); height: calc(36 * var(--u)); transform: translate(-50%, -50%); object-fit: contain; }
.hot > .n { position: absolute; left: calc(4 * var(--u)); top: calc(3 * var(--u)); font: 600 calc(10 * var(--u)) / 1 var(--mono); color: var(--hud-2); }
.hot > .q { position: absolute; right: calc(4 * var(--u)); bottom: calc(3 * var(--u)); font-weight: 600; font-size: calc(11 * var(--u)); line-height: 1; font-variant-numeric: tabular-nums; }
.hot.on { box-shadow: inset 0 0 0 1.5px var(--accent), var(--sh-plate); } .hot.on > .n { color: var(--accent); }
.hot.unb { opacity: 0.4; background: transparent; }
.stamina { --max: 1; position: relative; width: calc(160 * var(--u) * var(--max)); /* --max = maxStamina() / 100, set by HUD.js */ height: 3px; border-radius: 2px; background: rgba(0, 0, 0, 0.45); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); }
.stamina > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--hud-1); }
.stamina.low > i { background: var(--alarm); }
.stamina > .i { position: absolute; right: calc(100% + 6 * var(--u)); top: 50%; transform: translateY(-50%); width: calc(12 * var(--u)); height: calc(12 * var(--u)); }
.keyhints { display: flex; align-items: center; gap: var(--s-4); height: calc(32 * var(--u)); padding: 0 var(--s-3); }

.br { position: absolute; right: var(--edge); bottom: var(--edge); display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-3); }
.pickups { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-1); }
.pickup { display: flex; align-items: center; gap: var(--s-2); height: calc(28 * var(--u)); padding: 0 var(--s-3) 0 var(--s-1); }
.pickup img { width: calc(20 * var(--u)); height: calc(20 * var(--u)); object-fit: contain; }
.pickup .x { color: var(--hud-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.weapon { width: calc(240 * var(--u)); padding: var(--s-3); }
.weapon .name { color: var(--hud-2); margin-bottom: var(--s-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weapon .ammo { display: flex; align-items: center; gap: var(--s-2); }
.weapon .ammo .res { display: flex; align-items: center; gap: 2px; color: var(--hud-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.weapon .ammo .mode { margin-left: auto; }
.weapon .ammo .jam { height: calc(20 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); background: var(--alarm); color: var(--on-accent); display: inline-flex; align-items: center; }
.weapon .meter { margin-top: calc(6 * var(--u)); background: rgba(255, 255, 255, 0.14); } .weapon .meter > i { background: var(--hud-2); }
.vehicle { width: calc(240 * var(--u)); padding: var(--s-3); }
.vehicle .top { display: flex; align-items: center; justify-content: space-between; color: var(--hud-2); margin-bottom: var(--s-1); }
.vehicle .gear { height: calc(20 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); background: var(--fill-3); color: var(--hud-1); display: inline-flex; align-items: center; }
.vehicle .spd { display: flex; align-items: baseline; gap: calc(6 * var(--u)); margin-bottom: var(--s-2); }
.vehicle .spd .t-label { color: var(--hud-2); }
.vehicle .g { display: flex; align-items: center; gap: var(--s-2); height: calc(22 * var(--u)); color: var(--hud-2); }
.vehicle .g .meter { flex: 1; background: rgba(255, 255, 255, 0.14); } .vehicle .g .meter > i { background: var(--hud-1); }
.vehicle .g .pc { width: calc(36 * var(--u)); text-align: right; color: var(--hud-1); font-variant-numeric: tabular-nums; }

.ring { position: absolute; left: 50%; top: 50%; width: calc(48 * var(--u)); height: calc(48 * var(--u)); transform: translate(-50%, -50%) rotate(-90deg); }
.ring circle { fill: none; }
.ring .track { stroke: rgba(0, 0, 0, 0.45); stroke-width: 3; }
.ring .arc { stroke: var(--accent); stroke-width: 2; stroke-linecap: round; }
.ring.cancel .arc { stroke: var(--alarm); }
.ring-label { position: absolute; left: 50%; top: calc(50% + 36 * var(--u)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(6 * var(--u)); height: calc(28 * var(--u)); padding: 0 calc(10 * var(--u)); white-space: nowrap; }
.ring-label .s { color: var(--hud-2); font-variant-numeric: tabular-nums; }
.dmg { position: absolute; left: 50%; top: 50%; width: calc(240 * var(--u)); height: calc(240 * var(--u)); transform: translate(-50%, -50%); }
.dmg path { fill: none; stroke: var(--alarm); stroke-width: 3; stroke-linecap: round; filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8)); }

@media (prefers-reduced-motion: reduce) {
	.tw-root *, .tw-root *::before, .tw-root *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 80ms !important; }
	.vital.crit > .i { animation: none; }
}
```

---

## 6. Inventory

Reference render: `docs/ui/spec-inventory.jpg` (tooltip with a compare delta, context menu with key caps, Hands cell, stat table, hotbar strip).

### 6.1 Layout

The game keeps running (as today). The screen is `.screen.inv` (scrim) holding a centred column: the panel, a 16u gap, and the hotbar strip.

```
┌──────────────────────────────────────────── panel min(1104u, 100vw−32px) × min(800u, 100vh−112u), r12 ───────────────────────────────────────────┐
│ Day 3 · 14:20                                                                           (⌕)  ▬▬▬▬▬|▬▬▬▬|▬▬▬▬  11.2 kg   (✕) │ top bar 48
├──────────────────────────────────────┬────────────────────────────────┬──────────────────────────────────────┤
│ [ Nearby ][ Craft ][ Catalog ]       │ ┌──┐┌──┐┌──┐┌──┐┌──┐           │ CARRIED                     7.5/40 (⇅)│
│                                      │ │⌒ ││oo││▭ ││T ││▣ │  head eyes face torso vest            │
│ Fridge                5/12 [Take all]│ └──┘└──┘└──┘└──┘└──┘           │ ˅ [T] Pockets                   3.5/4 │
│ ━━━━━━━━━━━━░░░░░░░░░░░░░░░░         │ ┌──┐┌──┐┌──┐┌──┐┌──┐           │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░       │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐                 │ │▣ ││H ││⊓ ││⌐ ││═ │  back gloves legs feet belt           │
│ │  ││  ││  ││  ││  │                 │ └──┘└──┘└──┘└──┘└──┘           │ ┌──┐┌──┐┌──┐                          │
│ └──┘└──┘└──┘└──┘└──┘                 │   12                           │ └──┘└──┘└──┘                          │
│                                      │ ┌──────────────┐┌──┐┌──┐       │ ˅ [▢] Cargo shorts                4/6 │
│ Ground                             1 │ │ primary 176  ││sd││ml│       │ ━━━━━━━━━━━━━━━━━━━━░░░░░░░░░         │
│ ┌──┐                                 │ └──────────────┘└──┘└──┘       │ ┌──┐┌──┐┌──┐                          │
│ │30│                                 │ ┌──────────────┐┌───────┐      │ └──┘└──┘└──┘                          │
│ └──┘                                 │ │ secondary    ││ Hands │      │ ˅ [▢] Hiking backpack            0/30 │
│                                      │ └──────────────┘└───────┘      │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                      │   16                           │ ┌ well ───────────────────────────┐  │
│                                      │ [●Bleeding ×2] [☂ Wet]         │ └─────────────────────────────────┘  │
│                                      │ ┌ Health 82% ┬ Food    72% ┐   │                                      │
│                                      │ │ Blood  92% │ Water   28% │   │                                      │
│                                      │ │ Body 36.9° │ Energy  64% │   │                                      │
│                                      │ │ Air   27°  │ Wet     40% │   │                                      │
│                                      │ └ Insulation 20% ┴ Bite 10% ┘   │                                      │
├──────────── 388u ────────────────────┴──────────── 328u ────────────┴──────────── 388u ────────────────────┤
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                   16u gap
                         ┌1─┐┌2─┐┌3─┐┌4─┐┌5─┐┌6─┐┌7─┐┌8─┐┌9─┐   hotbar strip: 9 × 48, gap 4
```

- Panel grid rows: top bar 48u, body `1fr`. Columns `minmax(0, 388u) 328u minmax(0, 388u)`, separated by 1 px `--line-1` (`box-shadow: inset 1px 0 0` on the 2nd and 3rd). Each column has padding 16; the left and right columns scroll on their own. Cell grids use `repeat(auto-fill, 56u)` so narrow windows drop a column of cells instead of overflowing.
- **The middle column never scrolls:** clothing 116 + 12 + weapons 116 + 16 + conditions ≤ 64 + table 144 + padding 32 = 500u, which fits the smallest body height (560u at 960 × 540).
- Closing: Esc, the Inventory key, the close button, or a click on the scrim (existing). While the search field has text, the first Esc clears it.
- **Removed:** the `Inventory` title, the hint sentence `Double-click: use / equip · …`, the `kg carried — overloaded` subtitle, the `Character` / `Weapons` headers, the `Creative` / `Day N` meta, the `In hands:` line, the gradient weight bar, the `Wear clothes with pockets…` sentence.

### 6.2 Top bar (48u, padding 0 8 0 16, bottom hairline)

| Item | Spec |
|---|---|
| Left | `Day 3 · 14:20` t-body tnum `--ink-2` (`g.day`, `fmtHour( g.hour )`; the time follows the watch rule of 5.4, so it can read `Day 3`) |
| Search | `.btn.icon` (`search`, title `Search`). Click or Ctrl+F expands it into a 200u `.search` input (placeholder `Search`), focused. Non-matching cells in all three columns get `.dim` (match: `displayName` or `CATEGORY_LABEL` contains the query, case-insensitive). Empty → collapses back to the icon on blur. |
| Weight meter | 120 × 4, radius 2, track `--fill-3`, scale 0–45 kg. Ticks 1 px × 8u `--ink-3` at 18 kg (stamina starts to drop) and 30 kg (overloaded). Fill `--ink-1` up to 18, `--warn` up to 30, `--alarm` above. |
| Weight value | `11.2 kg`, t-body tnum, 12u after the meter, same colour as the fill |
| Close | `.btn.icon` (`close`, title `Close`) |

### 6.3 Middle column: equipment

- **Clothing** grid, 5 columns of 56 cells, 4 gap: row 1 `head, eyes, face, torso, vest`; row 2 `back, hands (gloves glyph), legs, feet, belt`.
- **Weapons** grid 12u below, same 5 columns: row 1 `primary` (`.w3`, 176 × 56), `sidearm` (56), `melee` (56); row 2 `secondary` (`.w3`), **Hands** (`.w2`, 116 × 56).
- Slot names for tooltips (UI-side, overriding `SLOT_LABEL`): head `Head`, eyes `Eyewear`, face `Face`, torso `Top`, vest `Vest`, back `Back`, hands `Gloves`, legs `Pants`, feet `Shoes`, belt `Belt`, primary `Primary`, secondary `Secondary`, sidearm `Sidearm`, melee `Melee`, Hands cell `Hands`.
- **Hands cell** (new, UI-only): shows `inv.heldStack()` (empty → `hands` glyph). Dropping a carried item on it calls `game.hands.select( stack )`; double-click calls `game.hands.holster()`; right-click opens the held item's own menu. Dragging from it drags the held stack from its real location (`_locOf( uid )` searches equip, weapons and containers). Items from the ground, a world container or the catalog get the `Not carried` drag chip.
- **Conditions** 16u below the weapons (only when any are active): `.chip` per condition with the kind-coloured icon and the full label (`Bleeding ×2`, `Wet`), 4u gap, wrapping.
- **Stat table** 12u below (16u when there are no conditions): `.stats`, 5 rows × 2 columns:

| Left | Right |
|---|---|
| Health `82%` | Food `72%` |
| Blood `92%` | Water `28%` |
| Body `36.9°` | Energy `64%` |
| Air `27°` | Wet `40%` |
| Insulation `20%` | Bite `10%` |

  Values follow the HUD thresholds (5.5): `--warn` when low, `--alarm` when critical, `--cold` for Body below 36.0°. Insulation and Bite are computed as today. `Weight` (top bar) and `Infected killed` (Status) leave this table.

### 6.4 Left column: Nearby, Craft, Catalog

- `.seg.fill` at the top: `Nearby`, `Craft`, `Catalog` (creative only). The Craft tab is omitted when `game.crafting` is missing. The Craft hotkey still opens this tab (`inventory.leftTab = 'craft'`).
- **Nearby** content, 12u below the tabs:
  - The open world container (`this.other`), when there is one, as a **section** (6.6) titled with `other.label`.
  - **Ground** section: `Ground` + item count (`1`), or a well when empty. Items within `GROUND_R` as today.
  - `Take all` (`.btn.sm`) sits at the right of the **first** section header, only when anything is takeable; it runs today's `_takeAll()`.
  - When the player walks more than 4 m from the container, its section fades out over 160 ms (no toast), as today's logic closes it.

### 6.5 Right column: Carried

- `.sec-head`: `CARRIED`, total `7.5/40` (sum of `containerVolume` / capacity), and a `.btn.icon.sm` `sort` (title `Sort`) that runs `_sort()`.
- One section per `inv.containers()` entry, in order. Pockets use the `torso` glyph (16u `--ink-3`) as the owner icon; other containers use their 20u item render.

### 6.6 Section (container block)

```
˅ [icon] Name                            3.5/4 [Take all]     header 32 h: 12u chevron (collapse) · 20u render · name t-body 600 (ellipsis) · used/cap t-body tnum --ink-2 · optional button
━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░                          .meter, 8u under: --ink-2 fill, --warn above 90%, --alarm at 100% (cap text --alarm too)
┌──┐┌──┐┌──┐                                                  .grid of cells 8u under; an empty container shows a .well instead
└──┘└──┘└──┘                                                  16u to the next section
```

- Clicking the header (not its button) toggles collapse; the chevron points down when open and right when collapsed. Collapsed state lives in `this.collapsed` (a `Set`) keyed by `owner.uid`, `'pockets'`, `'other'` or `'ground'`, for the session.
- The whole section (header included) is the drop target, so a collapsed or empty container still accepts drops.

### 6.7 Hotbar strip

Under the panel (16u gap): nine 48 × 48 cells (`--m-panel` background, `inset 0 0 0 1px --line-2`, radius 8), 4 gap, numbered 1–9 (`.t-micro --ink-3` at 4, 3); bound cells show the 36u render and the quantity; the held slot uses the accent inset. Each cell is a drop target: dropping a **carried** stack binds it (`inv.hotbar[ i ] = uid`, removing that uid from any other slot, `inv.changed()`). Right-click or hover + Del on a bound cell unbinds it. Hover + 1–9 over an item keeps working (today's `_key`).

### 6.8 Mouse and keyboard

| Input | Over | Action |
|---|---|---|
| Double-click | own item | `_default` (Hold / Wear / Take off / Put away / first item action) |
| Double-click | ground or container item | Take (`_quickMove`) |
| Click | catalog item | Give 1 (existing) |
| Shift+click **or Ctrl+click** | any item | `_quickMove` (catalog: full stack) |
| **Alt+click** | own item | `_default` |
| Right-click | item, slot, hotbar cell | context menu (6.10) |
| Drag | item | move (6.9) |
| Hover + `1`–`9` | carried item | bind to that slot (existing) |
| **Hover + `Del`** | own item | Drop (`move( …, { type: 'ground' } )`) |
| **Hover + `Del`** | hotbar strip cell | Unbind |
| **Hover + `Space`** | stack with qty > 1 in a container | Split popover (6.11) |
| **Ctrl+F** | anywhere | Focus the search field |
| Esc / Inventory key | anywhere | Clear search, else close |

These are pointer and keydown handlers inside `InventoryUI`; no new Input bindings.

### 6.9 Drag and drop

- Drag starts after 5 px (existing). The ghost is a 56u `--m-pop` cell (radius 4, shadow pop) with the render and quantity, rotated −3°, centred on the cursor, `pointer-events: none`, on `<body>` at z 60. The source cell gets `.src`.
- **On drag start**, compute `_accepts( stack, from, to )` for every registered drop target and add `.can` to each accepted one. `_accepts` is a dry run of the same rules as `move()` and `_dropOnItem()`, returning `{ ok, verb?, reason?, part? }`:

| Target | Accepts when | Otherwise |
|---|---|---|
| Equipment slot | `clothing.slot` / `backpack.slot` matches (backpack cat → `back`) | `Wrong slot` |
| Weapon slot | melee → `melee`; sidearm firearm → `sidearm`; any firearm → `primary` / `secondary` | `Wrong slot` |
| Ground | the source is not the ground | (no highlight) |
| Container section | the source is not the same items array; `container.owner !== stack`; a clone dry run of `addToItems` fits all → ok; fits some → `part: 'n/qty'`; fits none → `No room` | `Can't nest` / `No room` |
| Hotbar strip cell | source is carried (equip, weapon, container) | `Not carried` |
| Hands cell | source is carried | `Not carried` |
| Item (item-on-item) | ammo → magazine of the same calibre: `Load`; ammo → internal-feed gun of the same calibre: `Load`; magazine → gun that lists it in `firearm.mags`: `Insert`; attachment → firearm: `Attach`; same id stackable with room: `Merge` | not a target (the drop falls through to its section) |
| Catalog | never | |

- **Hovered target:** accepted → `.over`; item-on-item → `.over` plus a filled drag chip with the verb (`LOAD`, `INSERT`, `ATTACH`, `MERGE`); partial → `.over` plus a `--warn` chip `4/6`; refused → `.deny` plus an `--alarm` chip with the reason (`WRONG SLOT`, `NO ROOM`, `CAN'T NEST`, `NOT CARRIED`). Chips sit centred 4u above the hovered element.
- Sections show `.can` / `.over` / `.deny` as an outline: `outline: 1px solid var(--accent-line)` / `1.5px solid var(--accent)` plus `background: var(--accent-soft)` / `1.5px solid var(--alarm)`, `outline-offset: 4u`, radius 4.
- **Dropping on a refused target does nothing and shows no toast** (the chip already said why); `_deny()` only plays `ui_error` while dragging. Outside a drag (Shift-click, Take all) `_deny()` still toasts, with the short text in 17.
- **Dropping on the scrim** outside the panel and strip drops the stack to the ground (same path as `move( …, { type: 'ground' } )`), except from the ground or the catalog.
- On drop, clear every `.can`, `.over`, `.deny` and chip.

### 6.10 Context menu

Component 4.14. Rows in this order (separators where shown); hints on the right are `.kc.out` key caps or `--ink-3` text:

| Where | Rows |
|---|---|
| Own item | **default action** (`.def`, hint `[mouseL 2×]`) · item actions: `Eject mag` (firearm with a mag), `Unload` (firearm with rounds), `Detach <attachment>`, `Insert mag` (hint: count of fitting mags), `Load` (magazine not full, ammo carried), `Unload` (magazine with rounds), `Attach to <gun>` (up to 4 guns), then every `itemUse.actions( stack )` label not already shown · **sep** · `Hold` · `Bind` (hint `[1–9]`) or `Unbind` (hint: slot number) · `Split` (qty > 1 in a container, hint `[Space]`) · `Move to <container>` (only while a world container is open, hint `[Shift]`) · `Drop` (hint `[Del]`) · **sep** · `Delete` (creative only, `.danger`) |
| Ground / world container item | `Take` (hint `[Shift]`) · `Wear` (clothing, backpack) · item actions except any whose label matches `/drop/i` |
| Catalog item | `Give 1` (hint `[mouseL]`) · `Give 5` · `Give <stack size>` (hint `[Shift]`, only when stack > 1) |
| Hotbar strip cell | `Unbind` (hint `[Del]`) |

The cell whose menu is open gets `.sel`. `Hotbar full` stays as the deny toast for `Bind` with no free slot.

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

---

## 7. Status (replaces the survival journal, `log` key)

Panel 560 × auto (max 100vh − 96u) on a `.screen`.

```
┌ Status ─────────────────────────────────────────── Day 4  (✕) ┐  head 56: t-title · meta t-body --ink-2 · close
│ CONDITIONS                                                     │  only when any are active
│ ◉ Bleeding ×2                                        Bandage   │  rows 40 h: 16u kind icon · label t-body · remedy t-body right
│ ╳ Broken leg                                          Splint   │  remedy --ink-1 when a matching item is carried, else --ink-3
│ ❄ Cold                                   35.4°   Warm clothes  │  value t-body tnum --ink-2 where one applies
│ BODY                                                           │
│ ┌ Health   82% ┬ Food      72% ┐                               │  .stats
│ │ Blood    92% │ Water     28% │                               │
│ │ Body   36.9° │ Energy    64% │                               │
│ │ Air     27°  │ Stamina 80/92 │                               │
│ └ Wet      40% ┴ Weight 11.2 kg┘                               │
│ THIS LIFE                                                      │
│ ┌ Survived 2 d 4 h ┬ Kills    14 ┐                             │
│ └ Distance 12.4 km ┴ Looted   83 ┘                             │
│ ALL LIVES                                                      │
│ └ Lives          3 ┴ Kills   212 ┘                             │
└────────────────────────────────────────────────────────────────┘
```

| Condition id | Remedy | "Carried" check (`inv.find` over defs) |
|---|---|---|
| `bleed` | Bandage | `medical.bleed` |
| `frac` (not splinted) | Splint | `medical.splint` |
| `frac` (splinted) | Rest | — |
| `inf` | Antibiotics | `medical.infection` |
| `sick` | Charcoal | `medical.sick` |
| `cold` | Warm clothes (Hypothermia: Fire) | — |
| `hot` | Shade | — |
| `wet` | Shelter | — |
| `blood` | Saline | `medical.blood` |
| `tired` | Sleep | — |
| `heavy` | Drop weight | — |
| `drunk`, `caf`, `pk` | — (no remedy column) | — |

- Survived uses `fmtDur( hours )` (19.1): `< 1 h` → `35 min`, `< 24 h` → `4 h`, else `2 d 4 h`.
- Esc or the `log` key closes (existing).
- **Removed:** all ten advice sentences, the `Where` section, `Survival journal`, `Infected killed`, `Distance travelled`, `Items looted`, `Total infected killed`.

---

## 8. Map and minimap

### 8.1 Full map (`MapUI`)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────┐                                                          [M] (✕)     │  title plate top-left 24; close top-right 24
│ │ Waikīkī              │ t-title                                                              │
│ │ OʻAHU · 14:20 · DAY 3│ t-label --hud-2                                          ┌────┐      │
│ └──────────────────────┘                                                          │ +  │      │  tool stack: one plate, 32×32 icon
│                                                                                   │ −  │      │  buttons, hairlines between groups,
│                               (relief + vectors)                                  ├────┤      │  right 24, vertically centred
│                                                                                   │ ◎  │      │  locate (C)
│                      ◆ 1                                                          │ ⤢  │      │  all islands
│                         ▲ player + 60° cone                                       ├────┤      │
│                                                                                   │ ≋  │      │  layers popover
│                                                                                   │ ⌖3 │      │  markers popover (count badge)
│                                                                                   └────┘      │
│ ├────┼────┤ 2 km                                                   −3880, −9660 · 312 m · 1.4 km │  scale bar bottom-left 24; readout plate bottom-right 24
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Title plate:** `ui.locationName( player, true )` split on the first comma: line 1 the part before it (`t-title --hud-1`), line 2 the island + `fmtHour` + `Day N` as `.t-label --hud-2` joined with ` · ` (time follows the watch rule of 5.4). Padding 8 12.
- **Close:** `.btn.icon` in a plate, top-right 24, with a `.kc.out` showing `input.label( 'map' )` 8u to its left.
- **Tool stack** (plate, right 24, vertically centred), each `.btn.icon` 32 × 32 with a `title` of name + key: `Zoom in` (`+`), `Zoom out` (`−`), hairline, `Centre` (`locate`, key C), `All islands` (`fit`), hairline, `Layers` (`layers`), `Markers` (`pin`, disabled when there are no markers; a `.t-micro` count at its top-right).
- **Layers popover:** rows 32 h with a `.toggle` each: `Roads`, `Buildings`, `Grid`, `Markers`, `Vehicles`. State in `MapUI.layers` for the session, passed to `MapView.draw( …, { layers } )` (roads and buildings) and used by `MapUI` (grid, markers, vehicles). It replaces the always-open legend.
- **Markers popover:** 280 w, rows 32 h sorted by distance, the death marker pinned first: 16u glyph (accent diamond / hollow diamond / alarm skull) · label (t-body, ellipsis; double-click renames inline with a 24 h `.input`, Enter saves `m.label`, Esc cancels) · distance `fmtDist` (tnum `--ink-2`) · a `close` `.btn.icon.sm` on hover (`markers.remove( id )`). Clicking a row centres the map on it. Footer row: `Clear` (`.btn.ghost.sm`, runs `markers.clear()`, which keeps the death marker).
- **Scale bar** (DOM, not canvas): bottom-left 24; a 1 px white line with 5u end ticks, width `nice * ppm` px, and the `fmtDist( nice )` label (t-body, `text-shadow: var(--halo)`) centred 4u above. The map canvas is a controlled background, so the halo is allowed here.
- **Cursor readout:** plate bottom-right 24, 28 h, padding 0 10, `.t-mono`: `−3880, −9660 · 312 m · 1.4 km` (x, z · elevation `round( h * 6 )` m, or depth `−40 m` · `fmtDist` from the player). Hidden until the pointer first moves.
- **Canvas drawing** (sizes × `ui.u`): player chevron 16u white + 1.5 px black stroke and a 60° view cone `rgba(255,255,255,.12)` radius 36u; user markers 12u accent diamond with 1.5 px black stroke and the label (t-body 600 white with a 3 px `rgba(0,0,0,.6)` stroke) at +10u, −4u; `locate` hollow accent diamond; `death` 14u `--alarm` skull; known vehicles `car` glyph 14u white. Grid: 1 km lines (250 m above 0.6 ppm) in `rgba(255,255,255,.06)`.
- **Interaction:** drag pans, wheel zooms to the cursor (existing); **W A S D / arrows pan** at 600 px/s; `+`/`=` and `−` zoom ×1.5; `C` centres; double-click adds a user marker labelled with the next number (`1`, `2`, …); **right-click on a marker** opens a menu `Rename`, `Remove`; **right-click on the map** opens `Add marker` and, in creative, `Teleport`; in creative, holding Shift shows a 20 h accent chip `TELEPORT` next to the cursor and Shift-click teleports (existing, without the `Teleported` toast).
- Esc or the Map key closes (existing).
- **Removed:** the instruction sentence, the text buttons `+ − Me Islands Close`, the permanent legend, `elev … (real)`, `… away`, `(game)` on the scale, `Marker N`.

### 8.2 Palette (`maptile.js`, `MapView.js`)

The relief stays but is quieter, so markers and roads lead.

| Layer | Today | New |
|---|---|---|
| Out-of-world fill | `#0c244a` | `#152E4D` |
| Sea stops (0, −0.6, −3, −12, −40, −150, −600 m) | saturated cyan → navy | `#86C9CC`, `#5EB2BF`, `#3C8FAE`, `#2B6E96`, `#22557F`, `#1B3F66`, `#152E4D` |
| Land cover | full saturation | after computing r, g, b and before hillshade, mix each channel 25% toward luma `0.299r + 0.587g + 0.114b` |
| Hillshade clamp | 0.45–1.35 | 0.6–1.25 |
| Freeway (4 lanes) | casing `rgba(90,50,20,.6)`, line `#ffc861` | casing `rgba(0,0,0,.35)`, line `#FFFFFF` |
| Highway (2 lanes) | casing `rgba(60,50,40,.55)`, line `#fbf6e8` | casing `rgba(0,0,0,.3)`, line `rgba(255,255,255,.85)` |
| Streets | `rgba(248,246,238,.9)` | `rgba(255,255,255,.6)` |
| Dirt (dashed 4/3) | `rgba(150,110,70,.9)` | `rgba(255,255,255,.45)` |
| Buildings | `rgba(92,84,78,.9)` | `rgba(30,32,36,.55)` |
| Runways | `rgba(70,70,76,.85)` | `rgba(40,42,46,.8)` |
| Island labels | 600, 11 + ppm·40 px, `#fff3e0`, spacing 3 | 600 12u uppercase, letter-spacing 0.2em, white at 90% |
| Town labels | 700/600 15/13/11 px, military `#ffd0a0` | 600 14u (metro) / 600 12u (town) / 500 11u (other), all white |
| Water labels | italic 500 12 px `#bfe8ff` | italic 500 11u `rgba(200,225,255,.8)` |
| Peaks, areas | 500 / italic 11 px | same weights, 11u, `#B6BAC1` |

- Label fonts and halo widths are multiplied by `ui.u` (pass it in `opts.u`; default 1).
- **No hard tile edges:** when `MapView` is created, request every level-0 tile (64 m/px) with priority 0, so the coarse layer covers the whole archipelago before finer tiles arrive. Each tile stores `born = performance.now()` when its image lands and is drawn with `globalAlpha = min( 1, ( now − born ) / 200 )`, so finer tiles fade in over 200 ms.

### 8.3 Minimap

Per 5.4. Same palette; `labels: false`; buildings are drawn only above 0.5 ppm (existing), at the new colour.

---

## 9. Chat and commands (`Chat.js`)

```
│ Gave 1 × M4A1 Carbine                           closed: last 6 lines (CSS nth-last-child), each its own plate (fits text), fades after 8 s
│ /give m4a1                                      cmd echo: .t-mono --hud-2
│ ┌──────────────────────────────────────────┐   open: log on --m-panel plate, radius 8, padding 8, max 280 h, scrolls, every line
│ │ …                                        │
│ └──────────────────────────────────────────┘
│ ┌──────────────────────────────────────────┐   suggestions: .pop.menu above the input, rows 24 h, max 8 visible
│ │ /give        <item> [count]   Give items │   command .t-mono --ink-1 · desc t-body --ink-3 right, ellipsis
│ │▌/gamemode                     Mode       │   selected: --accent-soft + 2px --accent left bar
│ └──────────────────────────────────────────┘
│ ┌──────────────────────────────────────────┐   input 32 h (.input); .t-mono while the value starts with "/", t-body otherwise
│ │ /gi|ve                                   │   ghost completion after the caret in --ink-4; Tab accepts
│ └──────────────────────────────────────────┘
```

- Position: left 24, bottom 160, 440 w (clear of two rows of condition chips and the vitals strip).
- Line kinds: `sys` `--hud-2`; `ok` and `me` `--hud-1`; `cmd` `.t-mono --hud-2`; `err` `--hud-1` on a `--tint-alarm` plate (status hues never colour small HUD text).
- **Ghost completion:** a `div.ghost` absolutely over the input with the same font and padding: `<span style="visibility:hidden">{value}</span><span>{rest}</span>`, where `rest` is the first suggestion's `full` minus the typed value, shown only when the caret is at the end and `full` starts with the value (case-insensitive).
- Behaviour unchanged: T opens, `/` opens with a slash, Tab completes, ↑/↓ walk suggestions or history, Enter runs, Esc closes.
- **Removed:** the placeholder `Say something or type /help` and the line `Welcome to Deadtide. Press T to chat, type /help for commands.`

---

## 10. Title screen and About

Reference render: `docs/ui/spec-title.jpg`.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           (live title camera, VISTAS in main.js)                         │
│  scrim: linear-gradient(90deg, rgba(6,7,8,.78) 0%, rgba(6,7,8,.35) 40%, transparent 65%) │
│                                                                                          │
│  D E A D T I D E                     .wordmark 56u, left 96, 48u above the menu          │
│                                                                                          │
│ ▍Continue    Honolulu run · Day 12   rows 40 h, t-title 500 --ink-2; meta t-body --ink-3, 16u after
│  Worlds                                                                                  │
│  Options                                                                                 │
│  About                               column bottom 96                                    │
│                                                                                    v0.1  │  .t-mono --ink-3, right 24 bottom 24
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Row states: rest `--ink-2`; hover or focus `--ink-1` plus a 2 × 20u `--accent` bar 14u left of the text (the text does not move); pressed `--accent` text. `ui_hover` at 0.3 on hover (existing).
- Keyboard: ↑/↓ move focus (wrapping), Enter activates; the first row is focused on open.
- `Continue` appears only when a live world exists; its meta is `name · Day N` (from `saves.list()`).
- Items: `Continue`, `Worlds`, `Options`, `About`.
- **Removed:** the kicker `A Hawaiian Islands survival game`, the `Last world` / `Worlds` hints, `Singleplayer`, `Controls`, `Credits`, the attribution footer, the gold gradient and glow on the wordmark, the padded boxes behind menu items.

**About** (replaces `credits()`): panel 560, title `About`, close button, body one `.stats`-style key–value list (single column, label 120 w):

| Label | Value |
|---|---|
| Version | 0.1 |
| Terrain | AWS Terrain Tiles: USGS 3DEP, SRTM, ETOPO1, GMRT |
| Scale | 1:8 |
| Textures | Poly Haven (CC0) |
| Sounds | Freesound (CC0) via Tidewater |
| Characters | Microsoft Rocketbox (MIT) |
| Interface basis | [Tidewater](https://github.com/dgreenheck/tidewater) (MIT) |
| Engine | three.js |
| Fonts | Inter, JetBrains Mono (OFL) |

Links in `--accent`. The three prose paragraphs and `Mahalo for playing. Stay off the beaches after dark.` are removed.

---

## 11. Worlds, new world, world details

### 11.1 Worlds (`Menus.worlds`)

```
┌ Worlds ─────────────────────────────────────── [⤓ Import] [+ New world]  (✕) ┐  panel 880 × min(640u, 90vh)
├───────────────────────────────────────────────────────────────────────────────┤
│ ┌thumb 96×54┐ Honolulu run                                  (✎)(⧉)(⤒)(del)   │  row 72 h; actions show on hover or selection
│ └───────────┘ NORMAL   Day 12 · 3h 20m · Today 14:02                          │  t-label --ink-3 · t-body tnum --ink-3
│ ┌thumb──────┐ Test                                                             │
│ └───────────┘ CREATIVE   Day 1 · 12m · Sep 28                                  │
│ ┌thumb grey─┐ Iron man                                         (60% opacity)   │
│ └───────────┘ HARD · HARDCORE · DEAD   Day 4 · 1h 02m · Sep 21                 │  HARDCORE and DEAD in --alarm
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                      [ Play ] │  foot: primary Play (disabled: nothing selected or dead)
└───────────────────────────────────────────────────────────────────────────────┘
```

- Row: grid `96 | 1fr | auto`; thumb radius 4 (grayscale when dead); name t-body 600; meta: difficulty (`EASY`/`NORMAL`/`HARD`, or `CREATIVE` for creative worlds), then `HARDCORE`, `DEAD` when true, as `.t-label` separated by ` · `; then `Day N · fmtTime( playTime ) · fmtDate( lastPlayed )` in t-body tnum `--ink-3`.
- Row actions (`.btn.icon`, titles): `Details` (edit), `Duplicate`, `Export`, `Delete` (trash; `--alarm` on hover; confirm `Delete “Name”?` with a `Delete` danger button, no body).
- Keyboard: ↑/↓ select, Enter or double-click plays, F2 opens Details, Del deletes, N opens New world, Esc returns to the title.
- Empty list: the list area shows only a centred `.btn.primary` `New world`.
- Import: the hidden file input stays; success toast `Imported`; failure toast is the error message.
- **Removed:** the subtitle `Worlds are saved in this browser…`, `No worlds yet. Create one…`, `That hardcore world is over — its survivor died.` (Play is disabled instead), the seed in the row (it moves to Details), `played`, the global Edit / Export / Delete buttons, `Play selected world`, `Import world…`, `Create new world`.

### 11.2 New world (`createWorld`)

Panel 560, title `New world`, option rows 40 h (label t-body `--ink-2`, control right-aligned in a 280 column):

| Row | Control | Value |
|---|---|---|
| Name | `.input` 280 w, max 40, focused and selected | `New World` |
| Seed | `.input` 280 w, `.t-mono`, placeholder `Random` | blank = random |
| Mode | `.seg` `Survival` `Creative` | `survival` |
| Difficulty | `.seg` `Easy` `Normal` `Hard` | `normal` |
| Hardcore | `.toggle`; disabled and off while Creative is selected | `false` |
| Day length | `.seg` `24` `48` `96` `144`, then `min` (t-label `--ink-3`) | `48` |
| Start time | `.seg` `07:30` `12:00` `17:30` `21:00` | `7.5` |
| Spawn | select (4.7): `Random`, `Oʻahu`, `Kauaʻi`, `Maui`, `Hawaiʻi`, `Molokaʻi`, `Lānaʻi`, `Niʻihau` | `random` |

Footer: `Cancel` (secondary) and `Create` (primary). Enter creates, Esc goes back to Worlds. **Removed:** the subtitle, all five row hints, `World name`, `Game mode`, `Start at`, `Wash up on`, `On — one life`, `2 h 24`, `Morning/Noon/Evening/Night`, `Any island (random beach)`, `Hawaiʻi (Big Island)`, `Create world`.

### 11.3 World details (`editWorld`)

Panel 560, title `World`. Rows: `Name` (`.input`), `Seed` (`.t-mono` value + `.btn.icon.sm` `duplicate` titled `Copy`, which copies to the clipboard and toasts `Copied`). Then a `.stats` table: `Created` (date), `Played` (`fmtTime`), `Kills`, `Deaths`, `Distance` (`14.2 km`). Footer: `Delete` (danger) at left; spacer; `Duplicate`, `Export`, `Save` (primary). **Removed:** `Edit world`, the subtitle, `Survivor stats` and its sentence.

---

## 12. Options (`Menus.options`)

Reference render: `docs/ui/spec-options.jpg`.

### 12.1 Frame

```
┌ Options ────────────────────────────────────────────────────────────── (✕) ┐  panel min(800u, 100vw−32px) × min(640u, 100vh−48u), fixed
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Graphics  ▓  │ QUALITY                                                      │  rail 176 w, padding 12 8, right hairline
│ Interface    │ Preset                  [Low|Medium|High|Ultra|Custom]       │  content: padding 8 24, scrolls
│ Audio        │ VIEW                                                         │
│ Controls     │ Render distance        ━━━━●──────────────   1.4 km          │
│ Keys         │•Field of view          ━━━━━━━━●─────────     90°   ↺       │  • changed dot, ↺ per-row reset
│ Gameplay     │ …                                                            │
├──────────────┴──────────────────────────────────────────────────────────────┤
│ [Reset tab]                                                         [Done] │  foot 56
└─────────────────────────────────────────────────────────────────────────────┘
```

- The panel size never changes between tabs. The last tab is remembered (`this._optTab`, existing).
- `Reset tab` (secondary) asks `Reset <Tab>?` (no body, `Reset` primary) and sets each key of that tab to `DEFAULTS[ key ]` (`hudMode` → `'auto'`). Graphics resets through `settings.applyPreset( DEFAULTS.quality )` plus its non-preset keys. On the Keys tab it asks `Reset keys?` and restores `DEFAULT_BINDINGS`.
- `Done` (primary) and Esc return to the caller (title or pause). Changes apply live (existing). In game the screen is `.screen`; from the title it is `.screen.bare`.

### 12.2 Tabs and rows

Rows marked **new** add a control for a key that exists but had none, or a new UI-only key. Everything else maps to today's keys.

**Graphics**

| Section | Row | Control | Key |
|---|---|---|---|
| Quality | Preset | `.seg` Low / Medium / High / Ultra, plus a disabled `Custom` segment shown selected when any `QUALITY_PRESETS[quality]` key differs | `quality` via `applyPreset` |
| View | Render distance | slider 400–4000, step 100, `1.4 km` | `renderDistance` |
| View | Field of view | slider 60–110, step 1, `80°` | `fov` |
| View | Resolution | slider 0.5–1.5, step 0.05, `100%` | `renderScale` |
| Detail | Shadows | `.seg` Off / Medium / High / Ultra | `shadows` |
| Detail | Terrain | `.seg` Low / Medium / High / Ultra | `terrainDetail` |
| Detail | Vegetation | `.seg` Low / Medium / High / Ultra | `vegetation` |
| Detail | Grass | toggle | `grass` |
| Detail | Clouds | `.seg` Off / Low / High | `clouds` |
| Detail | Water | `.seg` Low / Medium / High | `water` |
| Image | Anti-aliasing | `.seg` Off / FXAA / MSAA | `antialias` |
| Image | Bloom | toggle | `bloom` |
| Image | Night brightness | slider 0.3–2, step 0.05, `100%` | `nightBrightness` |

**Interface**

| Row | Control | Key |
|---|---|---|
| GUI scale | slider 0.7–1.6, step 0.05, `100%`; commits on release | `guiScale` |
| HUD | `.seg` Auto / Always | **new** `hudMode` (default `'auto'`) |
| Crosshair | `.seg` Dot / Dynamic / None | `crosshair` (`dot` / `lines` / `none`) |
| Compass | toggle | `compass` |
| Minimap | toggle | `minimap` |
| Hit markers | toggle | `hitMarkers` |
| Damage direction | toggle | `damageIndicators` |
| Prompts | toggle | `showInteractHints` |
| Key hints | toggle | `tutorial` |
| FPS | toggle | `showFps` |

**Audio:** Master `masterVolume`, Effects `sfxVolume`, Ambience `ambientVolume`, **Music `musicVolume` (new row; `Audio.applyVolumes` already reads it)**, Interface `uiVolume`. Sliders 0–1, step 0.01, `80%`.

**Controls**

| Row | Control | Key |
|---|---|---|
| Sensitivity | slider 0.2–3, step 0.05, `1.00×` | `sensitivity` |
| Invert Y | toggle | `invertY` |
| Crouch | `.seg` Hold / Toggle | `toggleCrouch` (false / true) |
| Aim | `.seg` Hold / Toggle | `toggleAim` |
| Sprint | `.seg` Hold / Toggle | `toggleSprint` |
| Head bob | slider 0–1, step 0.05, `100%` | `headBob` |

**Keys:** 12.3. This tab is the single controls reference; the `controls()` screen is removed.

**Gameplay**

| Row | Control | Key |
|---|---|---|
| Auto-pickup ammo | toggle | `autoPickupAmmo` |
| Map and compass | `.seg` Always / Need item | `realisticMap` (false / true) |

Not exposed: `subtitles` and `units` (nothing reads them yet).

### 12.3 Keys

```
┌ ⌕ Search ──────────────────────────────────────────┐   .search, sticky at the top of the content
MOVEMENT
Forward                          [   W   ]  [       ]  ↺        row 40 h: label · two bind buttons 96 × 28 · reset slot 24
Sprint                           [ Shift ]  [       ]
ACTIONS
Interact                         [   F  •]  [       ]           conflict: --alarm inset + 6u --alarm dot top-right; title "Also: Horn"
Reload                           [   ▌   ]  [       ]           listening: --accent inset, blinking 2×14u accent caret
HOTBAR
Hotbar                  [1][2][3][4][5][6][7][8][9]              one row, nine 28 × 28 caps (primary binding of slot1…slot9)
MENUS … VEHICLE …
foot while listening: [Esc] Cancel  [Backspace] Clear      (replaces Reset tab until a key is pressed)
```

- Groups (t-label headers) and actions are today's: Movement, Actions, Hotbar, Menus, Vehicle.
- Bind button: 96 × 28, `--bg-2`, `inset 0 0 0 1px --line-2`, radius 4, JetBrains Mono 12/600 `--ink-1`, text `prettyCode( code )`; Mouse0/Mouse2 show the mouse glyph; an unbound cell is empty.
- Click → listening; `input.capture` as today (Esc cancels, Backspace or Delete clears, any other code binds). **Removed:** `Press a key…` and the tooltip `Click, then press a key. Esc cancels, Backspace clears.`
- Conflicts: same rule as today (vehicle-only actions may share keys with on-foot actions); the `title` reads `Also: Map, Horn`.
- Per-row reset (`reset` icon) appears when the row differs from `DEFAULT_BINDINGS`.
- **Search** filters rows by label (case-insensitive) **or by key**: a query that equals `prettyCode` of a bound code (case-insensitive, for example `f`, `shift`, `rmb`) lists every action bound to it.
- **Labels** (UI-side, overriding `BINDING_LABELS`; every other action keeps its label): forward `Forward`, back `Back`, left `Left`, right `Right`, jump `Jump`, walk `Walk`, interact `Interact`, fire `Fire`, aim `Aim`, melee `Melee`, zoom `Hold breath`, freelook `Free look`, camera `Camera`, vehicleUp `Climb`, vehicleDown `Descend`, log `Status`, debug `Debug`, craft `Craft`.

---

## 13. Pause (`Menus.pause`)

```
  (world visible, scrim linear-gradient(90deg, rgba(6,7,8,.85) 0%, rgba(6,7,8,.45) 45%, rgba(6,7,8,.15) 80%))

  PAUSED                                .t-label --ink-3                     column left 96, bottom 96
  Honolulu run · Day 3                  t-body --ink-2, 32u below: rows
  Resume              [Esc]             rows 40 h like the title screen; HUD key cap after Resume
  Options
  Save
  Creative mode                         or "Survival mode"; row id 'mode'; removed in hardcore
  Quit to title                         saves first (existing)
```

- `Save` runs `g.saveNow( true )` and shows the menu toast `Saved`.
- The mode row runs `/gamemode …` as today; remove it by id, not `col.children[ 5 ]`.
- Keyboard as the title screen; Esc resumes.
- **Removed:** the big `PAUSED` heading, the kicker `Day N · name`, `Controls` and its wrong `F1` hint (F1 is Hide HUD), the `Game mode` hint, `Switch to …`, `Save world`, `World saved`, `Save & quit to title`.

---

## 14. Death (`Menus.death`)

Reference render: `docs/ui/spec-death.jpg`.

```
                           (world: backdrop-filter grayscale(1) brightness(.55) over 600 ms, scrim rgba(6,7,8,.6))

                                          Bled out                       .t-display --ink-1
                                                                         24u
                                   2 d 4 h            14                 .t-num --ink-1, 48u apart
                                  SURVIVED           KILLS               .t-label --ink-3, 6u under
                                                                         32u
                               [  Respawn  ]   [   Quit   ]              .btn.lg, min 140 w; primary + secondary
                                        WORLD OVER                        hardcore only: .t-label --alarm, 16u above a single [ Quit ]
```

- Sticky screen (existing). Content fades in 400 ms after the filter starts. Enter = the primary button (focused).
- Survived: `fmtDur( info.days * 24 )`. Kills: `g.stats.lifeKills || 0`.
- Buttons: `Respawn` → `g.respawn(); ui.closeScreen(); input.lock()` (existing); `Quit` → `app.quit( true )` then `ui.exitGame()` (hardcore: `app.quit( false )`).
- **Cause title** from `info.cause`:

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

- **Removed:** the `You died` kicker, the `DEAD` heading, `Cause of death:`, the `Travelled` and `Lives` stats, `Infected killed`, `Respawn on a beach`, `Quit to title`, `Back to title`, `Hardcore: this world is over.`, `Your body — and everything you carried — stays where you fell. It is marked on your map.`

---

## 15. Loader (`index.html`, `main.js` strings)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                        (key art .loader-art, bottom scrim .loader-scrim)                 │
│                                                                                          │
│  D E A D T I D E                                     .loader-title = .wordmark 56u       │
│                                                      32u                                 │
│  Building terrain                          42%       .loader-status t-body --ink-2 · .loader-pct tnum --ink-3
│  ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░        .loader-bar 480 × 2, --fill-3; .loader-fill --accent
└──────────────────────────────────────────────────────────────────────────────────────────┘
   .loader-inner: left 96, bottom 96, width 480
```

Final markup (the four selectors `main.js status()` queries are kept):

```html
<div id="loader" role="status" aria-live="polite" aria-label="Loading">
	<div class="loader-art-fallback"></div>
	<img class="loader-art" src="ui/keyart.jpg" alt="" decoding="async" fetchpriority="high" onload="this.classList.add('is-in')" onerror="this.remove()" />
	<div class="loader-scrim"></div>
	<div class="loader-inner">
		<h1 class="loader-title">DEADTIDE</h1>
		<div class="loader-row"><span class="loader-status">Starting…</span><span class="loader-meta"><span class="loader-pct">0%</span><span class="loader-time">0:00</span></span></div>
		<div class="loader-bar"><div class="loader-fill"></div></div>
	</div>
</div>
```

- `#loader` sets its own `font-family: var(--font)` and colours (it is outside `.tw-root`). `.loader-time { display: none }` (main.js still writes it; the node must stay). `.loader-fill` keeps `transform-origin: left` (main.js sets `scaleX`).
- `.loader-art` fades in over 600 ms; no Ken Burns.
- `.loader-art-fallback`: `--bg-0` (the sunset gradient goes).
- Error (`#loader.tw-error`): status `--alarm` and wraps (the message follows `Failed: `), fill `--alarm`.
- `<title>` becomes `Deadtide`.
- **Removed:** `.loader-kicker`, `.loader-tagline`, `.loader-glint`, the whole `.loader-tips` block (the `Tip` label and eight tip sentences), the Ken Burns and tip keyframes.

---

## 16. Dialogs, menu toasts, lock hint

| Call | Title | Body | Verb |
|---|---|---|---|
| Delete world | `Delete “Name”?` | none | `Delete` (danger) |
| Reset a settings tab | `Reset Graphics?` (the tab name) | none | `Reset` (primary) |
| Reset keys | `Reset keys?` | none | `Reset` (primary) |

Menu toasts (4.15): `Saved`, `Imported`, `Copied`, error messages. Lock hint (5.12): `Click to resume`.

---

## 17. Text to cut or shorten (UI-owned files)

`→ cut` means the string and its element go. Everything here is in the UI code map.

### index.html

| Current | New |
|---|---|
| `<title>Deadtide — Hawaiian Islands</title>` | `Deadtide` |
| `aria-label="Loading Deadtide"` | `Loading` |
| Font link `Inter:wght@400;500;600;700` + `JetBrains+Mono:wght@400;500` | `Inter:opsz,wght@14..32,500..600` + `JetBrains+Mono:wght@500;600` |
| `.loader-kicker` `A Hawaiian Islands survival game` | cut |
| `.loader-tagline` `Eight islands, one week after the outbreak. Scavenge the towns, arm yourself, and stay alive from Kauaʻi to the Big Island.` | cut |
| `.loader-tips`: `Tip` + 8 sentences (`Look at loot and press F…`, `Gunshots carry…`, `Water first…`, `Bleeding kills fast…`, `Police stations…`, `Boats and the tour helicopters…`, `Press T for chat…`, `The summits of Mauna Kea…`) | cut |
| `.loader-glint` | cut |
| `.loader-time` `0:00` | keep the node, hidden by CSS |

### src/main.js (status strings only)

| Current | New |
|---|---|
| `'Entering the world'` | `'Entering world'` |
| `'Populating the area'` | `'Spawning'` |
| `'Failed to start: ' + e.message` | `'Failed: ' + e.message` |

### src/ui/UI.js

| Current | New |
|---|---|
| `TIPS` (5 sentences: `Move with …, sprint with …, crouch ….`, `Press … to check what you washed up with. Drag items onto your clothes to carry more.`, `Find a town. Look at loot and press … to take it; cupboards, fridges and lockers can be searched.`, `… opens the map. Double-click it to place a marker you'll see on the compass.`, `… opens chat — type /help for commands (/give, /tp, /time, /locate, /summon…).`) | key-cap hints (5.11): `Move`, `Sprint`, `Crouch`, `Inventory`, `Map`, `Fly`, `Chat` |
| `announceSpawn`: `` `Creative mode — ${where}. Double-tap Space to fly.` `` and `` `You wake up on the shore. ${where}.` `` | cut (location card + `Fly` hint) |
| `'Click to continue'` | `'Click to resume'` |
| `'You need a map (realistic map is on in Options)'` | `'No map'` |
| `locationName` long form `` `${isl.name} — near ${near.name}` `` | `` `Near ${near.name}, ${isl.name}` `` when the nearest town is within 3 of its radii, else `isl.name` (in town it stays `Town, Island`) |
| journal title `'Survival journal'`, sub `` `Day ${g.day}` `` | `'Status'`, meta `Day 4` |
| journal sections `'Condition'`, `'This life'`, `'Where'` | `CONDITIONS` (only when active), `BODY`, `THIS LIFE`, `ALL LIVES`; `Where` cut |
| journal: 10 advice sentences (`You are bleeding. Use a bandage or rags (right-click → Bandage) — blood loss kills.` … `You are holding up. Keep water and a bandage on you at all times.`) | condition rows with 1–2 word remedies (7) |
| `'Infected killed'`, `'Distance travelled'`, `'Items looted'`, `'Total infected killed'` | `'Kills'`, `'Distance'`, `'Looted'`, `'Kills'` (under All lives) |
| `days.toFixed( 1 ) + ' days'` | `fmtDur` (`2 d 4 h`) |
| `'✕'` text buttons | `close` icon buttons |

### src/ui/HUD.js

| Current | New |
|---|---|
| Compass 15° number labels | cut |
| Readout `` `${deg}°  ·  ${hour}  ·  Day ${day}  ·  ${loc}` `` | heading tab `318°` |
| Vital titles `Health`, `Blood`, `Food`, `Water`, `Body temperature`, `Energy`, `Breath`, `` `Body temperature … °C — outside … °C` `` | cut |
| `▲` / `▼` | chevron icons, 1–3 |
| Condition pills with text | icon chips; label for 6 s on appear or change |
| Prompt `<span class="dim">hold</span>` | hold ring on the key cap |
| Ring label `` `${label}…  (move to cancel)` `` | `${label}` + `2.4 s` |
| Weapon sub line (calibre, or the category word such as `tool`) | cut |
| Ammo `31<small> / 30</small>` | `31` + magazine glyph + `90` |
| Vehicle `Fuel`, `Condition`, `` `Gear ${n}` ``, `` `ALT ${n} m` `` | icons + `42%` / `88%`, gear chip `3`, altitude icon + `420 m` |
| Minimap label (long location) | cut (footer: short place + time) |
| Debug first line `Deadtide — ` | cut |

### src/ui/InventoryUI.js

| Current | New |
|---|---|
| h2 `Inventory` | cut (top bar shows `Day 3 · 14:20`) |
| `Double-click: use / equip · Shift-click: move · Right-click: actions · 1–9: hotbar` | cut |
| `` `${w} kg carried — overloaded` `` | weight meter + `11.2 kg` |
| h3 `Carried` + `` `${used} / ${cap} space` `` | `CARRIED` + `7.5/40` |
| `Sort` button, title `Sort every container by type and name` | `sort` icon button, title `Sort` |
| `Wear clothes with pockets or a backpack to carry more.` | cut |
| Tab label = open container's label | always `Nearby` (the container is a section title) |
| Tab `Crafting` | `Craft` |
| Ground `` `${n} items` `` | `${n}` |
| `Drop items here`, container `Empty` | cut (well) |
| h3 `Character` + `Creative` / `` `Day ${day}` ``, h3 `Weapons` | cut |
| `` `In hands: ${name}` `` / `Hands empty` | Hands cell |
| Slot labels `HEAD`, `EYEWEAR`, `FACE`, `TOP`, `VEST`, `BACK`, `GLOVES`, `PANTS`, `SHOES`, `BELT`, `SHOULDER`, `SHOULDER 2`, `HOLSTER`, `MELEE` | glyphs; slot name in the hover tooltip; `Shoulder` → `Primary`, `Shoulder 2` → `Secondary`, `Holster` → `Sidearm` |
| Tag `HELD` | accent dot |
| Char stats `Weight`, `Blood … ml`, `Body temp … °C`, `Outside … °C`, `Bite protection`, `Infected killed` | cut (top bar), `Blood 92%`, `Body 36.9°`, `Air 27°`, `Bite`, cut (Status); add Food, Water, Energy |
| Tooltip `` `${CATEGORY_LABEL} · ${rarity}` `` | `CATEGORY · calibre / slot / liquid` |
| Tooltip `d.desc` | cut (books keep it) |
| Tooltip `` `Double-click: ${label}` `` | cut |
| Tooltip rows `Weight`, `Size`, `Slot`, `Calibre` | footer `3.40 kg` / `Size 4`; meta |
| `Rate of fire` · `Loaded 31 (STANAG magazine)` | `Rate 800 rpm` · `Loaded 31/30` |
| `Calories` · `Hydration` | `Food +13` · `Water +50` |
| `Raw: cook it first`, `Sealed: needs a can opener or a blade`, `Alcohol: yes`, `Splints fractures: yes` | flags `Raw`, `Sealed`, `Alcohol`, `Splint` |
| `Stops bleeding` · `Heals` · `Treats infection` · `Bite protection` | `Bleeding −1` · `Health +20` · `Infection −60%` · `Bite` |
| `Contents: empty` | `Empty` |
| Deny `` `${name} doesn't go there` `` / `` `${name} doesn't go in that slot` `` | drag chip `Wrong slot` (toast `Wrong slot` outside a drag) |
| `It can't go inside itself` | drag chip `Can't nest` |
| `Not enough room` | `No room` |
| `Only part of it fits` | drag chip `4/6` (toast `Part fits` outside a drag) |
| `No room — dropped it` | `Dropped` |
| Menu hints `Shift-click`, `Double-click`, `hover + 1–9` | key caps `[Shift]`, `[mouseL 2×]`, `[1–9]` |
| `Hold in hands` · `Add to hotbar` · `` `Remove from hotbar ${n}` `` · `Split stack` · `` `Put in ${label}` `` | `Hold` · `Bind` · `Unbind` + `n` · `Split` · `Move to ${label}` |
| `Remove magazine` · `` `Insert magazine (${n})` `` · `Load rounds` · `Empty magazine` | `Eject mag` · `Insert mag` + `n` · `Load` · `Unload` |
| Catalog menu `Give 1`, `` `Give ${d.stack}` ``, `Give 5` | `Give 1`, `Give 5`, `` `Give ${d.stack}` `` |
| Split title `` `Split ${name}` `` | cut |
| `Crafting is not available.` · `No recipes.` | tab omitted · nothing |
| Recipe need text `` `${q}× ${name}` ``, `` ` · ${tool}` ``, `` ` · at a ${station}` `` | requirement chips |
| Catalog `Search items…` · `` `${n} items · click to take one, Shift-click for a full stack, or drag` `` · `Nothing matches.` | `Search` · count inside the search field · nothing |

### src/ui/Menus.js

| Current | New |
|---|---|
| Title kicker `A Hawaiian Islands survival game` | cut |
| Title hints `Last world`, `Worlds` | world `name · Day N`; cut |
| `Singleplayer` · `Credits` · `Controls` (title and pause) | `Worlds` · `About` · cut |
| Title footer `Terrain: AWS Terrain Tiles (USGS, SRTM, ETOPO1) · Textures: Poly Haven (CC0) · Sounds: Freesound CC0 via Tidewater<br>Built with three.js · Deadtide v0.1` | `v0.1` |
| Worlds panel title `Singleplayer` + sub `Worlds are saved in this browser. Export them to keep a backup or move them to another computer.` | `Worlds`; sub cut |
| `Imported “${name}”` | `Imported` |
| `That hardcore world is over — its survivor died.` | cut (Play disabled) |
| Delete confirm body `This world will be gone forever (export it first to keep a copy).` | cut |
| Empty `No worlds yet.<br>Create one to wash up on a beach somewhere in Hawaiʻi.` | cut (centred `New world` button) |
| Badge `hardcore · dead`; row `played ${t}`; `seed ${seed}` | `HARDCORE` `DEAD`; `${t}`; seed to Details |
| `Play selected world` · `Import world…` · `Create new world` · `Edit` / `Export` / `Delete` buttons | `Play` · `Import` · `New world` · row icon buttons |
| New world title `Create new world` + sub `Eight islands, the infected, and whatever you can find.` | `New world`; sub cut |
| Hints `Loot, the infected and events come from the seed` · `Creative: fly, no hunger or damage, every item in the catalog` · `How fast you get hungry and how hard the infected hit` · `No cheats; the world ends when you die` · `Real minutes per game day` | cut |
| `World name` · `Game mode` · `Start at` · `Wash up on` | `Name` · `Mode` · `Start time` · `Spawn` |
| Seed placeholder `Leave blank for a random seed` | `Random` |
| Hardcore `Off` / `On — one life` | toggle |
| `24 min` `48 min` `96 min` `2 h 24` | `24` `48` `96` `144` + `min` |
| `Morning` `Noon` `Evening` `Night` | `07:30` `12:00` `17:30` `21:00` |
| `Any island (random beach)` · `Hawaiʻi (Big Island)` | `Random` · `Hawaiʻi` |
| `Create world` | `Create` |
| `Edit world` (+ world name sub) · `Survivor stats` + `` `${k} infected killed · ${d} deaths · ${km} km walked` `` | `World` · stats table `Kills`, `Deaths`, `Distance` |
| Credits: 3 paragraphs + `Mahalo for playing. Stay off the beaches after dark.` | About table (10) |
| Options sub `Saved automatically.` | cut |
| Tabs `Display`, `Graphics`, `Key bindings` | `Graphics`, `Interface`; `Keys` |
| `Resolution scale` · `Terrain detail` · `Mouse sensitivity` · `Invert mouse Y` · `Toggle crouch` / `Toggle aim` / `Toggle sprint` · `Show FPS` · `Interaction hints` · `Tutorial tips` · `Pick up ammo automatically` · `Realistic map & compass (need the items)` | `Resolution` · `Terrain` · `Sensitivity` · `Invert Y` · `Crouch` / `Aim` / `Sprint` (Hold / Toggle) · `FPS` · `Prompts` · `Key hints` · `Auto-pickup ammo` · `Map and compass` (Always / Need item) |
| `Reset to defaults`; confirm `Reset all options?` / `Key bindings are kept.` | `Reset tab`; `Reset Graphics?` (tab name), no body |
| Keybind title `Click, then press a key. Esc cancels, Backspace clears.` · `Press a key…` · `Also bound to: …` · `—` · `Reset key bindings` | footer key caps while listening · caret · `Also: …` · empty · `Reset tab` on the Keys tab |
| Pause kicker `` `Day ${d} · ${name}` `` + h1 `PAUSED` | `PAUSED` label + `name · Day N` |
| Pause hints `Esc`, `F1`, `Game mode` | Esc key cap on Resume only |
| `Switch to survival` / `Switch to creative` · `Save world` · `World saved` · `Save & quit to title` | `Survival mode` / `Creative mode` · `Save` · `Saved` · `Quit to title` |
| Death `You died` + `DEAD` + `` `Cause of death: ${cause}` `` | cause title (14) |
| Death stats `Infected killed`, `Travelled`, `Lives` | `Kills`; cut; cut |
| `Respawn on a beach` · `Quit to title` · `Back to title` | `Respawn` · `Quit` · `Quit` |
| `Hardcore: this world is over.` · `Your body — and everything you carried — stays where you fell. It is marked on your map.` | `WORLD OVER` (hardcore only) · cut |
| `controls()`: 33-row key grid, paragraphs `Looting.` / `Staying alive.` / `The infected` / `Commands.`, sub `Rebind keys in Options → Key bindings.`, button `Key bindings…` | whole screen cut (Options › Keys) |

### src/ui/MapUI.js

| Current | New |
|---|---|
| Sub `Drag to pan · wheel to zoom · double-click to mark · C to centre · Shift-click to teleport` | cut |
| Buttons `+` `−` `Me` `Islands` `Close` | icon buttons (titles `Zoom in`, `Zoom out`, `Centre`, `All islands`, `Close`) |
| Legend `Freeway`, `Highway / street`, `Dirt road`, `Building`, `Marker`, `Your body` | Layers popover: `Roads`, `Buildings`, `Grid`, `Markers`, `Vehicles` |
| Coords `` `${x}, ${z}  ·  elev ${m} m (real)  ·  ${d} away` `` / `depth … m` | `x, z · 312 m · 1.4 km` / `−40 m` |
| Scale `` `${d} (game)` `` | `${d}` |
| Toast `Teleported` | cut |
| Marker label `` `Marker ${n}` `` | `${n}` |

### src/ui/Chat.js

| Current | New |
|---|---|
| Placeholder `Say something or type /help` | cut |
| `` `Welcome to Deadtide. Press ${key} to chat, type /help for commands.` `` | cut |

### src/ui/itemIcons.js, dom.js

| Current | New |
|---|---|
| Glyph stroke `#cfe6ee` | `#B6BAC1` |
| `ICON` set | section 3 |

---

## 18. moduleTextToTrim (for the lead; not edited by the UI)

Checked against the files as they are now; many module strings were already shortened by their owners and are not listed.

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

| File | Work |
|---|---|
| `ui.css` | Replace the whole file with 2.8 (tokens, base, components), 5.13 (HUD) and 22 (screens), in that order. Delete `.tw-glass`, `.loader-glint`, `.loader-tips`, `.loader-kicker`, `.loader-tagline`, the `tw-kenburns`, `tw-glint` and `tw-tip` keyframes, `.menu-btn` boxes, `.badge.creative` sun colour, `.item.r-*`, `.weight-bar`, `.status.*` pills, `.help-grid`, `.title-foot`, and every aqua/sun/coral/green variable. Keep `.tw-root [hidden]`, `#loader.tw-hidden`, `#loader.tw-error`. |
| `dom.js` | New `ICON` (3); `icon()` unchanged except the `class="i …"`; add `unitPx()` (2.1), `fmtDur( hours )` (`35 min` / `4 h` / `2 d 4 h`), and `kc( label, cls )` → `<span class="kc …">` (the labels `LMB` and `RMB` render the `mouseL` / `mouseR` glyph instead of text). `h`, `clear`, `fmtTime`, `fmtDate`, `fmtDist` unchanged. |
| `itemIcons.js` | Stroke colour only. |
| `UI.js` | Add `.feed` (toasts) and `.lock` layers; `.hud.under` while `this.screen`; `u` cache (`unitPx` on resize and `guiScale`); `HINTS` (5.11) replaces `TIPS` / `_tips` / `tipEl`; `announceSpawn()` → `hud.showPlace( true )` (+ creative hint); `journal()` → Status (7); `confirm()` per 4.17; `locationName()` long form (17); map-denied toast `No map`. Keep `show`, `closeScreen`, `screenOpts`, `openInventory`, `openContainer`, `showDeath`, `blocking`, `enterGame`, `exitGame`, `update`, `_quickHeal`, `screenshot`, hotkey routing. |
| `HUD.js` | Build every element once (5.1). Visibility helper (5.2). Compass without numbers + heading tab + marker distance (5.3). Minimap plate with footer, canvas sized by `ui.u` (5.4). Vitals strip with tiers (5.5). Condition chips + bandage key cap (5.6). Weapon panel (5.7). Location card `showPlace()` (5.8). Prompt with hold ring, jam / reload key caps (5.9). Ring with seconds (5.10). Toast merge in `.feed`, pickup merge (5.12). Vehicle panel built once. Damage arc SVG. Crosshair gap variable renamed `--gap-px` (the `--gap` token is the cell gap). |
| `InventoryUI.js` | Rendering only changes: `render`, `_renderLeft`, `_renderMid`, `_container` → section, `_slot`, `_item`, `_tip`, `_menu`, `_split`, `_crafting`, `_catalog`, plus the top bar, Hands cell, hotbar strip, search, collapse set. Add `_accepts()` (6.9), `_locOf( uid )`, drop-on-scrim, the new shortcuts (6.8). Keep `move`, `_place`, `_quickMove`, `_dropOnItem`, `_takeAll`, `_sort`, `_removeFrom`, `_otherChanged`, `_defaultLabel`, `_default` and every `game.*` call as they are; `_deny()` stays but only plays the sound while dragging. Keep the property names `other` and `leftTab` (modules read `ui.inventory.other`). |
| `Menus.js` | `panel()` gains an optional rail; `title()`, `about()` (replaces `credits()`), `worlds()`, `createWorld()`, `editWorld()`, `options()`, `_keybinds()`, `pause()`, `death()` per 10–14. Delete `controls()`. |
| `MapUI.js` | Chrome (8.1), layers and markers popovers, right-click menus, rename, keyboard pan/zoom, DOM scale bar, readout format. |
| `MapView.js` | Palette and label sizes × `opts.u` (8.2), `opts.layers`, level-0 prefetch, tile fade-in. `draw( ctx, view, opts ) → { toScreen, toWorld }` keeps its signature. |
| `maptile.js` | Sea stops, land desaturation, hillshade clamp (8.2). |
| `Chat.js` | Remove the welcome line and placeholder; closed plates; open panel; ghost completion; mono while the value starts with `/`. |
| `index.html` | Loader markup and font link (15). |
| `main.js` | Three status strings (17). |

### 19.2 Integration points that must keep working (grep before changing)

- `game.hands`: `aiming`, `ammoInfo() → { reserve, mode }` (`mode === 'jammed'`), `crosshairSpread()`, `viewFov()`, `held`, `select( stack )`, `holster()`, `loadMagazine`, `unloadMagazine`, `loadWeapon`, `unloadWeapon`, `insertMagazine`, `removeMagazine`, `attach`, `detach`.
- `game.vehicles.hud() → { name, speed, fuel, health, gear, kind, altitude?, heading } | null`, `vehicles.known()`, `vehicles.driving`.
- `game.items3d.near( pos, r )` / `remove( wi, { taken } )`, `game.dropStack( stack )`, `game.give( id, n )`.
- `game.itemUse.actions( stack ) → [ { label, run } ]`, `use( stack )`.
- `game.crafting`: `recipes`, `canCraft( r )`, `check( r )`, `craft( r )`, `liquidAvailable( kind )`, `boilable()`; `game.nearFire( pos )`; `inv.hasTool( kind )`.
- `game.markers`: `list()`, `add( { x, z, label, kind } )`, `remove( id )`, `clear()`; markers are plain objects, so rename is `m.label = value`.
- `game.creatures.stats()` (debug), `game.survival` fields used in 5.5–5.6 and `conditions()`, `maxStamina()`, `lastHitDir`, `envTemp`, `wet`.
- `game.interact.target { label, sub?, key?, hold? }`, `interact.holdT`; `game.actions.busy / progress / current { label, t, time }`.
- Events: `toast { text, kind, icon }`, `hitmarker { kill, headshot }`, `item:pick { stack }`, `item:drop`, `chat { text, kind }`, `container:changed`, `container:close`, `kill`.
- `ui.openContainer`, `ui.closeScreen`, `ui.inventory.other`, `ui.map.open`, `ui.locationName( pos, long )`, `ui.announceSpawn`, `ui.showDeath`, `ui.blocking`, `ui.enterGame`, `ui.exitGame`, `ui.hideAll`, `ui.showTitle`, `ui.update`.
- Settings keys (all existing) plus `hudMode` (new, read with `?? 'auto'`); `settings.get / set / on / applyPreset / resetAll`, `DEFAULTS`, `DEFAULT_BINDINGS`, `QUALITY_PRESETS`, `BINDING_LABELS`.
- Input: `input.label( action )`, `input.codes( action )`, `input.codePressed( code )`, `input.capture`, `input.lock() / unlock()`, `prettyCode( code )`.
- `--gui` on `<html>` (set by `main.js`) multiplies `--u`.
- Loader selectors `.loader-status`, `.loader-pct`, `.loader-fill`, `.loader-time`; classes `tw-hidden`, `tw-error`.

### 19.3 Performance

- No `backdrop-filter` on the HUD or panels (the old HUD had 21 blurred glass surfaces over a live WebGL canvas).
- The HUD writes to the DOM only when a formatted value changes; vitals at 10 Hz, conditions every 20 frames, weapon every 4, vehicle every 3, minimap every 2nd frame, compass transform every frame.
- Panels built once where possible (weapon, vehicle); no `innerHTML` rewrites per frame.

### 19.4 Verification

- Build `test/preview/ui.html` + `test/preview/ui.js`: a stubbed `app` / `game` (survival values, an inventory with pockets, cargo shorts, a backpack and a rifle, markers, `vehicles.hud()` returning a truck, `hands.ammoInfo()`), mounting `UI` with no world. Add query switches for every HUD state (idle, damaged, aiming, vehicle, swimming, jammed, looting, timed action, key hint) and every screen, and screenshot each at 1920 × 1080, 1280 × 720 and 960 × 540, and at GUI 70% and 160%.
- Then one full-game session with `test/preview/session.mjs` over the s5 spots (01 sun, 05 street, 07 sand, 06 dusk, plus one at `hour=23`) to check legibility and that no `src/ui` error is logged.

---

## 20. Acceptance criteria

Each item is a yes/no check against the running game or the stub page.

### Global

- [ ] Every size in `ui.css` is `calc(N * var(--u))`, 1 px hairlines, or 1.5 px selection strokes. At GUI 70% and 160% every screen scales and nothing overflows at 1280 × 720 (160% may scroll inside panels, never the page).
- [ ] Only these hues appear as colour: `--accent`, `--warn`, `--alarm`, `--cold`, `--good` (tooltip deltas only). No aqua, sun, coral or green accents remain (`grep -n "5fe3d4\|ffb86b\|ff7a85\|8ee07a\|tw-aqua\|tw-sun\|tw-coral" src/ui` returns nothing).
- [ ] No `backdrop-filter` in `ui.css` except the death screen.
- [ ] No string in `src/ui`, `index.html` or the `main.js` status calls is on the cut list (17). No sentence of instructions appears anywhere; no `!`; no ellipsis except `Starting…`.
- [ ] Every icon in the UI comes from the section 3 set and renders crisp at 16u (1 px strokes).
- [ ] Keyboard focus is visible (2 px accent ring) on every control; Esc closes the top screen everywhere.
- [ ] `prefers-reduced-motion` removes slides and the blink.

### HUD

- [ ] Idle at full health on foot (Auto): only the crosshair, compass + heading tab, minimap and (if holding one) the collapsed weapon panel are visible. No vitals, no stamina bar, no hotbar, no FPS (with `showFps` off).
- [ ] Health 41 and bleeding ×2: the health cell (warn tint) and the blood cell (alarm tint, icon blinking, down chevrons) show; `Bleeding ×2` shows its label for 6 s, then only the icon and `×2`; `[K] Bandage` shows while a bandage is carried.
- [ ] Eating raises the food cell into view with up chevrons, and it leaves 3 s after the chevrons stop.
- [ ] `hudMode: Always` shows all six cells and never collapses the weapon panel.
- [ ] Weapon panel reads `31 ▮90 SEMI`; a jam shows the `JAM` chip and `[R] Clear` to the right of the crosshair.
- [ ] Looking at loot shows `[F] Take Canned tuna ×2` to the right of the crosshair; a hold target fills the ring around the key cap and no word `hold` appears.
- [ ] A timed action shows the ring and `Bandaging 2.4 s`, counting down.
- [ ] The compass has no degree numbers; the heading tab shows `318°`; a marker within ±20° shows its distance.
- [ ] Entering a new town shows the location card once (not again for 60 s); spawning shows it instead of a toast.
- [ ] In a vehicle the crosshair, hotbar and weapon panel hide and the vehicle panel shows speed, fuel, condition and gear with no words other than the vehicle name and unit.
- [ ] Two identical toasts within 2 s become one with `×2`. Toasts stay visible over the inventory.
- [ ] Every HUD string sits on a plate and reads on the s5 01, 05, 06, 07 spots and at night.
- [ ] Creative mode shows no vitals, conditions or stamina bar.

### Inventory

- [ ] No title, no hint sentence; the top bar shows `Day N · HH:MM`, search, weight meter with ticks at 18 and 30 kg, and close.
- [ ] Column widths 388 / 328 / 388u; the middle column never scrolls at 960 × 540.
- [ ] Empty slots show glyphs only; the slot name appears on hover.
- [ ] The held item has an accent dot and appears in the Hands cell; dropping a carried weapon on the Hands cell selects it.
- [ ] Starting a drag outlines every valid target; hovering an invalid one shows a red outline and the reason chip; dropping there does nothing and shows no toast.
- [ ] Ammo dragged onto a matching magazine shows `LOAD`; a partial fit shows `4/6`.
- [ ] Shift-click and Ctrl-click quick-move; Alt-click runs the default action; hover + Del drops; hover + Space splits; hover + 1–9 binds; dropping on a hotbar strip cell binds; Ctrl+F focuses search and non-matching cells dim.
- [ ] Tooltips have no description (except books), no rarity, no `Double-click` hint, and show a compare delta for replaceable gear.
- [ ] Context menu rows are 1–2 words with key caps on the right, and the menu stays inside the viewport.
- [ ] Craft rows show requirement chips with `have/need`; missing ones are red; there is no empty-state text.

### Map

- [ ] No instruction sentence; icon tools on the right; no permanent legend; no `(game)`, `(real)` or `away`.
- [ ] Markers can be added (double-click or right-click), renamed and removed (right-click or the list); the list is sorted by distance and centres the map on click.
- [ ] Zooming in never shows a hard rectangular tile edge.

### Menus

- [ ] Title: wordmark and four items at most, `v0.1` only; no kicker, no credits, no Controls item. Arrow keys and Enter work.
- [ ] Worlds: row actions on hover, `Play` in the footer, empty list shows only `New world`.
- [ ] New world: no hint lines; seed placeholder `Random`; Hardcore is a toggle disabled in Creative.
- [ ] Options: six rail tabs; the panel does not resize between tabs; changed rows show the dot and a reset icon; `Reset tab` resets only that tab; Music has a slider; the GUI-scale slider applies on release.
- [ ] Keys: search matches labels and key names; the listening state shows the caret and `[Esc] Cancel [Backspace] Clear` in the footer; conflicts show the red dot and `Also: …`.
- [ ] Pause: `PAUSED`, world and day, five items at most, no `Controls`, no `F1`.
- [ ] Death: cause title, survived, kills, `Respawn` and `Quit` (hardcore: `WORLD OVER` and `Quit`); nothing else.
- [ ] Loader: wordmark, 1–3 word step, percentage, bar; no kicker, tagline or tips; the error state turns red and wraps.
- [ ] Status: conditions with remedies (remedy bright when carried), Body, This life and All lives tables; no sentences.
- [ ] Chat: no welcome line, no placeholder; closed lines on plates fade after 8 s; suggestions show command and a short description.

---

## 21. Outside UI scope: first-person arms (task #22)

Seen in s5 02, 05, 06, 07 and 08 and in every HUD render here (the renders reuse those frames). For the weapons view-model owner in `src/weapons`:

- The support hand does not grip the handguard. It floats under the rifle's front, palm up, fingers splayed flat like a paddle, with the wrist bent upward.
- The trigger hand sits on top of the receiver as a mitten instead of wrapping the pistol grip with the index finger on the trigger.
- The left forearm enters from the bottom centre of the screen at an unnatural angle instead of from the lower left toward the handguard.
- Both arms are untextured, flat saturated-orange cylinders with no shading, sleeve or wrist detail.

---

## 22. Screen CSS

Inventory, title and pause, worlds, options, death, map chrome, chat and loader. Rendered with 2.8 and 5.13 for the reference images.

```css
/* ---- shared screen parts ------------------------------------------------------------------------ */
.screen.bare { background: transparent; }
.menu-toasts { position: absolute; left: 50%; bottom: calc(48 * var(--u)); transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: var(--s-1); pointer-events: none; }
.confirm-wrap { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: var(--scrim); pointer-events: auto; }
.confirm { position: relative; width: calc(400 * var(--u)); padding: var(--s-5); }
.confirm .body { margin-top: var(--s-2); color: var(--ink-2); }
.confirm .btns { display: flex; justify-content: flex-end; gap: var(--s-2); margin-top: var(--s-5); }
.tw-root ::-webkit-scrollbar { width: 6px; height: 6px; } .tw-root ::-webkit-scrollbar-thumb { background: var(--fill-4); border-radius: 3px; } .tw-root ::-webkit-scrollbar-track { background: transparent; }
.tw-root * { scrollbar-width: thin; scrollbar-color: var(--fill-4) transparent; }

/* ---- inventory ------------------------------------------------------------------------------------ */
.inv-wrap { display: flex; flex-direction: column; align-items: center; gap: var(--s-4); }
.inv-panel { width: min(calc(1104 * var(--u)), calc(100vw - 32px)); height: min(calc(800 * var(--u)), calc(100vh - 112 * var(--u))); }
.inv-top { display: flex; align-items: center; gap: var(--s-3); height: calc(48 * var(--u)); padding: 0 var(--s-2) 0 var(--s-4); border-bottom: 1px solid var(--line-1); flex: none; }
.inv-top .when { flex: 1; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.inv-top .search { width: calc(200 * var(--u)); }
.wmeter { position: relative; width: calc(120 * var(--u)); height: 4px; border-radius: 2px; background: var(--fill-3); }
.wmeter > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--ink-1); }
.wmeter.warn > i { background: var(--warn); } .wmeter.alarm > i { background: var(--alarm); }
.wmeter > b { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--ink-3); } /* ticks at 40% (18 kg) and 66.7% (30 kg) of 45 kg */
.wval { font-variant-numeric: tabular-nums; } .wval.warn { color: var(--warn); } .wval.alarm { color: var(--alarm); }
.inv-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, calc(388 * var(--u))) calc(328 * var(--u)) minmax(0, calc(388 * var(--u))); }
.inv-col { min-height: 0; padding: var(--s-4); overflow: auto; }
.inv-col + .inv-col { box-shadow: inset 1px 0 0 var(--line-1); }
.inv-col.mid { overflow: hidden; }
.inv-col > .seg { margin-bottom: var(--s-3); }
.sect { margin-bottom: var(--s-4); border-radius: var(--r-sm); transition: opacity var(--d-2); }
.sect-h { display: flex; align-items: center; gap: var(--s-2); height: calc(32 * var(--u)); cursor: pointer; }
.sect-h > img { width: calc(20 * var(--u)); height: calc(20 * var(--u)); object-fit: contain; }
.sect-h .chev { color: var(--ink-3); display: flex; transition: transform var(--d-2); } .sect.open .sect-h .chev { transform: rotate(90deg); }
.sect-h .nm { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sect-h .cap { color: var(--ink-2); font-variant-numeric: tabular-nums; } .sect-h .cap.full { color: var(--alarm); }
.sect > .meter { margin-bottom: var(--s-2); }
.sect.can { outline: 1px solid var(--accent-line); outline-offset: calc(4 * var(--u)); }
.sect.over { outline: 1.5px solid var(--accent); outline-offset: calc(4 * var(--u)); background: var(--accent-soft); }
.sect.deny { outline: 1.5px solid var(--alarm); outline-offset: calc(4 * var(--u)); cursor: not-allowed; }
.slots { display: grid; grid-template-columns: repeat(5, var(--cell)); gap: var(--gap); }
.slots .w3 { grid-column: span 3; } .slots .w2 { grid-column: span 2; }
.slots + .slots { margin-top: var(--s-3); }
.inv-conds { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-top: var(--s-4); }
.inv-conds + .stats { margin-top: var(--s-3); }
.slots + .stats { margin-top: var(--s-4); }
.inv-hotbar { display: flex; gap: var(--gap); }
.inv-hotbar .hot { background: var(--m-panel); box-shadow: inset 0 0 0 1px var(--line-2); border-radius: var(--r-md); color: var(--ink-1); }
.inv-hotbar .hot.on { box-shadow: inset 0 0 0 1.5px var(--accent); }
.inv-hotbar .hot.can { box-shadow: inset 0 0 0 1px var(--accent-line); } .inv-hotbar .hot.over { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); }
.drag-ghost { position: fixed; z-index: 60; width: var(--cell); height: var(--cell); margin: calc(-28 * var(--u)) 0 0 calc(-28 * var(--u)); border-radius: var(--r-sm); background: var(--m-pop); box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.7), inset 0 0 0 1px var(--line-2); transform: rotate(-3deg); pointer-events: none; }
.drag-ghost > img { position: absolute; inset: calc(6 * var(--u)); width: calc(44 * var(--u)); height: calc(44 * var(--u)); object-fit: contain; }
.recipe { display: grid; grid-template-columns: calc(40 * var(--u)) 1fr auto; align-items: center; gap: var(--s-3); min-height: calc(64 * var(--u)); padding: var(--s-2) 0; border-bottom: 1px solid var(--line-1); }
.recipe > img { width: calc(40 * var(--u)); height: calc(40 * var(--u)); object-fit: contain; }
.recipe .nm { font-weight: 600; } .recipe .nm .x { color: var(--ink-3); font-weight: 500; margin-left: var(--s-1); }
.recipe .reqs { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-top: var(--s-1); }
.recipe.no { opacity: 0.55; }

/* ---- title, pause ---------------------------------------------------------------------------------- */
.title-screen { align-items: flex-end; justify-content: flex-start; background: linear-gradient(90deg, rgba(6, 7, 8, 0.78) 0%, rgba(6, 7, 8, 0.35) 40%, transparent 65%); }
.title-screen.pause { background: linear-gradient(90deg, rgba(6, 7, 8, 0.85) 0%, rgba(6, 7, 8, 0.45) 45%, rgba(6, 7, 8, 0.15) 80%); }
.menu-col { display: flex; flex-direction: column; margin: 0 0 calc(96 * var(--u)) calc(96 * var(--u)); }
.menu-col .wordmark { margin-bottom: calc(48 * var(--u)); }
.menu-col .kick { color: var(--ink-3); } .menu-col .where { color: var(--ink-2); margin: 2px 0 calc(32 * var(--u)); }
.menu-item { position: relative; display: flex; align-items: center; gap: var(--s-4); height: calc(40 * var(--u)); color: var(--ink-2); font: 500 calc(17 * var(--u)) / calc(24 * var(--u)) var(--font); letter-spacing: -0.013em; text-align: left; }
.menu-item::before { content: ''; position: absolute; left: calc(-14 * var(--u)); top: calc(10 * var(--u)); width: 2px; height: calc(20 * var(--u)); background: var(--accent); opacity: 0; transition: opacity var(--d-1); }
.menu-item:hover, .menu-item:focus-visible { color: var(--ink-1); outline: none; } .menu-item:hover::before, .menu-item:focus-visible::before { opacity: 1; }
.menu-item:active { color: var(--accent); }
.menu-item .meta { color: var(--ink-3); font: 500 calc(13 * var(--u)) / 1 var(--font); }
.version { position: absolute; right: var(--edge); bottom: var(--edge); color: var(--ink-3); font: 500 calc(11 * var(--u)) / 1 var(--mono); }

/* ---- worlds ---------------------------------------------------------------------------------------- */
.world-row { display: grid; grid-template-columns: calc(96 * var(--u)) 1fr auto; align-items: center; gap: var(--s-3); height: calc(72 * var(--u)); padding: var(--s-2); border-bottom: 1px solid var(--line-1); border-radius: var(--r-sm); cursor: pointer; }
.world-row:hover { background: var(--fill-2); }
.world-row.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-line); }
.world-row.dead { opacity: 0.6; } .world-row.dead .thumb { filter: grayscale(1); }
.world-row .thumb { width: calc(96 * var(--u)); height: calc(54 * var(--u)); border-radius: var(--r-sm); object-fit: cover; background: var(--bg-2); }
.world-row .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.world-row .meta { display: flex; align-items: baseline; gap: var(--s-3); color: var(--ink-3); margin-top: 2px; font-variant-numeric: tabular-nums; }
.world-row .meta .bad { color: var(--alarm); }
.world-row .acts { display: flex; gap: 2px; visibility: hidden; } .world-row:hover .acts, .world-row.sel .acts { visibility: visible; }
.world-row .acts .del:hover { color: var(--alarm); }

/* ---- options ----------------------------------------------------------------------------------------- */
.opt-panel { width: min(calc(800 * var(--u)), calc(100vw - 32px)); height: min(calc(640 * var(--u)), calc(100vh - 48 * var(--u))); }
.opt-body { flex: 1; min-height: 0; display: grid; grid-template-columns: calc(176 * var(--u)) 1fr; }
.rail { display: flex; flex-direction: column; gap: 2px; padding: var(--s-3) var(--s-2); box-shadow: inset -1px 0 0 var(--line-1); }
.rail > button { height: calc(32 * var(--u)); padding: 0 var(--s-3); border-radius: var(--r-sm); text-align: left; color: var(--ink-2); }
.rail > button:hover { color: var(--ink-1); } .rail > button.on { background: var(--fill-3); color: var(--ink-1); }
.opt-content { min-height: 0; overflow: auto; padding: var(--s-2) var(--s-5); }
.opt-content > .sec-head:not(:first-child) { margin-top: var(--s-3); }
.bind { position: relative; width: calc(96 * var(--u)); height: calc(28 * var(--u)); border-radius: var(--r-sm); background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line-2); color: var(--ink-1); font: 600 calc(12 * var(--u)) / 1 var(--mono); }
.bind.sq { width: calc(28 * var(--u)); }
.bind:hover { box-shadow: inset 0 0 0 1px var(--line-3); }
.bind.listen { box-shadow: inset 0 0 0 1.5px var(--accent); }
.bind.listen::after { content: ''; position: absolute; left: 50%; top: 50%; width: 2px; height: calc(14 * var(--u)); margin: calc(-7 * var(--u)) 0 0 -1px; background: var(--accent); animation: blink 1s steps(1) infinite; }
.bind.conflict { box-shadow: inset 0 0 0 1.5px var(--alarm); }
.bind.conflict::before { content: ''; position: absolute; right: calc(4 * var(--u)); top: calc(4 * var(--u)); width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 50%; background: var(--alarm); }

/* ---- death ------------------------------------------------------------------------------------------ */
.death { flex-direction: column; background: rgba(6, 7, 8, 0.6); backdrop-filter: grayscale(1) brightness(0.55); -webkit-backdrop-filter: grayscale(1) brightness(0.55); animation: fade-in 600ms var(--ease-out); }
.death > * { animation: fade-in 400ms var(--ease-out) 400ms backwards; }
.death .cause { margin-bottom: calc(24 * var(--u)); }
.death .stats-row { display: flex; gap: calc(48 * var(--u)); margin-bottom: calc(32 * var(--u)); text-align: center; }
.death .stats-row .t-label { margin-top: calc(6 * var(--u)); color: var(--ink-3); }
.death .over { margin-bottom: var(--s-4); color: var(--alarm); }
.death .btns { display: flex; gap: var(--s-2); } .death .btns .btn { min-width: calc(140 * var(--u)); }

/* ---- map --------------------------------------------------------------------------------------------- */
.map-screen { position: absolute; inset: 0; z-index: 10; background: #152E4D; pointer-events: auto; }
.map-screen canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; } .map-screen.drag canvas { cursor: grabbing; }
.map-title { position: absolute; left: var(--edge); top: var(--edge); padding: var(--s-2) var(--s-3); } .map-title .t-label { color: var(--hud-2); margin-top: 2px; }
.map-close { position: absolute; right: var(--edge); top: var(--edge); display: flex; align-items: center; gap: var(--s-2); }
.map-close .plate { display: flex; }
.map-tools { position: absolute; right: var(--edge); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; padding: 2px; }
.map-tools .btn.icon { color: var(--hud-1); } .map-tools hr { width: 100%; margin: 2px 0; border: 0; border-top: 1px solid var(--line-1); }
.map-tools .badge { position: absolute; right: 2px; top: 2px; color: var(--hud-2); font: 600 calc(10 * var(--u)) / 1 var(--mono); }
.map-scale { position: absolute; left: var(--edge); bottom: var(--edge); color: #fff; text-shadow: var(--halo); }
.map-scale .bar { height: calc(5 * var(--u)); margin-top: var(--s-1); border: 1px solid #fff; border-top: 0; filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)); }
.map-readout { position: absolute; right: var(--edge); bottom: var(--edge); display: flex; align-items: center; height: calc(28 * var(--u)); padding: 0 calc(10 * var(--u)); }
.teleport-chip { position: fixed; z-index: 40; height: calc(20 * var(--u)); padding: 0 var(--s-2); border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); display: inline-flex; align-items: center; pointer-events: none; }

/* ---- chat -------------------------------------------------------------------------------------------- */
.chat { position: absolute; left: var(--edge); bottom: calc(160 * var(--u)); z-index: 2; width: calc(440 * var(--u)); display: flex; flex-direction: column; gap: var(--s-2); pointer-events: none; }
.chat-log { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-1); }
.chat:not(.open) .chat-line:nth-last-child(n+7) { display: none; } /* closed: last 6 lines */
.chat-line { max-width: 100%; padding: 1px var(--s-2); border-radius: var(--r-sm); background: var(--m-hud); color: var(--hud-1); transition: opacity var(--d-4); overflow-wrap: anywhere; }
.chat-line.sys { color: var(--hud-2); } .chat-line.cmd { color: var(--hud-2); font: 500 calc(12 * var(--u)) / calc(18 * var(--u)) var(--mono); }
.chat-line.err { background: linear-gradient(var(--tint-alarm), var(--tint-alarm)), var(--m-hud); }
.chat-line.faded { opacity: 0; }
.chat.open { pointer-events: auto; }
.chat.open .chat-log { max-height: calc(280 * var(--u)); overflow: auto; padding: var(--s-2); border-radius: var(--r-md); background: var(--m-panel); }
.chat.open .chat-line { background: none; padding: 0; } .chat.open .chat-line.faded { opacity: 1; }
.chat-input { position: relative; display: none; } .chat.open .chat-input { display: block; }
.chat-input .input { width: 100%; } .chat-input.cmd .input, .chat-input.cmd .ghost { font: 500 calc(12 * var(--u)) / calc(16 * var(--u)) var(--mono); }
.chat-input .ghost { position: absolute; left: 0; top: 0; height: 100%; padding: 0 var(--s-3); display: flex; align-items: center; color: var(--ink-4); white-space: pre; pointer-events: none; }
.suggest { position: relative; max-height: calc(8 * 24 * var(--u) + 8 * var(--u)); overflow: auto; }
.suggest > button { height: calc(24 * var(--u)); } .suggest > button > span:first-child { font: 500 calc(12 * var(--u)) / 1 var(--mono); }
.suggest > button.on { background: var(--accent-soft); box-shadow: inset 2px 0 0 var(--accent); }

/* ---- loader (outside .tw-root) ----------------------------------------------------------------------- */
#loader { position: fixed; inset: 0; z-index: 200; overflow: hidden; background: var(--bg-0); color: var(--ink-1); font: 500 calc(13 * var(--u)) / calc(18 * var(--u)) var(--font); transition: opacity 600ms var(--ease-out), visibility 600ms; }
#loader.tw-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
.loader-art-fallback { position: absolute; inset: 0; background: var(--bg-0); }
.loader-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 600ms var(--ease-out); }
.loader-art.is-in { opacity: 1; }
.loader-scrim { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(6, 7, 8, 0.85) 0%, rgba(6, 7, 8, 0.35) 45%, transparent 70%); }
.loader-inner { position: absolute; left: calc(96 * var(--u)); bottom: calc(96 * var(--u)); width: min(calc(480 * var(--u)), calc(100vw - 48px)); }
.loader-title { margin: 0 -0.3em calc(32 * var(--u)) 0; font: 600 calc(56 * var(--u)) / 1 var(--font); letter-spacing: 0.3em; }
.loader-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-2); }
.loader-status { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ink-2); }
.loader-pct { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.loader-time { display: none; }
.loader-bar { height: 2px; border-radius: 1px; background: var(--fill-3); overflow: hidden; }
.loader-fill { height: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0.02); transition: transform 300ms var(--ease-out); }
#loader.tw-error .loader-status { white-space: normal; color: var(--alarm); }
#loader.tw-error .loader-fill { background: var(--alarm); }
```
