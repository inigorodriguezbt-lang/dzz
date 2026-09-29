# Deadtide UI: systems proposal

Angle: precision product design applied to a survival game. One grid, three text sizes plus one numeral size, one accent, two materials, one icon family. Every value on screen is a number with a unit. Every control hint is a keycap next to the action it triggers.

Reference renders, built from the tokens and icons below over HUD-free crops of the current screenshots, with line glyphs standing in for 3D item renders:

- `proposal-systems-hud-idle.jpg`
- `proposal-systems-hud-damaged.jpg`
- `proposal-systems-hud-vehicle.jpg`
- `proposal-systems-hud-spawn.jpg`
- `proposal-systems-inventory.jpg`
- `proposal-systems-icons.png`

---

## 0. What the screenshots show today

| Where | Problem |
|---|---|
| Vitals (01, 05) | Six identical glass squares with a faint outline glyph and no numbers. The fill level is invisible in daylight. A full-width aqua stamina bar sits under them permanently. |
| Compass (01, 05) | 15° numbers, cardinals and a second line (`318° · 17:37 · Day 1 · Waikiki`) in 10 px grey mono. That second line is illegible over sky. |
| Minimap (05, 08) | Circle with a bare-text location label under it. The label disappears over bright sky. The yellow freeway competes with markers. |
| Weapon card (05) | 3D weapon thumbnail too small to read. Name, calibre, durability, `31 / 30` (ambiguous: 30 is reserve) and `SEMI` each use a different size and colour. |
| FPS chip | On by default in every frame (`showFps: true`). |
| Inventory (03) | Header sentence of controls. Orange section kickers, aqua bars, dashed slot borders, rarity-coloured borders and `Empty` boxes. The middle column overflows, so the weapon slots are cut off. Four accent hues on one screen. |
| Map (04) | Title card with a five-clause instruction sentence. Tool buttons overlap map labels. A permanent legend. `2.0 km (game)`. Empty coordinate box. |
| Everywhere | Four accent colours (aqua, sun, coral, green) plus blue-tinted greys. Backdrop blur on every HUD element. Sentences where numbers or keycaps belong. |

---

## 1. Principles

1. **Numbers, not words.** State is a value with a unit: `72`, `36.9°`, `31`, `1.2 km`, `3.5/40`. Words are for names and verbs only.
2. **One accent, one alarm.** The UI is white on graphite. Rescue orange marks what you act on (selection, focus, markers, progress). Red marks danger. Nothing else is saturated.
3. **Show on change.** HUD elements appear when their value matters or moves, then recede. Idle play shows compass, minimap and the held item only (Horizon Forbidden West "Dynamic HUD", TLOU2).
4. **Everything sits on the grid.** 4 px base, 8 px rhythm, one 56 px cell for every item, fixed column widths. Alignment is the ornament.
5. **Material earns legibility.** Text over the world always sits on a thick plate (78% graphite); a halo alone fails on bright foliage (tested). Glass blur is reserved for full screens.

---

## 2. Tokens

All sizes are in **u** (1 u = 1 px at 1920×1080, GUI scale 100%).

### 2.1 Unit and GUI scale

```css
:root {
	--gui: 1; /* set by main.js from settings.guiScale; keep */
	/* 1u = 1px at 1080p; scales with window height, clamped for tiny and huge windows */
	--u: calc(var(--gui) * clamp(0.8px, 100vh / 1080, 1.5px));
}
```

- Every length in `ui.css` is `calc(N * var(--u))`. The only exception is hairlines, which stay `1px`.
- Canvas UI (minimap, map labels, markers) multiplies by `parseFloat(getComputedStyle(root).getPropertyValue('--u'))`, read once per resize and per `guiScale` change.
- Keep `--tw-u` as an alias (`--tw-u: var(--u)`) during migration so nothing breaks mid-way.

### 2.2 Colour

Neutral graphite with no blue tint. Solid inks are for panels; alpha inks are for the HUD, because they adapt to any plate.

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0B0C0E` | Loader and title backdrop fallback |
| `--bg-1` | `#121316` | Solid panel base, stat-table cells |
| `--bg-2` | `#1A1C20` | Inputs, keybind buttons |
| `--bg-3` | `#23262B` | Raised thumb (selected segment), hover on bg-2 |
| `--m-hud` | `rgba(12,13,15,0.78)` | **HUD plate**, no blur |
| `--m-panel` | `rgba(16,17,20,0.88)` + `blur(24px) saturate(1.2)` | Full screens: inventory, options, worlds, status |
| `--m-pop` | `rgba(28,30,34,0.98)` | Tooltip, context menu, popover, confirm, drag ghost |
| `--scrim` | `rgba(6,7,8,0.60)` | Behind modal panels |
| `--fill-1…4` | `rgba(255,255,255, .04 / .07 / .11 / .16)` | Cell rest / hover / pressed / selected |
| `--line-1…3` | `rgba(255,255,255, .07 / .12 / .22)` | Dividers / plate edge / strong edge, empty keycap |
| `--ink-1` | `#F2F3F5` | Primary text, icons |
| `--ink-2` | `#B6BAC1` | Secondary text, values in tables |
| `--ink-3` | `#80858D` | Labels, meta, placeholder (panels only, never on HUD) |
| `--ink-4` | `#4B4F56` | Disabled only |
| `--hud-1` | `rgba(255,255,255,0.96)` | HUD primary |
| `--hud-2` | `rgba(255,255,255,0.70)` | HUD secondary (lowest ink allowed on HUD) |
| `--accent` | `#FF7A2E` | Rescue orange: selection, focus ring, active hotbar slot, markers, waypoints, progress, primary button fill |
| `--accent-hover` / `--accent-press` | `#FF8C47` / `#E8661A` | Primary button states |
| `--accent-soft` | `rgba(255,122,46,0.16)` | Selected row / valid drop fill |
| `--accent-line` | `rgba(255,122,46,0.56)` | Valid drop outline, selected row edge |
| `--on-accent` | `#140A04` | Text on accent fill (7.5:1) and on alarm fill (6.5:1; white on alarm is only 3.0) |
| `--warn` | `#FFC53D` | Low (vitals, capacity > 90%, worn condition) |
| `--alarm` | `#FF5C5C` | Critical, damage, bleeding, destructive, errors, death marker |
| `--cold` | `#8CCBFF` | Body temperature below 36.0° only |
| `--halo` | `0 0 2px rgba(0,0,0,.9), 0 1px 3px rgba(0,0,0,.6)` | Map canvas labels and the map scale bar only (a controlled background); never on the 3D world |

Why orange: it is the colour of life vests and flares, and the one saturated hue missing from the island palette at noon (sky blue, sea cyan, foliage green, sand beige). The old freeway yellow on the map is removed so orange markers are unambiguous.

Removed: aqua, sun, coral, green, blue-tinted greys, and all four rarity colours. Rarity is not shown; condition, freshness and fill carry the meaning.

### 2.3 Legibility contract (measured, WCAG 2.x)

HUD plate `--m-hud` composited over the worst backgrounds in the game:

| Behind the plate | hud-1 | hud-2 | accent | warn | alarm | cold |
|---|---|---|---|---|---|---|
| White cloud / overexposed sky | 9.4 | 5.9 | 3.9 | 6.3 | 3.3 | 5.8 |
| Tropical sky `#9ECFF0` | 11.2 | 6.8 | 4.6 | 7.6 | 4.0 | 6.9 |
| Sand `#E8DAB2` | 10.6 | 6.5 | 4.4 | 7.2 | 3.8 | 6.5 |
| Foliage `#467828` | 14.8 | 8.5 | 6.2 | 10.2 | 5.3 | 9.2 |
| Night `#0A0C10` | 17.9 | 9.6 | 7.5 | 12.3 | 6.4 | 11.2 |

Bare white text on tropical sky with no plate: **1.7:1**. So no HUD text is bare. The location card, marker distances and closed chat lines all sit on plates. A halo-only location card was mocked over the Kona palms and the 11 u island label failed.

Rules that follow:
- HUD text uses `--hud-1` or `--hud-2` only.
- Status hues (accent, warn, alarm, cold) never colour HUD text below 17 u. They colour icons (≥ 16 u, 3:1 non-text), bars (≥ 2 px), dots and **plate tints** (warn 14%, alarm 22%, cold 14% over `--m-hud`). The number inside a tinted cell stays white.
- Filled chips (`JAM`, drop labels, `TELEPORT`) use `--on-accent` text on accent or alarm fill, never white.
- Panels: `--ink-3` measures 5.1:1 on `--m-panel` over a dark world and 3.7:1 over pure white. The `--scrim` under every panel keeps the backdrop dark, so labels hold. `--ink-4` is never used for information.

### 2.4 Type

Two families: **Inter** (variable, with `opsz`) for everything, and **JetBrains Mono** for keycaps, chat input, coordinates and debug. Two weights: 500 and 600.

Google Fonts link (index.html):
`https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,500..600&family=JetBrains+Mono:wght@500;600&display=swap`, with `font-optical-sizing: auto` on `.tw-root`.

Tracking follows Inter's dynamic-metrics curve (`-0.0223 + 0.185·e^(-0.1745·size)` em).

| Token | Size / line | Weight | Tracking | Features | Use |
|---|---|---|---|---|---|
| `t-label` | 11 / 14 | 600 | +0.06em, UPPERCASE | `case` | Section headers, stat labels, fire mode, gear, units after numerals |
| `t-body` | 13 / 18 | 500 (600 for emphasis) | −0.003em | `tnum` where numeric | Everything else: rows, buttons, prompts, toasts, values |
| `t-title` | 17 / 24 | 600 | −0.013em | | Panel titles, menu items (500), death cause |
| `t-num` | 28 / 28 | 600 | −0.021em | `tnum`, opsz 28 | Ammo, speed, death stats: one hero number per surface |
| `t-mono` | 11 / 14 (keycap), 12 / 16 (chat, coords, debug) | 500 / 600 | 0 | | Keycaps, command line, coordinates |
| Wordmark | 56 / 56 | 600 | +0.30em, caps | | `DEADTIDE` on title and loader only |

- Numbers always use `font-variant-numeric: tabular-nums`, so HUD counters never jitter.
- Truncation is a single line with `text-overflow: ellipsis`. Only item and world names may truncate.
- Sentence case everywhere except `t-label`.

### 2.5 Space, grid, sizes

| Token | u | | Token | u |
|---|---|---|---|---|
| `--s-1` | 4 | | `--edge` (HUD safe inset) | 24 |
| `--s-2` | 8 | | Keycap | 20 h, min 20 w, 5 side padding |
| `--s-3` | 12 | | Chip, small button, small icon button | 24 h |
| `--s-4` | 16 | | Segmented control | 28 h (segments 24) |
| `--s-5` | 24 | | Button, input, icon button, list row | 32 h |
| `--s-6` | 32 | | Option row, menu row | 40 h |
| `--s-7` | 48 | | Hotbar cell | 48 × 48, gap 4 |
| | | | **Item cell** | **56 × 56, gap 4 (60 pitch)** |
| | | | Toggle | 36 × 20 |

Grouping: 4–8 between things that belong together, 16 between items in a group, 24–32 between sections, 48 between major regions (Nothing OS spacing ladder).

### 2.6 Radii, strokes, elevation

| Token | u | Use |
|---|---|---|
| `--r-xs` | 3 | Keycaps |
| `--r-sm` | 4 | Item cells, chips, inner map, stat tables |
| `--r-md` | 8 | HUD plates, buttons, inputs, popovers, menus |
| `--r-lg` | 12 | Full panels |
| pill | 999 | Toggle only |

Strokes:
- Hairline: `1px` (unscaled), `--line-1` between rows and columns, `--line-2` as the plate edge (`box-shadow: inset 0 0 0 1px`).
- Selected cell or slot: `inset 0 0 0 1.5px var(--accent)`.
- Focus ring: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` only.
- Icons: 1.5 on a 24 grid, so exactly 1 px at 16 u.

Elevation (no glows, no gradients on chrome):

| Level | Surface | Shadow | Blur |
|---|---|---|---|
| HUD | `--m-hud` | `0 1px 2px rgba(0,0,0,.35)` | **none** (per-element backdrop blur re-samples the WebGL canvas every frame) |
| Panel | `--m-panel` | `0 24px 64px -16px rgba(0,0,0,.7)` | `24px saturate(1.2)` on the panel only |
| Pop | `--m-pop` | `0 12px 32px -8px rgba(0,0,0,.6)` + `inset 0 0 0 1px var(--line-2)` | none |
| Drag ghost | `--m-pop` | `0 12px 24px -6px rgba(0,0,0,.7)` | none |

### 2.7 Motion

| Token | ms | Use |
|---|---|---|
| `--d-1` | 80 | Hover, press, keycap fill |
| `--d-2` | 160 | Toast / prompt / chip / popover in, segmented thumb slide, toggle |
| `--d-3` | 240 | Panel in (opacity 0→1, translateY 8→0), screen scrim |
| `--d-4` | 400 | HUD element auto-hide fade, location card out |

- Easing: `--ease-out: cubic-bezier(0.2, 0, 0, 1)` for entries, `--ease-in: cubic-bezier(0.4, 0, 1, 1)` for exits at ⅔ of the entry duration. No springs or bounces.
- Timers: HUD auto-hide 3 s after last change, toast 3.5 s (alarm 5 s), pickup 2.4 s, location card 3 s hold, tooltip delay 250 ms.
- Only critical vitals blink: the icon goes 1 → 0.4 opacity at 1 Hz, never the whole plate.
- `prefers-reduced-motion`: all durations become 0 except opacity fades at 80 ms; no blink.

### 2.8 Drop-in token block (replaces `ui.css` lines 7–54)

```css
:root {
	--gui: 1;
	--u: calc(var(--gui) * clamp(0.8px, 100vh / 1080, 1.5px));
	--tw-u: var(--u); /* migration alias */
	--bg-0: #0B0C0E; --bg-1: #121316; --bg-2: #1A1C20; --bg-3: #23262B;
	--m-hud: rgba(12, 13, 15, 0.78); --m-panel: rgba(16, 17, 20, 0.88); --m-pop: rgba(28, 30, 34, 0.98); --scrim: rgba(6, 7, 8, 0.6);
	--fill-1: rgba(255, 255, 255, 0.04); --fill-2: rgba(255, 255, 255, 0.07); --fill-3: rgba(255, 255, 255, 0.11); --fill-4: rgba(255, 255, 255, 0.16);
	--line-1: rgba(255, 255, 255, 0.07); --line-2: rgba(255, 255, 255, 0.12); --line-3: rgba(255, 255, 255, 0.22);
	--ink-1: #F2F3F5; --ink-2: #B6BAC1; --ink-3: #80858D; --ink-4: #4B4F56;
	--hud-1: rgba(255, 255, 255, 0.96); --hud-2: rgba(255, 255, 255, 0.70);
	--accent: #FF7A2E; --accent-hover: #FF8C47; --accent-press: #E8661A;
	--accent-soft: rgba(255, 122, 46, 0.16); --accent-line: rgba(255, 122, 46, 0.56); --on-accent: #140A04;
	--warn: #FFC53D; --alarm: #FF5C5C; --cold: #8CCBFF;
	--tint-warn: rgba(255, 197, 61, 0.14); --tint-alarm: rgba(255, 92, 92, 0.22); --tint-cold: rgba(140, 203, 255, 0.14);
	--halo: 0 0 2px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.6);
	--font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
	--mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
	--s-1: calc(4 * var(--u)); --s-2: calc(8 * var(--u)); --s-3: calc(12 * var(--u)); --s-4: calc(16 * var(--u));
	--s-5: calc(24 * var(--u)); --s-6: calc(32 * var(--u)); --s-7: calc(48 * var(--u)); --edge: calc(24 * var(--u));
	--r-xs: calc(3 * var(--u)); --r-sm: calc(4 * var(--u)); --r-md: calc(8 * var(--u)); --r-lg: calc(12 * var(--u));
	--cell: calc(56 * var(--u)); --hot: calc(48 * var(--u));
	--d-1: 80ms; --d-2: 160ms; --d-3: 240ms; --d-4: 400ms;
	--ease-out: cubic-bezier(0.2, 0, 0, 1); --ease-in: cubic-bezier(0.4, 0, 1, 1);
}
.t-label { font: 600 calc(11 * var(--u)) / calc(14 * var(--u)) var(--font); letter-spacing: 0.06em; text-transform: uppercase; font-feature-settings: 'case'; }
.t-body { font: 500 calc(13 * var(--u)) / calc(18 * var(--u)) var(--font); letter-spacing: -0.003em; }
.t-title { font: 600 calc(17 * var(--u)) / calc(24 * var(--u)) var(--font); letter-spacing: -0.013em; }
.t-num { font: 600 calc(28 * var(--u)) / 1 var(--font); letter-spacing: -0.021em; font-variant-numeric: tabular-nums; }
.tnum { font-variant-numeric: tabular-nums; }
.plate { background: var(--m-hud); border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--line-2), 0 1px 2px rgba(0, 0, 0, 0.35); }
```

---

## 3. Iconography

**Style.** Outline only, on a 24 × 24 grid with a 2 px keyline (live area 20 × 20). Stroke 1.5 with round caps and joins, `fill: none`, `stroke: currentColor`. Filled shapes are allowed only for the player chevron, the map marker diamond and the active half of the mouse glyphs. There are no duotone or multicolour icons and no emoji; colour comes from state only.

**Sizes.** Icons render at 16 u (inline, HUD, chips, actions: stroke = 1 px) or 24 u (empty-slot glyphs, map tools). They are never scaled in between.

**Colour.** `--hud-1` / `--ink-1` by default. Empty-slot glyphs use `--ink-3`. State colour applies to the icon only, with the plate tinted as in 2.3.

**Implementation.** Replace `ICON` in `src/ui/dom.js` with the set below. `icon(name, cls)` keeps its signature and the SVG gets `class="i"`. Item-category fallback glyphs in `itemIcons.js` use the same stroke rules, with the stroke colour changed from `#cfe6ee` to `#B6BAC1`.

All paths below were rendered and checked at 16/24/48 u (sheet: `docs/ui/proposal-systems-icons.png`).

### 3.1 Status (vitals, 16 u)

| Name | SVG inner markup |
|---|---|
| health | `<path d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.2 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>` |
| blood | `<path d="M12 3.5c3 3.6 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.9 6-10.5Z"/>` |
| food | `<path d="M6 3v5.5a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-1.8.9-3 3.4-3 6.5V13h3"/>` |
| water | `<path d="M9.5 3h5M10.25 3v2.5L8 8.25V19.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5V8.25L13.75 5.5V3M8 12.5h8"/>` |
| temp | `<path d="M14 14.3V5a2 2 0 0 0-4 0v9.3a4 4 0 1 0 4 0ZM12 17V9.5"/>` |
| energy | `<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>` |
| stamina | `<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z"/>` |
| breath | `<circle cx="8.5" cy="15.5" r="3.25"/><circle cx="15.5" cy="8.5" r="3.75"/><circle cx="17" cy="18" r="1.75"/>` |

### 3.2 Conditions (chips, 16 u), keyed by `Survival.conditions()` id

| id → icon | SVG inner markup |
|---|---|
| `bleed` → bleeding | `<path d="M10 3c2.4 2.9 4.8 5.8 4.8 8.4a4.8 4.8 0 0 1-9.6 0C5.2 8.8 7.6 5.9 10 3ZM18 13c1.1 1.4 2.2 2.7 2.2 3.9a2.2 2.2 0 0 1-4.4 0c0-1.2 1.1-2.5 2.2-3.9Z"/>` |
| `frac` → fracture | `<path d="M7.2 15.3 10.5 12M13.5 12l3.3-3.3M10.5 12l1.2-2 .6 2.6 1.2-.6"/><path d="M7.2 15.3a2 2 0 1 0-2.4 2.4 2 2 0 1 0 1.5 1.5 2 2 0 1 0 .9-3.9ZM16.8 8.7a2 2 0 1 0 2.4-2.4 2 2 0 1 0-1.5-1.5 2 2 0 1 0-.9 3.9Z"/>` |
| `inf` → infection | `<circle cx="12" cy="12" r="4"/><path d="M12 8V5.5M12 18.5V16M15.46 10l2.17-1.25M6.37 15.25 8.54 14M15.46 14l2.17 1.25M6.37 8.75 8.54 10"/>` + six `<circle r="1.5">` at (12,4) (12,20) (18.93,8) (5.07,16) (18.93,16) (5.07,8) |
| `sick` → sick | `<circle cx="12" cy="12" r="8.5"/><path d="M7.5 15.5q1.125-1.25 2.25 0t2.25 0 2.25 0 2.25 0M9 9.75h.01M15 9.75h.01"/>` |
| `cold` → cold | `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>` |
| `hot` → hot | `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>` |
| `wet` → wet | `<path d="M7 15a4 4 0 0 1 .6-7.95 5 5 0 0 1 9.5 1.5A3.25 3.25 0 0 1 17 15H7ZM8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>` |
| `blood` → blood (3.1) | |
| `drunk` → drunk | `<path d="M8 3h8l-.4 4.6a3.6 3.6 0 0 1-7.2 0L8 3ZM12 11.2V20M8.5 20.5h7M8.3 6.5h7.4"/>` |
| `caf` → caffeine | `<path d="M5 9h11v4.5A5.5 5.5 0 0 1 10.5 19A5.5 5.5 0 0 1 5 13.5V9ZM16 10.5h1.25a2.25 2.25 0 0 1 0 4.5H16M8.5 3.5v2.5M12.5 3.5v2.5"/>` |
| `pk` → painkiller | `<path d="M10.6 19.4 19.4 10.6a4.24 4.24 0 0 0-6-6L4.6 13.4a4.24 4.24 0 0 0 6 6ZM8.5 8.5l7 7"/>` |
| `tired` → energy (3.1) | |
| `heavy` → overload | `<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="14.5" r="6"/>` |

### 3.3 Slots (empty-slot glyph, 24 u, `--ink-3`)

| Slot | SVG inner markup |
|---|---|
| head | `<path d="M4.5 16a6.5 6.5 0 0 1 13 0M4.5 16h17M11 9.5V8"/>` |
| eyes | `<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 13.5 2.5 9M20.5 13.5l1-4.5"/>` |
| face | `<path d="M4 9.5c2.5-1 5.2-1.5 8-1.5s5.5.5 8 1.5v2.5c0 4.4-3.6 8-8 8s-8-3.6-8-8V9.5ZM8.5 13h7M9.5 16h5"/>` |
| torso | `<path d="M8.5 3.5 4 5.75 2.5 10.5l3 1V20.5h13v-9l3-1L20 5.75 15.5 3.5a3.5 3.5 0 0 1-7 0Z"/>` |
| vest | `<path d="M7 3.5h2.5a2.5 2.5 0 0 0 5 0H17l2 3v14H5v-14l2-3ZM8.5 12h7v5h-7Z"/>` |
| back | `<path d="M7 9a5 5 0 0 1 10 0v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5V9ZM9.5 4V5.5M14.5 4v1.5M9.5 4h5M9.5 14h5v3.5h-5Z"/>` |
| hands (gloves, and the Hands cell) | `<path d="M8 21v-3.5l-3.2-4.3a1.4 1.4 0 0 1 2.2-1.7L8.5 13V5.25a1.25 1.25 0 0 1 2.5 0V11V4.25a1.25 1.25 0 0 1 2.5 0V11V5.25a1.25 1.25 0 0 1 2.5 0V11V7.25a1.25 1.25 0 0 1 2.5 0V15c0 2.5-1 4.5-2 6"/>` |
| legs | `<path d="M6 3.5h12l1 17h-5l-2-10-2 10H5l1-17ZM6 7h12"/>` |
| feet | `<path d="M7 3.5h5v8.5l6.25 2.2A2.5 2.5 0 0 1 20 16.6V19H4.5v-3.2L7 12V3.5ZM4.5 19v1.5H20V19"/>` |
| belt | `<path d="M2.5 10h6.5M15 10h6.5M2.5 14h6.5M15 14h6.5M9 8h6v8H9ZM12 12h3"/>` |
| primary / secondary | `<path d="M2.5 10.5h12l1.5-1.5h5.5v3h-4.5l-1 1.5H11l-1.25 4.5h-2.5l1-4.5H2.5v-3Z"/>` |
| sidearm | `<path d="M4 7h15.5v4.5H11l-1.25 5.5H6.25l1.2-5.5H4V7ZM11 11.5v1.75h2.25"/>` |
| melee | `<path d="M4 20l3.25-3.25M5.75 14.75l3.5 3.5M8.25 15.75 18.5 5.5 20.5 3.5c.4 3.1-.9 6.3-3.6 9L12 17.25"/>` |

### 3.4 Actions and chrome (16 u unless noted)

| Name | SVG inner markup | Where |
|---|---|---|
| close | `<path d="M6 6l12 12M18 6 6 18"/>` | Panel close, map close |
| sort | `<path d="M4 6h10M4 12h7M4 18h4M17.5 5v14M14.5 16l3 3 3-3"/>` | Carried header |
| search | `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>` | Catalog, keys filter |
| plus / minus | `<path d="M12 5v14M5 12h14"/>` / `<path d="M5 12h14"/>` | Map zoom (24 u) |
| locate | `<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>` | Map: centre on me (24 u) |
| fit | `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>` | Map: all islands (24 u) |
| layers | `<path d="M12 3.5l9 4.5-9 4.5-9-4.5 9-4.5ZM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>` | Map layers (24 u) |
| marker | `<path d="M12 3.5 18 12l-6 8.5L6 12l6-8.5Z"/>` (filled accent, 1.5 black stroke on world) | Compass, minimap, map |
| edit | `<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>` | World details, marker rename |
| duplicate | `<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>` | World row |
| export | `<path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>` | World row |
| import | `<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>` | Worlds header |
| trash | `<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"/>` | World row, creative delete |
| play | `<path d="M8 5v14l11-7L8 5Z"/>` | Play button |
| chevron | `<path d="M9 6l6 6-6 6"/>` (rotate for down/up) | Select, trend arrow at 8 u |
| check | `<path d="M5 12.5 9.5 17 19 7.5"/>` | Recipe tool present, toggles in menus |
| reset | `<path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.5M4 3.5v5h5"/>` | Keybind row reset |
| fuel | `<path d="M4.5 20.5v-15A1.5 1.5 0 0 1 6 4h6a1.5 1.5 0 0 1 1.5 1.5v15M3 20.5h12M4.5 10h9M13.5 8.5h2l2.5 2.5v6a1.25 1.25 0 0 0 2.5 0V9L18.5 7"/>` | Vehicle panel |
| wrench | `<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1Z"/>` | Vehicle condition, crafting tab |
| magazine | `<path d="M9 3.5h6.5l-1.5 17H8.5L9 3.5ZM9 8h6"/>` | Reserve ammo, pickup of ammo |
| car | `<path d="M3.5 16v-3.5L5.7 7h12.6l2.2 5.5V16H3.5Zm0 0v2.5h3V16m11 0v2.5h3V16M3.5 12.5h17"/>` | Known vehicles on map |
| skull | existing `ICON.skull` | Death marker (alarm) |
| mouseL / mouseR | `<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/>` + filled half `<path d="M12 3a6 6 0 0 0-6 6h6V3Z"/>` (L) or `<path d="M12 3a6 6 0 0 1 6 6h-6V3Z"/>` (R) | Keycaps for Mouse0/Mouse2 |
| player | `<path d="M12 3 19 20l-7-4-7 4 7-17Z"/>` filled white, 1.5 px black stroke | Minimap and map |

---

## 4. Shared components

| Component | Spec |
|---|---|
| **Keycap, HUD** | 20 h, min 20 w, `--r-xs`, fill `--ink-1`, text `--bg-1` mono 11/600. Solid so it reads on any background (16.7:1). Mouse buttons use the mouse glyph (12 u) instead of text. Hold actions append `t-label` `HOLD` in `--hud-2`. |
| **Keycap, panel** | Same size, transparent, `inset 0 0 0 1px var(--line-3)`, text `--ink-2`. Used in legends, context menus and options. |
| **Button** | 32 h, padding 0 16, `--r-md`, t-body 500. Secondary: `--fill-2` → hover `--fill-3` → press `--fill-4`. Primary: `--accent` fill, `--on-accent` text 600, hover/press tokens. Danger: transparent, `--alarm` text, hover `--tint-alarm`. Small variant: 24 h, padding 0 8. Disabled: 40% opacity, no pointer. Icon button: 32 × 32 (24 × 24 small), `--ink-2` → hover `--ink-1` on `--fill-2`. |
| **Segmented** | 28 h track `--fill-2`, radius 7, padding 2, gap 2. Segments 24 h, padding 0 12, t-body 500 `--ink-2`. Selected: `--bg-3` thumb, `--ink-1`, `inset 0 0 0 1px var(--line-2), 0 1px 2px rgba(0,0,0,.4)`. Thumb slides at `--d-2`. Arrow keys move the selection. |
| **Toggle** | 36 × 20 pill. Off: track `--fill-4`, 16 knob `--ink-2`. On: track `--accent`, knob `#FFF`. `--d-2`. |
| **Slider** | 200 w, 2 px track `--fill-3`, filled part `--accent`, 14 knob `--ink-1` with `0 1px 3px rgba(0,0,0,.5)`, 20 hit area. Value column: 56 w, right-aligned t-body tnum `--ink-2`; click it to type. Arrows step, Shift+arrow steps ×10. |
| **Input** | 32 h, `--bg-2`, `inset 0 0 0 1px var(--line-2)`, `--r-md`, t-body. Focus: `inset 0 0 0 1px var(--accent)`. Search variant: 16 u search icon inside left, count or clear on the right. |
| **Select** | A button with a chevron that opens a popover list (`--m-pop`, 28 h rows). No native `<select>`, because it can't be styled. |
| **Chip** | 24 h, padding 0 8 0 6, `--r-sm`, 16 u icon + t-body. HUD chips sit on `--m-hud` with a tint for their state. |
| **Section header** | t-label `--ink-3`, 32 h, with optional right-aligned meta (t-body tnum `--ink-2`) and a 24 u icon button. |
| **Stat table** | 2-col grid with 1 px `--line-1` gaps (Teenage Engineering spec sheet). Cells 28 h `--bg-1`, label `--ink-3` left, value tnum right. |
| **Popover / context menu** | `--m-pop`, `--r-md`, padding 4, rows 28 h padding 0 8 with `--r-sm`. Label t-body left, panel keycap right. Hover/keyboard row `--fill-3`. Separator 1 px `--line-1` with 4 margin. Destructive row `--alarm`. Opens at the cursor, flips at viewport edges, Esc closes, arrows + Enter navigate. |
| **Tooltip** | `--m-pop`, 240 w, padding 12. Title t-body 600, meta t-label `--ink-3`, hairline, stat rows (t-body, label `--ink-3`, value tnum). 250 ms delay, 12 u from cursor, flips at edges. |
| **Confirm** | `--m-pop`, 400 w, padding 24, t-title + one t-body line `--ink-2`. Buttons right: Cancel (secondary) and a verb button (primary or danger). Enter confirms, Esc cancels. |
| **Scrollbars** | 6 w thumb `--fill-4` radius 3, no track; visible only on hover or scroll. |

---

## 5. HUD

### 5.1 Layout (1920 × 1080, u = 1)

```
+--------------------------------------------------------------------------------------------------+
| 60 fps                                                                                           |
|                  +--------------------------------------------+               +--------------+   |
|                  |  '  '  W  '  '  '  NW  '  '  |  ' <> '  N ' |  compass      |              |   |
|                  +---------------------+----------------------+  480x28       |   minimap    |   |
|                                     [ 318° ]  heading tab 20h                 |   184x184    |   |
|                              [ o Not enough room ]  toasts (y 96)             |      ^       |   |
|                                                                               +--------------+   |
|                                  Waikiki  location card (y 28%)               | Waikiki 17:37|   |
|                                   O'AHU                                       +--------------+   |
|                                                                                                  |
|                                          .   crosshair                                           |
|                                      [F] Take Canned tuna x2   prompt (y 50%+40)                 |
|                                          0.4 kg                                                  |
|                                                                                                  |
|                                                                             [ fork Canned tuna x2]|
| chat (bottom 128, 440w)                                                     [ mag  5.56 rounds x30]|
| [! Bleeding x2] [~ Soaked]   conditions                                      +------------------+|
| +----+----+----+----+-----+----+         ______ stamina 160x3               | M4A1 CARBINE SEMI ||
| | <3 | () | Y| | [] |  |  | C  |      +--+ +--+ +--+ +--+                   | 31   | 90         ||
| | 41 | 92 | 72 | 18 |35.6°| 64 |      |1 | |2 | |3 | |4 |  hotbar 48        | ============----  ||
| +----+----+----+----+-----+----+      +--+ +--+ +--+ +--+                   +------------------+|
+--------------------------------------------------------------------------------------------------+
  vitals 6 x 48 x 56, edge 24                                                   weapon 240 x 76
```

Rendered: `proposal-systems-hud-idle.jpg`, `-hud-damaged.jpg`, `-hud-vehicle.jpg`, `-hud-spawn.jpg`.

### 5.2 Visibility rules

The HUD mode setting has two values. Always shows every element whenever its data exists. Auto is the default and follows this table:

| Element | Auto: visible when | Hides after |
|---|---|---|
| Crosshair | On foot, not aiming, no screen open (current rule) | never |
| Compass + heading tab | Compass setting on and item gate passes (current rule) | never |
| Minimap | Minimap setting on and map gate passes | never |
| Vitals strip | Per cell: below its show threshold (5.5), changing faster than the trend threshold, or inventory open. The strip hides when no cell qualifies. | 3 s after the cell returns to nominal |
| Conditions | Any active | never while active |
| Stamina bar | Stamina < 100 or max stamina < 100 | 1 s after full |
| Weapon panel | Held item exists and not in a vehicle | Name row and bar fade after 3 s idle. The count stays for firearms; the whole panel fades for other items. Fire, reload, aim, mode change, ammo change or selection wakes it. |
| Hotbar | Any slot bound | 3 s after the last slot key, scroll, hold change or inventory change. Always on while the inventory is open. |
| Prompt | Current rule (`interact.target`, not busy, no screen, setting on) | on target loss |
| Toasts, pickups | On event | 3.5 s / 2.4 s |
| Location card | Entering a new town or island (long location name stable for 2 s), and on spawn | 3 s |
| Key hints | Tutorial setting on, survival mode, per-hint condition (5.13) | 20 s or condition met |

Aiming (`hands.aiming`): the crosshair hides as today; vitals, hotbar, prompt and pickups fade to 0 at `--d-2`; the weapon panel collapses to the count; compass and minimap stay.

In a vehicle (`vehicles.hud()` non-null): crosshair, hotbar and weapon panel hide, and the vehicle panel takes the weapon slot.

### 5.3 Compass (`HUD._buildCompass`, `update`)

- Plate: 480 × 28 u at top centre, `--edge` from the top, with a mask fade on 12% at each end. Scale stays at 3 u per degree.
- Ticks sit on the bottom edge: every 5° is 1 × 5 `--hud-2`, every 15° is 1 × 9 `--hud-1`.
- Labels are t-label only at N/E/S/W (`--hud-1`) and NE/SE/SW/NW (`--hud-2`). The 15° numbers are cut; the heading tab carries the exact value.
- Needle: a 2 × 28 `--hud-1` line at centre.
- Heading tab: a plate 20 h centred 4 u below the compass, showing `318°` in t-body 600 tnum.
- Markers: a 10 u filled accent diamond at the top edge (death marker: alarm skull). The nearest marker within ±20° of heading shows its distance in a 20 h plate (`1.2 km`, t-label `--hud-1`) under the compass at the marker's x, beside the heading tab (it slides aside when they would overlap).
- Removed: the readout line (time moves to the minimap footer, location to the minimap footer and the location card, day to the Status screen).

### 5.4 Minimap (`HUD._minimap`, `MapView.draw`)

- Plate 192 × 216 at the top-right edge, padding 4. Map area 184 × 184, `--r-sm`, heading-up as today. The circle is replaced by a rounded square so it shares the grid.
- Footer row 24 h: location short name (t-body `--hud-1`, ellipsis) left, time `17:37` (t-body tnum `--hud-2`) right.
- North badge: a 16 u `--bg-1` circle with white `N` (600 10 u) on the map edge along north (replaces the orange `N`).
- Player: white filled chevron 16 u with a 1.5 px black stroke, centred.
- Markers: accent diamond 12 u (death: alarm skull, 12 u). Off-screen markers clamp to an 8 u inset and turn into a 6 u accent triangle pointing outward.
- Speed zoom stays (1.1 → 0.55 ppm above 12 m/s), eased over 600 ms instead of snapping.
- Canvas: size it to `184u × devicePixelRatio` (max 2) rather than a fixed 340 px, so it is crisp at every GUI scale.

### 5.5 Vitals strip (`HUD` constructor + `vset`)

- One plate. Cells are 48 × 56 separated by `--line-1` hairlines, always in the order health, blood, food, water, temp, energy. In Auto mode hidden cells collapse, so the plate shrinks from the left edge.
- Cell: 16 u icon at y 10, value t-body 600 tnum at y 30, 2 px bar at the bottom (inset 8 left and right, 6 from the bottom) filled to the value.
- Values: health `S.health` → `82`; blood `S.blood/5000` → `92`; food `S.hunger` → `72`; water `S.thirst` → `18`; temp `S.temp` → `36.9°` (one decimal); energy `S.energy` → `64`. Units are implicit (percent), except temp.
- Trend: an 8 u chevron at the top-right in `--hud-2`, up or down, using the same thresholds as today's `▲▼`.

| Vital | Show threshold (Auto) | Low (warn tint) | Critical (alarm tint + icon blink) |
|---|---|---|---|
| Health | < 95 | < 50 | < 25 |
| Blood | < 95 | < 76 (3800 ml) | < 60 (3000 ml) |
| Food | < 50 | < 30 | < 10 |
| Water | < 50 | < 30 | < 10 |
| Temp | outside 36.0–37.8° | < 36.0° (cold tint) or > 38.0° (warn tint) | < 35.2° or > 38.6° (alarm) |
| Energy | < 30 | < 25 | < 10 |

- Colour-blind safety: every state change also changes the fill level and the tint area, and critical blinks. Hue is never the only signal.
- Breath (underwater) is not a vitals cell. It replaces the stamina bar (5.8).

### 5.6 Conditions

- Chips sit 8 u above the vitals strip, left-aligned with a 4 u gap, and wrap to a 440 u width.
- Chip = 16 u icon (3.2) + label t-body `--hud-1`. The chip is tinted by `kind`: `bad` gets `--tint-alarm` and an alarm icon; `warn` gets `--tint-warn` and a warn icon; `good` stays neutral with a `--hud-2` icon (green is removed).
- Labels come from `Survival.conditions()` unchanged (already 1–2 words).

### 5.7 Weapon / held item (`HUD._weapon`)

Plate 240 × 76 at the bottom-right edge, padding 12.

```
+--------------------------------------+
| M4A1 CARBINE                    SEMI |   t-label hud-2 (name ellipsis) / mode t-label hud-1
| 31   [mag] 90                        |   t-num hud-1 / 16u magazine glyph + t-body tnum hud-2
| =======================-------       |   2 px condition bar
+--------------------------------------+
```

- Ammo `ammoOf(held)` is `t-num`. When it is 0 the plate gets an alarm tint; at ≤ 20% of capacity it gets a warn tint. The number itself stays white.
- Reserve `ammoInfo().reserve` follows the magazine glyph. This removes the `31 / 30` ambiguity.
- Mode `ammoInfo().mode` is uppercased (`SEMI`, `AUTO`, `BURST`). When it is `jammed` the mode slot becomes a 20 h alarm-filled chip `JAM` (`--on-accent` text), and the prompt under the crosshair shows `[R] Clear` (5.10).
- Condition bar: `held.cond` in `--hud-2`, warn below 50%, alarm below 25%.
- Other held items: a melee weapon or tool shows the name row and the condition bar only (no number). A stack (grenade, bandage) shows `t-num` = qty. A liquid container shows `0.8 L` t-num + t-label `WATER`. A battery device shows `72%`.
- The item thumbnail and the calibre line are cut (the calibre lives in the tooltip).

### 5.8 Stamina / breath

- Bar 160 × 3 centred 12 u above the hotbar (or 24 u above the bottom edge when the hotbar is hidden). The track is `rgba(0,0,0,.45)` with a 1 px `rgba(0,0,0,.25)` ring, and the fill is `--hud-1`; below 20% the fill turns `--alarm`.
- Max stamina (`S.maxStamina()`) shortens the track itself from the right, rather than using an inset shadow.
- Underwater, the same bar shows breath with a 12 u breath icon at its left, and turns alarm below 25%.

### 5.9 Hotbar (`HUD._hotbar`)

- Cells 48 × 48 plates, gap 4, centred at the bottom edge. Only slots 1 up to the highest bound slot render; unbound slots in between are outline-only at 40% opacity, so positions never shift.
- Cell: item render 36 u, slot number mono 10 `--hud-2` at the top-left (4, 3), qty or rounds t-body 600 tnum at the bottom-right.
- Selected (`inv.hands`): `inset 0 0 0 1.5px var(--accent)` and the slot number in accent.
- While the inventory is open, all 9 cells render and act as drop targets: drop an item on one to bind it (see 6.5).

### 5.10 Interaction prompt

```
          .
   +-----------------------------+
   | [F]  Take Canned tuna x2    |    keycap + t-body 600 hud-1
   |      0.4 kg                 |    t-body tnum hud-2 (t.sub)
   +-----------------------------+
```

- Plate at x centre, y = 50% + 40 u, padding 8 12 8 8, min height 32. The first line is the keycap (`input.label(t.key || 'interact')`) plus `t.label`. The second line is `t.sub` when present.
- Hold targets (`t.hold`): a `HOLD` t-label goes after the keycap. While holding, a 2 px accent bar grows along the plate's bottom edge from `interact.holdT / t.hold`. The separate ring is not used for holds.
- Jam: when `ammoInfo().mode === 'jammed'` and no other target exists, show `[R] Clear` using `input.label('reload')`.

### 5.11 Timed action (`g.actions.busy`)

- Ring: 48 u around the crosshair. The track is 3 px `rgba(0,0,0,.45)`; the arc is 2 px `--accent` with round caps, starting at 12 o'clock and clockwise.
- Label plate 28 h at y = 50% + 36: `current.label` t-body 600 + remaining seconds t-body tnum `--hud-2` (`2.4 s` = `current.time − current.t`, one decimal).
- `(move to cancel)` is cut.

### 5.12 Toasts and pickups (`HUD.toast`, `HUD.pickup`)

- Toasts: centred column at y = 96 u, max 3, newest at the bottom. Each is a plate 28 h, padding 0 12, containing a 6 u status dot (warn/alarm; none for info/good) or a 20 u item icon, plus t-body text. An identical text within 2 s increments a `×2` suffix instead of stacking. Motion: in `--d-2` (opacity, translateY −4 → 0), out `--d-3`.
- Pickups: right-aligned column above the weapon panel (bottom = 24 + 76 + 12 u), max 4. Plate 28 h: 20 u item icon, name t-body, `×2` t-body 600 tnum `--hud-2`. The same item id within 1.5 s merges (qty sums, timer restarts).
- Menu toasts (`toastScreen`): same pill, bottom-centre, 48 u from the bottom.

### 5.13 Location card and key hints (replace spawn toasts and `TIPS`)

- **Location card**: a `--m-hud` plate, padding 12 20, centred at y = 28%. It contains the name at 28/600 `--hud-1` and, 4 u below, the island t-label `--hud-2`. It fades in at `--d-3`, holds 3 s and fades out at `--d-4`.
- **Key hints**: a plate at bottom centre, 28 u above the hotbar, 32 h, padding 8 12, with groups `[keycaps] Word` gapped 16. One group set at a time:

| Order | Content | Until |
|---|---|---|
| 1 | `[W][A][S][D] Move  [Shift] Sprint  [C] Crouch` | `player.distance > 30` |
| 2 | `[Tab] Inventory` | inventory opened |
| 3 | `[M] Map` | map opened |
| 4 | `[T] Chat` | chat opened |
| creative | `[Space]×2 Fly` | first flight or 20 s |

Labels come from `input.label(action)`, so rebinding updates them.

### 5.14 Crosshair, hitmarker, damage direction

- Dot: 4 u, `#FFF` with a 1 px `rgba(0,0,0,.55)` ring.
- Dynamic: four 2 × 8 u white bars with a 1 px dark outline, gap from `crosshairSpread()` (current formula).
- Hitmarker: four 6 u × 1.5 px diagonal ticks starting 5 u from centre, white with a dark outline. A kill makes them `--alarm` and 8 u long. Show 120 ms, fade over 160 ms.
- Damage direction: on a 240 u ring, a 36° arc segment, 3 px `--alarm` with a 1 px dark outline, rotated to the source; opacity from `S.lastHitDir.t`. It replaces the radial blob.

### 5.15 Vehicle panel (`HUD._vehicle`, replaces the weapon panel)

```
+--------------------------------------+
| PICKUP TRUCK                    [D3] |   t-label hud-2 / gear chip 20h fill-3 t-label
| 84 KM/H                              |   t-num + t-label hud-2 (KN for boats)
| [fuel] ==========---------     42%   |   16u icon, 2px bar, t-body tnum
| [wrench] ==================--  88%   |
| ALT 420 M                            |   aircraft only (v.altitude != null)
+--------------------------------------+
```

- Plate 240 w, padding 12. Speed `|v.speed|·3.6` (km/h) or `/1.852` (kn).
- Fuel `v.fuel` bar and value turn alarm below 15%; condition `v.health` turns alarm below 30%.
- Build the DOM once and update `textContent` / `style.width`. Today the panel rewrites `innerHTML` every 3 frames.

### 5.16 Misc

- FPS: mono 11 `--hud-2` on a 20 h plate at the top-left edge, `60 fps`. It should default to off (`showFps` default, Settings.js; see section 18).
- Debug (F3): mono 12/16 on `--m-pop`, max 720 w, top-left under the FPS chip, `white-space: pre`. Drop the `Deadtide —` prefix.
- Lock hint: a centred plate at 58%, 32 h, reading `Click to resume`.
- Night: no changes needed; the plates are already dark. Nothing in the HUD depends on scene brightness.

---

## 6. Inventory

### 6.1 Layout

Panel `--m-panel`, `--r-lg`, width 1104 u, height min(800 u, 100vh − 96 u), centred on the scrim. Rows: top bar 56, body, footer 40. Three fixed columns separated by 1 px `--line-1` hairlines: 388 | 328 | 388 (6 cells | 5 cells | 6 cells, each with 16 padding).

```
+------------------------------------------------------------------------------------------------+
| Inventory                                                    ====------  11.2 / 30 kg     [x]  |
+--------------------------------+---------------------------+-----------------------------------+
| [ Fridge | Crafting | Catalog ] | EQUIPMENT                 | CARRIED                7.5/40 [sort]|
|                                 | [hd][ey][fc][to][vs]      | [shirt] Pockets            3.5/4  |
| Fridge                    5/12  | [bk][gl][lg][ft][bt]      | =================================  |
| ======--------------------      |                           | [  ][  ][  ]                      |
| [  ][  ][  ][  ][  ]            | [ Primary     ][hs][ml]   | [legs] Cargo shorts          4/6  |
|                                 | [ Secondary   ][ Hands ]  | ===================-----------   |
| Ground              2 [Take all]|                           | [  ][  ][  ]                      |
| [  ][  ]                        | Weight 11.2 kg | Health 82% | [pack] Hiking backpack      0/30 |
|                                 | Insul.   20%   | Blood  92% | --------------------------------  |
|                                 | Bite     10%   | Body 36.9° |                                   |
|                                 | Wet       0%   | Air   27°  |                                   |
+--------------------------------+---------------------------+-----------------------------------+
| [Dbl] Take   [Shift] Take   [RMB] More   [1-9] Bind                                            |
+------------------------------------------------------------------------------------------------+
```

Rendered: `proposal-systems-inventory.jpg` (tooltip, drag ghost with drop label, valid/target slots, context menu).

- **Top bar**: `Inventory` t-title. On the right, a 120 u weight bar (2 px, `--ink-1` fill; warn above 30 kg, alarm above 40 kg) and `11.2 / 30 kg` t-body tnum `--ink-2`, then the close icon button. The hint sentence and the `carried` / `overloaded` words are cut.
- **Footer**: the contextual legend (6.8).
- Esc, the Inventory key, or a click on the scrim closes it (current behaviour).

### 6.2 Left column: Nearby / Crafting / Catalog

- A segmented control at the top: `Nearby` (renamed to `other.label` when a container is open), `Crafting`, and `Catalog` in creative mode only.
- Sections have no boxes; spacing and hairlines separate them:
  - Header 32 h: name t-body 600, capacity `5/12` t-body tnum `--ink-2` right.
  - Capacity bar: 2 px `--fill-3` track, `--ink-2` fill; warn above 90%, alarm when full.
  - Then the 6-across cell grid.
- **Opened container** first, then **Ground**. The Ground header shows the item count (`2`) and a small `Take all` button, only when items exist.
- An empty ground shows nothing but a 56 u drop well (a transparent row that highlights on drag). `Drop items here` is cut.
- Walking more than 4 m away closes the container (current behaviour). Its section fades out over `--d-2`, with no toast.

### 6.3 Middle column: Equipment

- Header t-label `EQUIPMENT`. The `Day N` / `Creative` meta is cut.
- **Clothing**: 5 × 2 grid of 56 u slots, in body order: Head, Eyewear, Face, Top, Vest / Back, Gloves, Pants, Shoes, Belt (`EQUIP_SLOTS` order regrouped). An empty slot shows its 24 u glyph in `--ink-3` and no text label; the name is in the tooltip.
- **Weapons**, 12 u below, on the same 5-column grid:
  - Row 1: Primary (3 wide, 176 × 56), Holster (1), Melee (1).
  - Row 2: Secondary (3 wide), **Hands** (2 wide, 116 × 56).
- **Hands cell** (new, UI-only) shows `inv.heldStack()`. Dropping an item there calls `hands.select(stack)`; double-clicking it calls `hands.holster()`. It replaces the `In hands: X` / `Hands empty` line.
- **Stat table** (section 4) 16 u below: Weight `11.2 kg`, Health `82%`, Insulation `20%`, Blood `92%`, Bite `10%`, Body `36.9°`, Wet `0%`, Air `27°`. `Infected killed` moves to the Status screen.
- The gradient weight bar is cut (the top bar carries weight).

### 6.4 Right column: Carried

- Header t-label `CARRIED`, total `7.5/40` t-body tnum `--ink-2`, and a 24 u sort icon button (`title="Sort"`).
- One section per container in `inv.containers()` order. Each header is the 20 u item render (owner) or the torso glyph for Pockets, the name, and `used/cap`, followed by the capacity bar and the grid.
- An empty container shows its header and a 0% bar, with no grid and no `Empty` text.
- `Wear clothes with pockets or a backpack to carry more.` is cut.
- The whole header is a drop target, so dropping on a collapsed/empty container works.

### 6.5 Item cell (`InventoryUI._item`)

```
+----------------+   56 x 56, r-sm, fill-1, inset 1px line-1
| o            4 |   o = held dot (6u accent) top-left 5,5; 4 = hotbar slot, mono 10 ink-3, top-right 4,3
|     [icon]     |   item render 44u (glyph fallback 32u), centred
|             30 |   qty / rounds: Inter 11u 600 tnum ink-1, 1px dark text-shadow, bottom-right 4,3
| ========---    |   2px bar, inset 6 left/right, 4 from bottom
+----------------+
```

- **One bar = the item's key consumable**:

| Item | Bar shows |
|---|---|
| Firearm, melee, clothing, backpack, tool, attachment | condition |
| Food with `spoil` | freshness |
| Liquid container | fill (`data.amount / capacity`) |
| Battery device | charge |
| Fuel | litres / max |

  The bar colour is `--ink-2`, warn below 50% and alarm below 25%. Hide it when the value is ≥ 99.9% (except fill and charge, which always show).
- Spoiled food (`freshness ≤ 0`): icon at 50% opacity + alarm bar at 0 width + an alarm 6 u dot top-left. The sepia filter is cut.
- Rarity borders are cut, and the `HELD` tag is replaced by the accent dot.

| State | Visual |
|---|---|
| Rest | `--fill-1`, `inset 0 0 0 1px var(--line-1)` |
| Hover | `--fill-3`, `--line-3`; tooltip after 250 ms |
| Pressed | `--fill-4` |
| Keyboard focus | 2 px accent outline, offset 2 |
| Selected (context menu open) | `inset 0 0 0 1.5px var(--accent)` |
| Drag source | opacity 0.32 |
| Valid target during drag | `inset 0 0 0 1px var(--accent-line)` on every slot/container that accepts the dragged stack, computed once at drag start |
| Hovered valid target | `--accent-soft` fill + `inset 0 0 0 1.5px var(--accent)` |
| Hovered invalid target | `inset 0 0 0 1.5px var(--alarm)`, cursor `not-allowed`, no fill |
| Item-on-item action | Hovered cell shows the accent outline plus a 20 h accent chip above it with `--on-accent` t-label: `LOAD` (ammo → mag / internal gun), `INSERT` (mag → gun), `ATTACH`, `MERGE`. It mirrors `_dropOnItem`. |

- **Equipment slot**: the same cell (56 or wide), with the empty glyph instead of an item.
- **Drag ghost**: a 56 u `--m-pop` cell with the icon, qty badge, pop shadow and −3° rotation, centred on the cursor.
- Releasing over the scrim outside the panel drops the item to the ground (new; same path as `move(…, { type: 'ground' })`).

### 6.6 Tooltip (`InventoryUI._tip`)

```
+--------------------------------+
| M4A1 Carbine                   |   t-body 600 ink-1 (displayName, x qty)
| FIREARM . 5.56                 |   t-label ink-3: category . calibre|slot|liquid
+--------------------------------+
| Condition        Worn  ===--   |   label ink-3 / value tnum ink-1 (+ mini 32u bar)
| Loaded            31/30        |
| Damage               38        |
| Rate            800 rpm        |
| Modes         Semi . Auto      |
| Range             400 m        |
| Scope . Suppressor             |   attachments, t-body ink-2, one line
+--------------------------------+
| 3.40 kg                size 4  |   footer: weight, size (tnum ink-2)
+--------------------------------+
```

- `d.desc`, the rarity and the `Double-click: …` hint are cut.
- Row labels are 1 word, values carry units:

| Category | Rows |
|---|---|
| Firearm | Condition, Loaded (`31/30`), Damage, Rate (`800 rpm`), Modes, Range (`400 m`), attachments line |
| Magazine | Rounds (`18/30`), Calibre |
| Ammo | Calibre |
| Melee | Condition, Damage, Speed (`1.4/s`), Reach (`1.2 m`) |
| Clothing / backpack | Condition, Storage, Insulation %, Bite %, Ballistic %, Waterproof % (only non-zero rows) |
| Food | Energy (`250 kcal`), Water (`+40`), Freshness %, flags line: `Raw`, `Sealed` |
| Drink | Water (`+50`), flag `Alcohol` |
| Medical | Bleeding (`−2`), Health (`+20`), Infection (`−60%`), Blood (`+500 ml`), flag `Splint` |
| Tool | Battery %, Contents (`0.8 L Water` / `Empty`), Fuel (`4.2 L`) |

### 6.7 Context menu (`InventoryUI._menu`)

- The component spec from section 4 applies. Order: default action, then category actions, hairline, then Hold, Bind/Unbind, Split, Put in X, Drop, hairline, then Delete (creative, alarm).
- Labels and shortcuts:

| Current | New label | Right side |
|---|---|---|
| Take (`Shift-click`) | Take | `[⇧]` |
| default (`Double-click`) | (unchanged verb) | `[Dbl]` |
| Remove magazine | Eject magazine | |
| Unload | Unload | |
| Detach X | Detach X | |
| Insert magazine (n) | Insert magazine | `n` tnum ink-3 |
| Load rounds | Load rounds | |
| Empty magazine | Unload magazine | |
| Attach to X | Attach to X | |
| Hold in hands | Hold | |
| Remove from hotbar n | Unbind | `n` |
| Add to hotbar (`hover + 1–9`) | Bind | `[1–9]` |
| Split stack | Split | |
| Put in X | Put in X | `[⇧]` when X is the open container |
| Drop | Drop | |

- The menu is positioned inside the viewport using its measured height, not `items.length * 32`.

**Split popover** (`_split`):
- `--m-pop` 240 w: t-body 600 `Split`, a slider with a numeric input (tnum, 56 w), a `½` small button, and a primary small `Split` button.
- Enter confirms and Esc cancels.

### 6.8 Contextual legend (footer)

- The footer shows panel keycaps plus one word each, for the hovered item's location only:
  - Ground or container: `[Dbl] Take  [⇧] Take  [RMB] More`
  - Own item: `[Dbl] <default verb>  [⇧] Move  [RMB] More  [1–9] Bind`
  - Equipped: `[Dbl] Take off  [RMB] More`
  - Catalog: `[Click] Give 1  [⇧] Stack`
- With no hover it is empty. Hidden when the Key hints setting is off.

### 6.9 Crafting tab (`_crafting`)

- A segmented control on top: `All | Ready`.
- Rows 64 h, 12 u gap, grid `56 | 1fr | auto`, with a hairline between rows:

```
[icon] Splint x1                              [ Craft ]
       [Stick 2/2] [Rag 1/2]  [knife v] [Fire x]
```

  - Line 1: t-body 600 name + `×n` output.
  - Line 2: 20 h chips. Ingredients show name + `have/need` tnum; the text goes `--alarm` when short, with no fill. Tools and station are chips with check (`--ink-2`) or x (`--alarm`). `at a fire` becomes `Fire`.
  - Craft: small button, primary when `canCraft`, disabled otherwise.
- Sort: ready first, then by name. The inventory stays open after crafting when the recipe has no timed action; otherwise it closes (current) so the action ring is visible.
- An empty state renders nothing.

### 6.10 Creative catalog (`_catalog`)

- Search input (32 h, search icon) with the result count at its right (`412` tnum `--ink-3`) and placeholder `Search`.
- Category chips in a single horizontally scrolling row (24 h segmented style), not wrapped.
- 6-across cell grid. Click gives 1, Shift-click gives a full stack, drag places (current behaviour).
- The hint line `412 items · click to take one…` and `Nothing matches.` are cut.

### 6.11 Keyboard

- In addition to today's keys:
  - Arrow keys move focus across cells (grid-aware, crossing into the next section).
  - Enter runs the default action; Shift+Enter quick-moves.
  - `Menu` / Shift+F10 opens the context menu.
  - Delete drops.
  - 1–9 binds (current).
- Focus uses the 2 px accent ring.

---

## 7. Map and minimap

### 7.1 Full map (`MapUI.open`, `update`)

```
+--------------------------------------------------------------------------------------------------+
| +---------------+                                                                    [M] [x]     |
| | Waikiki       |  t-title                                                                       |
| | O'AHU         |  t-label ink-3                                                     +----+      |
| +---------------+                                                                    | +  |      |
|                                                                                      | -  |      |
|                                (relief + vectors)                                    +----+      |
|                                                                                      | (o)| me   |
|                    <> 1                                                              | [] | fit  |
|                         ^ player                                                     | == | layers|
|                                                                                      +----+      |
|                                                                                                  |
| |----|----|  2 km                                        -3880, -9660 . 312 m . 1.4 km          |
+--------------------------------------------------------------------------------------------------+
```

**Chrome** (all `--m-hud` plates, `--edge` insets):
- Title plate, top-left: current location long name, t-title + island t-label. The instruction sentence is cut.
- Close, top-right: a 32 u icon button with the panel keycap of the Map key to its left.
- Tool stack, right edge, vertically centred: one plate of 32 × 32 icon buttons with hairlines between them:
  - Zoom in, Zoom out (buttons, wheel, `+` / `−` keys).
  - Locate (`C`, current).
  - Fit islands.
  - Layers.
  - Hover title shows the name + keycap (`Centre  C`).
- Layers popover (`--m-pop`): toggles for Roads, Buildings, Grid, Markers, Vehicles. It replaces the permanent legend.
- Scale bar, bottom-left: a 1 px white line with 5 u end ticks plus a `2 km` t-body label (`(game)` cut), directly on the map with a halo. Draw it in the DOM, not on the canvas, so it uses the type tokens.
- Cursor readout, bottom-right plate, mono 12 tnum: `−3880, −9660 · 312 m · 1.4 km` (x, z · elevation or `−40 m` depth · distance from player). `elev` / `(real)` / `away` are cut, and the plate is hidden until the pointer moves.

**Canvas**:
- Player: white chevron 16 u with a black stroke, plus a 60° view cone in `rgba(255,255,255,.12)`.
- Markers: accent diamond 12 u (1.5 px black stroke) with label t-body 600 white + 3 px dark halo.
  - `locate` markers: hollow accent diamond.
  - `death`: alarm skull 14 u.
  - Known vehicles: white car glyph 14 u (replaces the lilac dots).
- Grid: 1 km (250 m zoomed in) hairlines at `rgba(255,255,255,.06)`.

**Interaction**:
- Drag to pan and wheel-zoom to cursor (current).
- WASD / arrows pan at 600 px/s.
- Double-click adds a marker labelled with the next number (`1`, `2`…).
- Right-click on a marker opens a mini context menu: `Rename`, `Remove`. Rename uses an inline 32 h input at the marker.
- Creative: while Shift is held, the cursor shows a 20 h accent chip `TELEPORT` next to it, and a click teleports (current action).

### 7.2 Palette (maptile.js, MapView.js)

The relief stays (it is information), but it is quieter so orange markers and white roads lead.

| Layer | Now | Proposed |
|---|---|---|
| Out-of-world fill (`MapView.draw` fillRect) | `#0c244a` | `#132B45` |
| SEA stops (0, −0.6, −3, −12, −40, −150, −600) | saturated cyan → navy | `#86C9CC`, `#5EB2BF`, `#3C8FAE`, `#2B6E96`, `#22557F`, `#1B3F66`, `#152E4D` |
| Land cover | full saturation | mix each land RGB 25% toward its luma before hillshade |
| Hillshade clamp | 0.45–1.35 | 0.6–1.25 |
| Freeway (4-lane) | casing `rgba(90,50,20,.6)`, line `#ffc861` | casing `rgba(0,0,0,.35)`, line `#FFFFFF` |
| Highway (2-lane) | `#fbf6e8` | `rgba(255,255,255,.85)` |
| Streets | `rgba(248,246,238,.9)` | `rgba(255,255,255,.6)` |
| Dirt (dashed) | `rgba(150,110,70,.9)` | `rgba(255,255,255,.45)` dashed 4/3 |
| Buildings | `rgba(92,84,78,.9)` | `rgba(30,32,36,.55)` |
| Runways | `rgba(70,70,76,.85)` | `rgba(40,42,46,.8)` |
| Island labels | 600 11+ppm·40 px caps, spacing 3 | t-label style 12 u, +0.2em, `#FFFFFF` 90% |
| City labels | 700/600 15/13/11 px, military `#ffd0a0` | 600 14 / 600 12 / 500 11 u, all white (no military hue) |
| Water labels | italic 500 12 px `#bfe8ff` | italic 500 11 u `rgba(200,225,255,.8)` |
| Peaks | `▲ name` 500 11 px | unchanged glyph, 500 11 u `--ink-2` equivalent |

Label fonts on canvas multiply by u (2.1).

### 7.3 Minimap

See 5.4. It uses the same palette with `labels: false`.

---

## 8. Chat and commands (`Chat.js`)

```
                                                         (log, closed: last 6 lines, one plate row each)
 Gave 1 x M4A1 Carbine
 /give m4a1
+----------------------------------------------+
| /give      <item> [count]     Give yourself..|   suggest: m-pop, rows 24h
| /god                          Toggle invul...|   selected: accent-soft + 2px accent left bar
+----------------------------------------------+
+----------------------------------------------+
| /give m4a1_                                  |   input 32h, mono 12 when it starts with '/', Inter otherwise
+----------------------------------------------+
```

- Position: left `--edge`, bottom 128 u (above conditions and vitals), 440 w.
- **Closed**: the last 6 lines, each on its own `--m-hud` plate row (20 h, padding 0 8, `--r-sm`, width fits the text), t-body `--hud-1`. Each fades after 8 s.
- **Open**: the log gets a `--m-panel` plate (max 280 h, scrollable), and all lines show.
- Line kinds:

| Kind | Style |
|---|---|
| `sys` | `--ink-2` |
| `cmd` (echo) | mono 12 `--ink-3` |
| `ok` | `--ink-1` |
| `err` | `--alarm` |
| `me` | `--ink-1` |

- Suggestions: rows 24 h, mono 12. Command `--ink-1`, then args from `usage` minus the command in `--ink-3`, and `desc` right-aligned in t-body `--ink-3` with ellipsis. Keys: Tab / ↑↓ / Enter (current).
- Ghost completion: the first suggestion's remaining text renders after the caret in `--ink-4` (Tab accepts).
- The placeholder `Say something or type /help` and the welcome line are cut.

---

## 9. Title screen (`Menus.title`)

```
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|                                    (live world, title camera)                                    |
|                                                                                                  |
|  D E A D T I D E                         wordmark 56u                                            |
|                                                                                                  |
|  Continue                  My World . Day 4        menu rows 40h, t-title 500 ink-2, meta t-body ink-3|
|  Worlds                                                                                          |
|  Options                                                                                         |
|  About                                                                                           |
|                                                                                              v0.1|
+--------------------------------------------------------------------------------------------------+
```

- A left column 360 w, 96 u from the left edge and 96 u from the bottom. Wordmark, 48 u gap, then 4 rows.
- Row states:
  - Rest: `--ink-2`.
  - Hover or focus: `--ink-1` + a 2 × 20 accent bar 12 u left of the text; the text does not shift.
  - Press: `--accent`.
  - ↑↓ + Enter navigate, and the first row has focus on open.
- `Continue` shows only when a live world exists; its meta is the world name + `Day N`.
- Scrim: `linear-gradient(90deg, rgba(6,7,8,.78) 0%, rgba(6,7,8,.35) 40%, transparent 65%)`.
- Footer: the version only (`v0.1`, mono 11 `--ink-3`), bottom-right.
- Cut: the kicker, the credits footer, the Controls row (now Options › Keys), and the `Singleplayer` / `Credits` labels (renamed `Worlds` / `About`).

**About** (replaces `credits()`): panel 560, title `About`, stat-table rows:

| Label | Value |
|---|---|
| Version | 0.1 |
| Terrain | AWS Terrain Tiles: USGS 3DEP, SRTM, ETOPO1, GMRT |
| Scale | 1:8 |
| Textures | Poly Haven (CC0) |
| Sounds | Freesound (CC0) via Tidewater |
| Characters | Microsoft Rocketbox (MIT) |
| Interface basis | Tidewater (MIT) |
| Engine | three.js |
| Fonts | Inter, JetBrains Mono (OFL) |

Links are in accent. The prose and the sign-off line are cut.

---

## 10. Worlds, new world, world details

### 10.1 Worlds (`Menus.worlds`)

```
+------------------------------------------------------------------------------------------+
| Worlds                                                   [import] [+ New world]   [x]    |
+------------------------------------------------------------------------------------------+
| [thumb 96x54]  My World                                          [edit][dup][exp][trash] |
|                SURVIVAL . NORMAL   Day 4 . 3h 20m . Today 14:02                          |
|------------------------------------------------------------------------------------------|
| [thumb 96x54]  Big Island run                                                            |
|                HARDCORE . DEAD     Day 11 . 9h 02m . Sep 21                              |
+------------------------------------------------------------------------------------------+
|                                                                               [ Play ]   |
+------------------------------------------------------------------------------------------+
```

- Panel 880 × min(640, 90vh).
- Rows 72 h, padding 8, grid `96 | 1fr | auto`, with a hairline between rows.
  - Name: t-body 600.
  - Meta line: t-label `--ink-3` for mode/difficulty (hardcore in alarm, `DEAD` in alarm), then t-body tnum `--ink-3` for `Day 4 · 3h 20m · Today 14:02`.
  - The seed moves to Details.
- Row states: hover `--fill-2`; selected `--accent-soft` + `inset 0 0 0 1px var(--accent-line)`.
- Row actions: 28 u icon buttons, visible on hover or selection: Details (edit), Duplicate, Export, Delete (alarm on hover, confirm).
- Keyboard: ↑↓ selects, Enter plays, F2 opens Details, Delete deletes. Double-click plays (current).
- Empty state: centred t-body `--ink-3` `No worlds` + primary `New world`.
- A dead hardcore world's row is at 60% opacity and Play is disabled.
- Import errors go to a menu toast with the error text.

### 10.2 New world (`createWorld`)

Panel 560. Option rows 40 h: label t-body `--ink-2` left, control right-aligned in a 280 column.

| Row | Control |
|---|---|
| Name | Input, max 40, focused and selected |
| Seed | Input, mono, placeholder `Random` |
| Mode | Segmented `Survival · Creative` |
| Difficulty | Segmented `Easy · Normal · Hard` |
| Hardcore | Toggle (disabled and off when Creative) |
| Day length | Segmented `24 · 48 · 96 · 144` + t-label `MIN` after |
| Start time | Segmented `07:30 · 12:00 · 17:30 · 21:00` |
| Spawn | Select: `Random`, `Oʻahu`, `Kauaʻi`, `Maui`, `Hawaiʻi`, `Molokaʻi`, `Lānaʻi`, `Niʻihau` |

Footer: `Cancel`, primary `Create`. Enter creates. All row hints and the panel subtitle are cut.

### 10.3 World details (`editWorld`)

- Panel 560, title `World`.
- Rows: Name (input); Seed (mono value + copy icon button; a `Copied` menu toast confirms).
- Stat table: Created, Played, Kills, Deaths, Distance (`14.2 km`).
- Footer: `Delete` (danger) left; `Duplicate`, `Export`, primary `Save` right.

---

## 11. Options (`Menus.options`, `_keybinds`)

### 11.1 Frame

```
+----------------------------------------------------------------------------------+
| Options                                                                    [x]   |
+-------------+--------------------------------------------------------------------+
| Graphics    | QUALITY                                                            |
| Interface   | Preset                          [ Low | Medium | High | Ultra ]    |
| Audio       |--------------------------------------------------------------------|
| Controls    | VIEW                                                               |
| Keys        | Render distance         o=========-------------          1.4 km    |
| Gameplay    | Field of view           o==========------------             80°    |
|             | Resolution              o==============--------            100%    |
|             | ...                                                                |
+-------------+--------------------------------------------------------------------+
| [Reset tab]                                                             [ Done ] |
+----------------------------------------------------------------------------------+
```

- Panel 800 × 640 fixed (tabs never resize the panel).
- Left rail 176 w with `--line-1` on its right. Rail rows are 32 h, t-body; selected is `--fill-3` bg + `--ink-1`, others `--ink-2`. The rail supports keyboard ↑↓.
- Content scrolls. Sections have a t-label `--ink-3` header 32 h; option rows are 40 h with a `--line-1` hairline between them. Label t-body `--ink-2` left, control column right.
- Footer: `Reset tab` (secondary; confirm `Reset Graphics?` / `Key bindings stay.` for non-key tabs) and primary `Done`.
- The panel subtitle `Saved automatically.` is cut.
- Esc / Done returns to the caller (title or pause).
- Within a game the screen uses `.clear` (current), and changes apply live.

### 11.2 Tabs and rows

Every row maps to an existing Settings key unless marked **new** (read with a default; see section 19).

**Graphics**

| Section | Row | Control | Key |
|---|---|---|---|
| Quality | Preset | Segmented Low/Medium/High/Ultra; shows `Custom` (disabled segment) when a detail differs from the preset | `quality` + `applyPreset` |
| View | Render distance | Slider 0.4–4.0 km, step 0.1, `1.4 km` | `renderDistance` |
| View | Field of view | Slider 60–110, `80°` | `fov` |
| View | Resolution | Slider 50–150%, step 5 | `renderScale` |
| Detail | Shadows | Segmented Off/Medium/High/Ultra | `shadows` |
| Detail | Terrain | Segmented Low/Medium/High/Ultra | `terrainDetail` |
| Detail | Vegetation | Segmented Low/Medium/High/Ultra | `vegetation` |
| Detail | Grass | Toggle | `grass` |
| Detail | Clouds | Segmented Off/Low/High | `clouds` |
| Detail | Water | Segmented Low/Medium/High | `water` |
| Image | Anti-aliasing | Segmented Off/FXAA/MSAA | `antialias` |
| Image | Bloom | Toggle | `bloom` |
| Image | Night brightness | Slider 30–200% | `nightBrightness` |

**Interface**

| Row | Control | Key |
|---|---|---|
| GUI scale | Slider 70–160%, applies on release (the panel would resize under the pointer otherwise) | `guiScale` |
| HUD | Segmented Auto/Always | **new** `hudMode` (default `auto`) |
| Crosshair | Segmented Dot/Dynamic/None | `crosshair` |
| Compass | Toggle | `compass` |
| Minimap | Toggle | `minimap` |
| Hit markers | Toggle | `hitMarkers` |
| Damage direction | Toggle | `damageIndicators` |
| Interaction prompts | Toggle | `showInteractHints` |
| Key hints | Toggle | `tutorial` |
| FPS | Toggle | `showFps` |

**Audio**: Master, Effects, Ambience, Interface as sliders 0–100% (`masterVolume`, `sfxVolume`, `ambientVolume`, `uiVolume`).

**Controls**

| Row | Control | Key |
|---|---|---|
| Sensitivity | Slider 0.20–3.00, `1.00×` | `sensitivity` |
| Invert Y | Toggle | `invertY` |
| Crouch | Segmented Hold/Toggle | `toggleCrouch` |
| Aim | Segmented Hold/Toggle | `toggleAim` |
| Sprint | Segmented Hold/Toggle | `toggleSprint` |
| Head bob | Slider 0–100% | `headBob` |

**Keys**: see 11.3. This tab is the single controls reference; the `controls()` screen is removed.

**Gameplay**

| Row | Control | Key |
|---|---|---|
| Auto-pickup ammo | Toggle | `autoPickupAmmo` |
| Map and compass | Segmented Always/Need item | `realisticMap` |

### 11.3 Key rebinding

```
| [search] Filter                                                                  |
| MOVEMENT                                                                         |
| Forward                                   [   W    ]  [   ↑    ]   (reset)       |
| Sprint                                    [ Shift  ]  [   —    ]                 |
| COMBAT                                                                           |
| Fire                                      [ (L)    ]  [   —    ]                 |
| Map                                       [   M    ]! [   —    ]    <- conflict  |
|----------------------------------------------------------------------------------|
| [Esc] Cancel   [Backspace] Clear                              (while listening)  |
```

- A search input at the top filters rows by label (case-insensitive).
- Groups (t-label headers): Movement, Combat (was Actions), Hotbar, Menus, Vehicle.
- Row: label t-body `--ink-2`, primary and alternate bind buttons, and a reset icon button that shows only when the binding differs from `DEFAULT_BINDINGS`.
- Bind button: 96 × 28, `--bg-2`, `inset 0 0 0 1px var(--line-2)`, `--r-sm`, mono 12 600 `--ink-1`. Mouse buttons render the mouse glyph and wheel `↑`/`↓`. An empty binding shows `—` in `--ink-4`.
- Listening: `inset 0 0 0 1.5px var(--accent)` and a 1 Hz blinking 2 × 14 accent caret. The footer swaps to the contextual keycaps `[Esc] Cancel [Backspace] Clear`. The text `Press a key…` is cut.
- Conflict: `inset 0 0 0 1.5px var(--alarm)` + a 6 u alarm dot at the top-right. The tooltip reads `Also: Map, Horn`. The vehicle-set exception stays as coded.
- UI-side short labels override `BINDING_LABELS`; keep the settings file untouched:

| Action | Label | Action | Label |
|---|---|---|---|
| forward | Forward | interact | Interact |
| back | Back | fire | Fire |
| left | Left | aim | Aim |
| right | Right | melee | Melee |
| jump | Jump | fireMode | Fire mode |
| walk | Walk | zoom | Hold breath |
| freelook | Free look | quickHeal | Quick bandage |
| log | Status | debug | Debug |
| vehicleUp | Climb | vehicleDown | Descend |

  All other actions keep their current label.
- `Reset key bindings` becomes `Reset keys` (in the footer when on this tab).

---

## 12. Pause (`Menus.pause`)

```
  PAUSED                          t-label ink-3
  My World . Day 4                t-body ink-2
                                  (32u gap)
  Resume                  [Esc]   rows 40h as title screen
  Options
  Save                    14:02   last save time, t-body tnum ink-3
  Switch to creative              hidden in hardcore
  Quit to title                   saves first (current behaviour of "Save & quit")
```

- Same column and scrim as the title screen.
- The `PAUSED` wordmark heading is replaced by the t-label.
- `Controls` is cut; its `F1` hint was wrong anyway (F1 hides the HUD).
- After Save, the meta shows the time and a `Saved` menu toast (was `World saved`).
- The hardcore removal must target the row by id, not `col.children[5]`, because rows change.

---

## 13. Death (`Menus.death`)

```
                              Bled out                         t-title 28u/600 (t-num size), ink-1
                                                               (24u)
                         2 d 4 h            14                 t-num
                         SURVIVED          KILLS               t-label ink-3
                                                               (32u)
                         [ Respawn ]    [ Quit ]               primary / secondary, 40h
                         HARDCORE                              t-label alarm, only in hardcore (then only [Quit])
```

- Centred. The scrim is `rgba(6,7,8,.72)` (the red radial is cut; the render module can desaturate the scene).
- The cause is mapped UI-side from `info.cause`:

| `info.cause` | Title |
|---|---|
| blood loss | Bled out |
| dehydration | Dehydration |
| starvation | Starvation |
| hypothermia | Hypothermia |
| heat stroke | Heat stroke |
| drowning | Drowned |
| fall | Fall |
| vehicle | Crash |
| infection | Infection |
| injuries | Injuries |
| bite | Bitten |
| suicide | Suicide |
| other | sentence-cased raw value |

- Survived: `< 1 d` renders `4 h`, otherwise `2 d 4 h`. Kills is `stats.lifeKills`.
- Cut: the `You died` kicker, the `DEAD` heading, the `Cause of death:` prefix, the Travelled and Lives columns, and both footnotes.
- `Respawn on a beach` becomes `Respawn`; `Quit to title` / `Back to title` become `Quit`. Enter respawns (focus is on Respawn).

---

## 14. Loader (index.html + main.js strings)

```
+--------------------------------------------------------------------------------------------------+
|                                   (key art, static, bottom scrim)                                |
|                                                                                                  |
|  D E A D T I D E                                             wordmark 56u                        |
|  Terrain                                               42%   t-body ink-2 / t-body tnum ink-3    |
|  ================--------------------------------            2px bar, accent fill, 480 w         |
+--------------------------------------------------------------------------------------------------+
```

- Keep: `.loader-art`, `.loader-scrim` (bottom gradient only), wordmark, `.loader-status`, `.loader-pct`, `.loader-bar` / `.loader-fill`.
- Cut from index.html: `.loader-kicker`, `.loader-tagline`, `.loader-tips` (8 tips + `Tip` label), `.loader-glint`, the Ken Burns animation, and the fallback sunset gradient (use `--bg-0` with the art only).
- `.loader-time` must **stay in the DOM** because `main.js status()` writes to it. Hide it with `display: none`.
- Fill: `--accent`, no glow. Error state: `.loader-status` turns `--alarm` and wraps; the message renders mono 12 `--ink-2` under it.
- Status strings, 1–3 words: see section 17.

---

## 15. Status screen (was Survival journal, `UI.journal`, key `log`)

- Panel 560, title `Status`, meta t-label `DAY 4`.
- **Conditions**: rows 40 h. Each row is a 16 u state-coloured icon, the name t-body, the value t-body tnum `--ink-2` (`×2`, `35.4°`), and a remedy t-body `--ink-3` right-aligned (1–2 words).

| Condition | Remedy |
|---|---|
| Bleeding | Bandage |
| Broken leg | Splint |
| Infection | Antibiotics |
| Food poisoning | Charcoal |
| Cold | Warm clothes / Fire |
| Overheating | Shade |
| Exhausted | Sleep |
| Hungry | Food |
| Thirsty | Water |

  The section is hidden when nothing is active.
- **Body**: stat table with Health, Blood, Food, Water, Body, Air, Energy, Wet.
- **This life**: stat table with Survived, Kills, Distance, Looted.
- **All lives**: stat table with Lives, Kills.
- The ten advice sentences and the `Where` section are cut.

---

## 16. Confirm dialogs (`UI.confirm`)

| Call site | Title | Body | Verb |
|---|---|---|---|
| Delete world | `Delete “My World”?` | `Can't be undone.` | `Delete` (danger) |
| Reset options | `Reset Graphics?` (tab name) | `Key bindings stay.` | `Reset` |
| Reset keys | `Reset keys?` | — | `Reset` |

---

## 17. Text to cut or shorten (UI-owned files)

`→ ∅` means delete.

### index.html
| String | Change |
|---|---|
| `<title>Deadtide — Hawaiian Islands</title>` | `Deadtide` |
| `A Hawaiian Islands survival game` (`.loader-kicker`) | ∅ |
| `Eight islands, one week after the outbreak. Scavenge the towns, arm yourself, and stay alive from Kauaʻi to the Big Island.` | ∅ |
| `Tip` label + 8 `.loader-tip` sentences | ∅ |
| `0:00` (`.loader-time`) | keep element, hide |
| Font link `Inter:wght@400;500;600;700` | `Inter:opsz,wght@14..32,500..600`, JetBrains Mono `500;600` |

### src/main.js (status strings only)
| String | Change |
|---|---|
| `'Entering the world'` | `'World'` |
| `'Populating the area'` | `'Area'` |
| `'Failed to start: ' + e.message` | `'Failed: ' + e.message` |

### src/ui/UI.js
| String | Change |
|---|---|
| `TIPS[move]`: `Move with WASD, sprint with Shift, crouch C.` | hint group `[W][A][S][D] Move [Shift] Sprint [C] Crouch` |
| `TIPS[inv]`: `Press Tab to check what you washed up with. Drag items onto your clothes to carry more.` | `[Tab] Inventory` |
| `TIPS[loot]`: `Find a town. Look at loot and press F to take it; cupboards…` | ∅ (the prompt teaches this) |
| `TIPS[map]`: `M opens the map. Double-click it to place a marker you'll see on the compass.` | `[M] Map` |
| `TIPS[chat]`: `T opens chat — type /help for commands (/give, /tp, …)` | `[T] Chat` |
| `'Click to continue'` | `'Click to resume'` |
| `Creative mode — ${where}. Double-tap Space to fly.` | location card + hint `[Space]×2 Fly` |
| `You wake up on the shore. ${where}.` | location card |
| `'You need a map (realistic map is on in Options)'` | `'Need a map'` |
| Journal: 10 advice sentences (`You are bleeding. Use a bandage or rags (right-click → Bandage) — blood loss kills.` … `You are holding up. Keep water and a bandage on you at all times.`) | condition rows with 1–2 word remedies (15) |
| `'Survival journal'`, sub `Day N` | `'Status'`, t-label `DAY N` |
| `'Infected killed'`, `'Distance travelled'`, `'Items looted'`, `'Total infected killed'` | `'Kills'`, `'Distance'`, `'Looted'`, `'Kills'` (under All lives) |
| `'Where'` section | ∅ |
| `${isl.name} — near ${near.name}` (long location) | `${near.name} · ${isl.name}` |

### src/ui/HUD.js
| String | Change |
|---|---|
| Compass readout `${deg}°  ·  ${hour}  ·  Day ${day}  ·  ${loc}` | heading tab `${deg}°`; time + location to the minimap footer |
| 15° degree labels on the strip | ∅ |
| Vital `title`s incl. `Body temperature ${t} °C — outside ${e} °C` | ∅ (pointer is locked; values are visible) |
| `▲` / `▼` text arrows | 8 u chevron icon |
| Ring label `${label}…  (move to cancel)` | `${label}` + `2.4 s` |
| Prompt `hold` (lowercase dim) | t-label `HOLD` |
| Weapon sub: calibre / category | ∅ |
| Weapon ammo `31<small> / 30</small>` | `31` + magazine glyph `90` |
| Vehicle `Fuel`, `Condition`, `Gear N`, `ALT N m` | icons + values, gear chip `D3`, t-label `ALT 420 M` |
| Debug line 1 prefix `Deadtide — ` | ∅ |

### src/ui/InventoryUI.js
| String | Change |
|---|---|
| `Double-click: use / equip · Shift-click: move · Right-click: actions · 1–9: hotbar` | contextual footer legend (6.8) |
| `${w} kg carried — overloaded` | `11.2 / 30 kg` + bar (warn/alarm) |
| `${used} / ${cap} space` | `7.5/40` |
| `Sort` button text, title `Sort every container by type and name` | sort icon, title `Sort` |
| `Wear clothes with pockets or a backpack to carry more.` | ∅ |
| `${n} items` (ground) | `${n}` |
| `Drop items here` | ∅ |
| `Character` + `Day N` / `Creative` | `Equipment`, no meta |
| `Weapons` header | ∅ |
| `In hands: X` / `Hands empty` | Hands cell |
| `Body temp`, `Outside`, `Bite protection`, `Infected killed` | `Body`, `Air`, `Bite`, ∅ |
| `Empty` (container) | ∅ |
| `HELD` tag | accent dot |
| Tooltip `${category} · ${rarity}` | `${category} · ${calibre\|slot\|liquid}` |
| Tooltip `d.desc` paragraph | ∅ |
| Tooltip `Double-click: ${verb}` | ∅ |
| `Rate of fire` | `Rate` |
| `Raw`: `cook it first` | flag `Raw` |
| `Sealed`: `needs a can opener or a blade` | flag `Sealed` |
| `Stops bleeding` / `Heals` / `Treats infection` / `Splints fractures: yes` | `Bleeding −n` / `Health +n` / `Infection −n%` / flag `Splint` |
| `Alcohol: yes` | flag `Alcohol` |
| `Hydration` | `Water` |
| `Contents: empty` | `Empty` |
| `${name} doesn't go there` / `${name} doesn't go in that slot` | `Wrong slot` |
| `It can't go inside itself` | `Can't nest` |
| `Not enough room` | `No room` |
| `Only part of it fits` | `Part fits` |
| `No room — dropped it` | `No room · dropped` |
| Menu hints `Shift-click`, `Double-click`, `hover + 1–9` | keycaps `⇧`, `Dbl`, `1–9` |
| `Remove magazine` / `Empty magazine` / `Insert magazine (n)` | `Eject magazine` / `Unload magazine` / `Insert magazine` + `n` |
| `Hold in hands` | `Hold` |
| `Remove from hotbar n` / `Add to hotbar` | `Unbind` + `n` / `Bind` |
| `Split stack` / `Split ${name}` | `Split` |
| `Crafting is not available.` / `No recipes.` | ∅ |
| Recipe need text `${q}× ${name}`, ` · ${tool}`, ` · at a ${station}` | chips `Name have/need`, `Tool`, `Fire` |
| `Search items…` | `Search` |
| `${n} items · click to take one, Shift-click for a full stack, or drag` | count in search field |
| `Nothing matches.` | ∅ |

### src/ui/Menus.js
| String | Change |
|---|---|
| Title kicker `A Hawaiian Islands survival game` | ∅ |
| `Continue` hint `Last world` | world name · `Day N` |
| `Singleplayer` / hint `Worlds` | `Worlds` |
| `Controls` row (title and pause) | ∅ |
| `Credits` | `About` |
| Title footer `Terrain: AWS Terrain Tiles … · Built with three.js · Deadtide v0.1` | `v0.1` |
| `Imported “${name}”` | `Imported` |
| `That hardcore world is over — its survivor died.` | `World ended` |
| `This world will be gone forever (export it first to keep a copy).` | `Can't be undone.` |
| `No worlds yet.<br>Create one to wash up on a beach somewhere in Hawaiʻi.` | `No worlds` |
| Worlds sub `Worlds are saved in this browser. Export them to keep a backup or move them to another computer.` | ∅ |
| `played ${time}` meta, `seed ${seed}` | `3h 20m`; seed → Details |
| `Play selected world` / `Import world…` / `Create new world` / `Edit` | `Play` / import icon `Import` / `New world` / edit icon |
| Badge `hardcore · dead` | `HARDCORE` `DEAD` |
| New world sub `Eight islands, the infected, and whatever you can find.` | ∅ |
| Seed placeholder `Leave blank for a random seed` | `Random` |
| Row hints: `Loot, the infected and events come from the seed` · `Creative: fly, no hunger or damage, every item in the catalog` · `How fast you get hungry and how hard the infected hit` · `No cheats; the world ends when you die` · `Real minutes per game day` | ∅ |
| `On — one life` | toggle |
| `24 min` `48 min` `96 min` `2 h 24` | `24` `48` `96` `144` + `MIN` |
| `Start at`: `Morning` `Noon` `Evening` `Night` | `Start time`: `07:30` `12:00` `17:30` `21:00` |
| `Wash up on`, `Any island (random beach)`, `Hawaiʻi (Big Island)` | `Spawn`, `Random`, `Hawaiʻi` |
| `Create new world` (title) / `Create world` (button) | `New world` / `Create` |
| `Edit world` / `Survivor stats` sentence row | `World` / stat table |
| Credits prose + `Mahalo for playing. Stay off the beaches after dark.` | About table |
| Options sub `Saved automatically.` | ∅ |
| `Reset to defaults`; confirm `Reset all options?` / `Key bindings are kept.` | `Reset tab`; `Reset Graphics?` / `Key bindings stay.` |
| Tabs `Display`, `Key bindings` | merged into `Graphics` + `Interface`; `Keys` |
| `Resolution scale`, `Terrain detail`, `Mouse sensitivity`, `Invert mouse Y` | `Resolution`, `Terrain`, `Sensitivity`, `Invert Y` |
| `Toggle crouch` / `Toggle aim` / `Toggle sprint` | `Crouch` / `Aim` / `Sprint` with Hold/Toggle |
| `Show FPS` | `FPS` |
| `Interaction hints` / `Tutorial tips` | `Interaction prompts` / `Key hints` |
| `Pick up ammo automatically` | `Auto-pickup ammo` |
| `Realistic map & compass (need the items)` | `Map and compass`: `Always`/`Need item` |
| Keybind `Press a key…`; title `Click, then press a key. Esc cancels, Backspace clears.` | caret; footer keycaps |
| Conflict title `Also bound to: …` | `Also: …` |
| `Reset key bindings` | `Reset keys` |
| Pause kicker `Day N · name` + `PAUSED` h1 | t-label `PAUSED` + `name · Day N` |
| Pause `Resume` hint `Esc` | keycap |
| `Save world` / toast `World saved` | `Save` / `Saved` |
| `Save & quit to title` | `Quit to title` |
| Mode hint `Game mode` | ∅ |
| Death `You died`, `DEAD`, `Cause of death: ${cause}` | mapped cause title |
| Death `Infected killed` / `Travelled` / `Lives` | `Kills` / ∅ / ∅ |
| `Respawn on a beach` / `Back to title` / `Quit to title` | `Respawn` / `Quit` / `Quit` |
| `Hardcore: this world is over.` | t-label `HARDCORE` |
| `Your body — and everything you carried — stays where you fell. It is marked on your map.` | ∅ |
| `controls()` screen: 33 labelled rows, 4 paragraphs (`Looting.` / `Staying alive.` / `The infected` / `Commands.`), sub `Rebind keys in Options → Key bindings.` | whole screen ∅ (Options › Keys) |

### src/ui/MapUI.js
| String | Change |
|---|---|
| `Drag to pan · wheel to zoom · double-click to mark · C to centre · Shift-click to teleport` | ∅ (Shift shows a `TELEPORT` cursor chip) |
| Legend `Freeway` `Highway / street` `Dirt road` `Building` `Marker` `Your body` | Layers popover toggles: `Roads` `Buildings` `Grid` `Markers` `Vehicles` |
| Buttons `+` `−` `Me` `Islands` `Close` | icon buttons with titles `Zoom in` `Zoom out` `Centre` `Islands` `Close` |
| Coords `${x}, ${z}  ·  elev N m (real)  ·  ${d} away` / `depth N m` | `x, z · N m · d` / `−N m` |
| Marker label `Marker ${n}` | `${n}` |
| Scale label `${d} (game)` | `${d}` |

### src/ui/Chat.js
| String | Change |
|---|---|
| Placeholder `Say something or type /help` | ∅ |
| `Welcome to Deadtide. Press T to chat, type /help for commands.` | ∅ |

### src/ui/itemIcons.js / dom.js
| Item | Change |
|---|---|
| Glyph stroke `#cfe6ee` | `#B6BAC1` |
| `ICON` set | replaced by section 3 |

---

## 18. Text owned by other modules (for the lead; not edited by UI)

| File | String | Suggest |
|---|---|---|
| src/game/World.js | `'Loading the islands'` | `'Terrain'` |
| src/game/World.js | `'Starting world workers'` | `'Workers'` |
| src/game/World.js | `'Loading materials'` | `'Materials'` |
| src/game/World.js | `'Building terrain'` | `'Terrain mesh'` |
| src/core/Settings.js | `showFps: true` (default) | `false` |
| src/core/Settings.js | `BINDING_LABELS` long forms (`Interact / pick up`, `Fire / attack`, `Aim down sights`, `Quick melee / shove`, `Jump / vault`, `Walk (hold)`, `Free look (hold)`, `Hold breath / zoom`, `Climb (air / boat)`, `Descend (air)`, `Survival journal`, `Debug overlay`, `Move forward`, `Strafe left`…) | UI overrides (11.3); optionally shorten at source |
| src/weapons/Hands.js:381 | `'Jammed — press R to clear it'` | `'Jammed'` (HUD shows `[R] Clear`) |
| src/weapons/Hands.js:528 | `` `${def.name}: ${mode}` `` | drop the toast (the weapon panel wakes and shows the mode) |
| src/weapons/Hands.js:597 / :1266 | `'No room: dropped the empty magazine'` / `'No room: dropped the magazine'` | `'Magazine dropped'` |
| src/weapons/Hands.js:1220 | `'No room: some rounds dropped'` | `'Rounds dropped'` |
| src/weapons/Hands.js:874 | `'No lighter — the rag is not lit'` | `'No lighter'` |
| src/weapons/Hands.js:1192 | `` `${ammo} don't fit …` `` | `'Wrong calibre'` |
| src/weapons/Hands.js:1230 | `` `${mag} doesn't fit …` `` | `'Wrong magazine'` |
| src/weapons/Hands.js:1291 | `` `The ${def.name} takes magazines` `` | `'Needs a magazine'` |
| src/weapons/Hands.js:1292 | `` `Wrong ammunition for the ${def.name}` `` | `'Wrong ammo'` |
| src/weapons/Hands.js:1322 | `` `${att} attached to the ${gun}` `` | `'Attached'` |
| src/weapons/Hands.js (_toggleLight) | `'The batteries are dead'` | `'Battery dead'` |
| src/game/Water.js:22 | sub `'Boil or distil it before drinking'` | `'Unsafe'` |
| src/game/Water.js:23 | label `'Drink seawater'`, sub `'Salty — it will make you thirstier'` | `'Drink seawater'`, `'Salty'` |
| src/game/Water.js:29 | `'Drink the rain'`, sub `'Slow, but clean'` | `'Drink rain'`, `'Clean'` |
| src/game/Water.js:43 | `'A few mouthfuls of rainwater'` | `'Drank rain'` |
| src/game/items/ItemUse.js:770 | `` `Weather: ${state}. Change in ~${h} h` `` | `` `${State} · ${h} h` `` |
| src/game (sleep) | `"You can't sleep with the infected nearby"` | `'Infected nearby'` |
| src/game/Commands.js:151 | `'Flying needs creative mode (/gamemode creative)'` | `'Creative only'` |
| src/game/Commands.js:152 | `'Needs creative mode'` | `'Creative only'` |
| src/game/Bodies.js:56 | `'Search your body'` | `'Search body'` |

---

## 19. Implementation map

| File | Work |
|---|---|
| `ui.css` | Replace the token block (2.8). Rewrite components against tokens. Remove `backdrop-filter` from `.tw-glass` for HUD use (add a `.plate` class), and keep blur only on `.panel`. Delete loader tip/glint/Ken Burns rules, rarity and `.weight-bar` gradients, `.status.good` green, and the aqua/sun/coral/green variables (keep `--tw-*` aliases pointing at new tokens until every reference is gone). |
| `dom.js` | New `ICON` set (section 3), `icon()` unchanged. Add `fmtDur(hours)` → `4 h` / `2 d 4 h`. |
| `HUD.js` | See the per-function notes below this table. |
| `UI.js` | `TIPS` → `HINTS` (5.13) rendered as keycap groups. Location card (tracks `locationName(pos, true)` changes, debounce 2 s). `announceSpawn` → card + creative hint. Lock hint text. `journal()` → Status (15). `confirm()` → pop spec with Enter/Esc. |
| `InventoryUI.js` | 3-column fixed layout (6.1). `_slot` / `_item` per 6.5 (bar rule, dot, no rarity). Pre-computed valid targets on drag start (`_accepts(stack, loc)` sharing the checks in `move()` / `_dropOnItem()`). Drop label chip. Hands cell. Drop on scrim → ground. Tooltip 250 ms delay + rows (6.6). Menu labels, keycaps and measured positioning. Footer legend. Split popover. Crafting chips. Catalog count. Keyboard focus. |
| `Menus.js` | `panel()` gets an optional `rail` (options). `title()` rows + keyboard nav. `about()` replaces `credits()`. `worlds()` rows with inline actions. `createWorld()` rows (10.2) with a custom select. `editWorld()`. Options rail + tabs (11.2), per-tab reset. `_keybinds` search, reset per row, listening caret, footer keycaps, label override map. `pause()`, `death()` with cause map; delete `controls()` and the F1 hint. |
| `MapUI.js` | Chrome (7.1), layers state (`this.layers = { roads, buildings, grid, markers, vehicles }` passed to `MapView.draw(opts)`), marker context menu + rename (`m.label = …`, markers are plain objects), keyboard pan and zoom, DOM scale bar, readout format. |
| `MapView.js` / `maptile.js` | Palette (7.2). Honour `opts.layers`. Label fonts × u. |
| `Chat.js` | Placeholder, welcome line, closed/open styling, ghost completion. |
| `itemIcons.js` | Glyph stroke colour. |
| `index.html` | Loader markup (14) and font link. |
| `main.js` | Status strings only. |

**HUD.js**, function by function:
- `_buildCompass`: labels only at 45°. Add the heading tab and marker distance.
- Vitals: DOM per 5.5 with Auto visibility.
- `_weapon`: layout per 5.7.
- `_hotbar`: placeholders and drop targets.
- `_vehicle`: build once, update values.
- `toast()` dedupe; `pickup()` merge.
- Prompt: keycap plus hold bar.
- Ring: remaining seconds.
- Stamina: bar per 5.8.
- Hitmarker and damage arc.
- Minimap canvas sized by u.
- A small visibility helper: `this._seen[key] = t` on change, and each element's `hidden`/opacity derives from `t - seen < 3`.

**Integration points kept verbatim**:
- `game.hands` (`aiming`, `ammoInfo()` incl. `mode === 'jammed'`, `crosshairSpread()`, `held`, `select`, `holster`, magazine/attach ops).
- `game.vehicles.hud()` fields, and `known()`.
- `game.items3d.near/remove`, `game.dropStack`, `game.itemUse.actions/use`, `game.crafting.recipes/canCraft/craft`, `game.nearFire`.
- `game.markers.list/add/remove`, `game.creatures.stats()`.
- Events `toast`, `hitmarker`, `item:pick`, `item:drop`, `chat`, `container:changed`, `container:close`.
- Settings keys as listed, plus one new key: `hudMode`, read as `S.get('hudMode') ?? 'auto'` and written with `S.set`.
- Input actions: `input.label()`, `input.codes()`, `prettyCode`.
- `--gui` is still set by main.js and multiplies `--u`.

**Performance**:
- No backdrop blur on any HUD element.
- The HUD writes to the DOM only when a formatted string changes (cache per field).
- Vitals update at 10 Hz and the compass transform every frame.
- Vehicle and weapon panels are built once.
- Minimap canvas at 184 u × DPR (≤ 2), redrawn every 2nd frame (current).

**Accessibility**:
- `:focus-visible` ring on every control; menus, lists and cells are keyboard navigable.
- `prefers-reduced-motion` honoured.
- GUI scale 70–160%.
- Status never relies on hue alone.
- Minimum text on the HUD is 11 u at ≥ 5.9:1 worst case.

---

## 20. References and what was taken

| Source | Taken |
|---|---|
| Apple HIG, Materials (developer.apple.com/design/human-interface-guidelines/materials) | Material thickness scale (ultra-thin → thick) and the rule that thicker materials carry text: `--m-hud` 78% for HUD text, blur reserved for full screens. Vibrancy-style ink levels (primary/secondary/tertiary). |
| SF Pro optical sizes and tracking (Apple Fonts; blakecrosley.com/blog/sf-pro-typography-system) | Text/Display optical split at ~20 pt, size-specific tracking, `monospacedDigit` → Inter `opsz` 14–32 via Google Fonts, dynamic-metrics tracking, `tnum` on every number. |
| Inter (rsms.me/inter) | `tnum`, `case` for caps labels, `opsz` axis (Inter Display at 28 u). |
| Linear UI redesign (linear.app/now/how-we-redesigned-the-linear-ui) | A theme from three inputs (base, accent, contrast), neutral chrome with blue removed from greys, obsessive label/icon alignment, one accent, 500-ish body weight. |
| Vercel Geist (vercel.com/geist/colors, /materials, /typography) | 10-step roles: 1–3 backgrounds, 4–6 borders, 7–8 strong fills, 9–10 text → `--fill-1…4`, `--line-1…3`, `--ink-1…4`. Material presets by elevation (base 6, menu/modal 12, fullscreen 16 radius) → `--r-sm/md/lg`. Label vs copy line-heights. |
| Nothing OS design language (github.com/dominikmartn/nothing-design-skill; nothing.tech) | Grey scale *is* the hierarchy (100/90/60/40), red only as an interrupt, max 3 sizes + 2 weights per screen, one "break" per screen (the hero number), spacing ladder 4–8/16/32–48, outline-only icons, no gradients on chrome. |
| Teenage Engineering (blakecrosley.com/guides/design/teenage-engineering; teenage.engineering) | Spec-sheet tables with 1 px gaps (the inventory stat table), labels above values in reduced ink, tabular figures, one industrial orange as the only hue. |
| The Division / Division 2 (interfaceingame.com/games/tom-clancys-the-division-2; sarcasticjuice UI review) | Orange = what matters, white = everything else, red = danger. Waypoint distance on the compass. Ammo as clip + reserve. A unified grid across all menus. |
| Horizon Forbidden West HUD settings (vulkk.com guide; GamesRadar) | "Dynamic" HUD that shows on relevance and hides after seconds, with an "Always" option → `hudMode` Auto/Always. |
| The Last of Us Part II / Ghost of Tsushima (andyscabingames.wordpress.com) | Minimal HUD that disappears outside action; feedback through the world rather than bars. |
| Control (carlwaldron.com/the-typographic-simplicity-of-control; fontsinuse.com) | Area-name title card that fades → the location card. Strict utilitarian type. |
| DayZ (dayz.wiki.gg/wiki/User_Interface) | Vicinity (left) / character (centre) / carried (right) layout, a hands slot, status icons with trend arrows, a weapon info box that fades. |
| Escape from Tarkov UX redesign (heiolenmarkus.com) | Contextual button labels instead of Yes/No (`Delete` not `OK`), shortcuts in tooltips and menus, capacity visible before opening. |
| Forza Horizon 5 world map (missjenart.com/uiart/forzahorizon5-map) | Iconography rules for map pins: one container shape per class, states by fill/outline (filled vs hollow diamond for user vs locate). |
| Mirror's Edge Catalyst (artstation Mikael Nellfors) | Clean, colour-restricted UI where a single hue does the guiding. |
| Game UI Database / Interface In Game (gameuidatabase.com, interfaceingame.com) | Category breakdowns (HUD, inventory, map, settings, loading) used to check coverage of every screen. |
