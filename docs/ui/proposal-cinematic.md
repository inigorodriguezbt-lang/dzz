# Deadtide UI: cinematic minimalism

Proposal for a full UI redesign. It maps onto every feature that exists today in `src/ui/*`, `index.html` and the loader strings in `src/main.js`, and keeps every integration point listed in the brief.

Current state (screenshots `s5/01-08`): every HUD element sits on its own frosted-glass card (`.tw-glass`, `backdrop-filter: blur(18px)`). There are six boxed vital tiles bottom-left, a boxed compass with a sentence-long readout under it, a boxed weapon card, a glass minimap with a place label, a glass map title card holding a how-to sentence, a boxed legend, and an inventory header that explains the controls. There are 21 separate glass surfaces, at least nine sentences of instructions, and the aqua accent is lost wherever the sea is in view. The redesign drops almost all of it: the HUD becomes ink on the world, menus become type on a darkened world, and panels stay only where data is dense.

---

## 1. Principles

1. **The world is the screen.** When nothing is happening, the HUD shows a 3 px crosshair dot, a hairline compass and the minimap. Every other element appears when its value changes or becomes relevant, then fades after 3 s. The pattern comes from the RDR2 dynamic HUD, Horizon's *Dynamic* HUD visibility and TLOU2's out-of-combat HUD.
2. **Shape before words.** Rings, segments, icons and numbers carry state. Words are used only for proper nouns (items, places, worlds) and verbs next to a key cap. Icons follow Ghost of Tsushima's kamon rule: frontal, symmetrical, bold, and readable at 16 px.
3. **One anchor per job.** The bottom-left belongs to the body and place (minimap, cores, conditions). The bottom-right belongs to the hands (weapon, ammo, vehicle). The top centre holds heading, the centre holds intent (crosshair, prompt, progress), the right edge shows gains (pickups) and the top-left shows messages. Nothing appears anywhere else.
4. **Legible on sun and night without boxes.** HUD text is bone-white ink with a dark halo, placed over the ground (the darkest, most even part of a tropical frame) rather than the sky. Where a cluster needs more support it gets a soft radial scrim, never a card. A *HUD backing* option (Off / Light / Dark, after TLOU2's HUD Background setting) covers extreme cases.
5. **Menus are typography on a dimmed world.** Title, pause and death screens are left-aligned or centred type set over the live world (blurred, darkened and desaturated), with no cards. Panels appear only for inventory, options and dialogs. Selection is monochrome: a white bar plus white text. Colour means state, never decoration.

---

## 2. Tokens

### 2.1 Unit and GUI scale

All sizes below are **px at 1080p with GUI scale 1**. They are implemented as `calc(N * var(--u))`, where

```css
--u: calc(clamp(0.9px, calc(100vmin / 1080), 1.6px) * var(--gui));
```

At 1080p, 1u is exactly 1 px, which makes the spec easy to check. `--gui` (set by `main.js` from `guiScale`) still multiplies everything. Canvas-drawn elements (the minimap and map labels) read `getComputedStyle(root).getPropertyValue('--u')` once per resize and scale their fonts and strokes by it.

### 2.2 Colour

| Token | Value | Use |
|---|---|---|
| `--dt-ink` | `#F5F3EE` | Primary text, glyphs, selected items, filled meter arcs |
| `--dt-ink-2` | `rgba(245,243,238,0.74)` | Secondary text, unselected menu items |
| `--dt-ink-3` | `rgba(245,243,238,0.50)` | Meta text, units, reserve ammo, key hints |
| `--dt-ink-4` | `rgba(245,243,238,0.28)` | Empty-slot glyphs, disabled |
| `--dt-ink-5` | `rgba(245,243,238,0.14)` | Meter tracks, cell fills on hover |
| `--dt-line` | `rgba(245,243,238,0.10)` | Hairlines, cell borders |
| `--dt-line-2` | `rgba(245,243,238,0.22)` | Input borders, focused hairlines |
| `--dt-void` | `#07090B` | Scrim base; text on filled (primary) buttons |
| `--dt-surface` | `rgba(13,16,19,0.92)` | Options and dialog panels |
| `--dt-surface-2` | `#14181C` | Tooltips, context menus, inputs, drag ghost plate |
| `--dt-surface-3` | `#1C2126` | Hover rows in surfaces |
| `--dt-scrim-menu` | `rgba(7,9,11,0.62)` + backdrop `blur(20px) brightness(.6) saturate(.7)` | Behind every in-game menu |
| `--dt-scrim-hud` | `radial-gradient(closest-side, rgba(4,6,8,.38), transparent)` | Soft backing behind HUD clusters |
| `--dt-marker` | `#FFD84D` | World guidance only: user markers, compass needle, north, hold and progress fills |
| `--dt-warn` | `#FF8A3D` | Low (vital below the low threshold, ammo at 25% or less, capacity near full) |
| `--dt-danger` | `#FF4A4A` | Critical, bleeding, damage, destructive actions, empty magazine |
| `--dt-good` | `#6FD08C` | Gains, healing, craftable, fresh |
| `--dt-cold` | `#7CC6FF` | Temperature below 36 °C |
| `--dt-heat` | `#FF8A3D` | Temperature above 38 °C (shares the warn hue on purpose) |

The marker yellow is chosen because it does not occur in the scene: sky, sea, foliage and sand are blue, cyan, green and beige. The current aqua accent `#5fe3d4` is removed because it matches the shallow-water colour on the minimap and the sea itself (screenshots 01 and 07).

Rarity is shown only as a 2 px top edge on item cells, and only from rare upward: uncommon `#6FD08C` at 60%, rare `#5AA9FF`, epic `#B98CFF`, legendary `#FFD84D`. Common items get no edge.

Condition (replaces `condColor`): above 0.85 `--dt-good`, above 0.6 `#C6D86A`, above 0.35 `--dt-warn`, above 0.1 `#FF6A45`, otherwise `--dt-danger`.

### 2.3 Type

The UI uses Inter only, with the variable weights 300 to 700 that are already loaded. Add weight 300 to the Google Fonts URL (`wght@300;400;500;600;700`). Every number uses `font-variant-numeric: tabular-nums`. JetBrains Mono is kept only for the chat input, command suggestions, the seed and the F3 debug overlay.

| Token | px | Weight | Tracking | Line height | Case | Use |
|---|---|---|---|---|---|---|
| `--fs-hero` | 72 | 600 | 0.32em | 1.0 | UPPER | DEADTIDE wordmark (title, loader), DEAD |
| `--fs-display` | 34 | 300 | -0.01em | 1.1 | Sentence | Screen titles (Worlds, Options), death cause |
| `--fs-num-xl` | 36 | 600 | -0.02em | 1.0 | Numerals | Magazine count, vehicle speed |
| `--fs-menu` | 24 | 500 | 0 | 1.25 | Sentence | Title and pause menu items |
| `--fs-place` | 22 | 500 | 0.01em | 1.2 | Sentence | Place card, map header |
| `--fs-lg` | 15 | 600 | 0 | 1.3 | Sentence | Tooltip item name, world name, dialog title |
| `--fs-md` | 13 | 500 | 0 | 1.4 | Sentence | Labels, rows, buttons, prompt verbs, toasts |
| `--fs-sm` | 12 | 500 | 0 | 1.35 | Sentence | Values, secondary meta, chat lines |
| `--fs-xs` | 11 | 500 | 0.01em | 1.3 | Sentence | Smallest HUD text: quantities, reserve, heading, distances |
| `--fs-cap` | 10 | 700 | 0.16em | 1.2 | UPPER | Section caps, container names, badges, stat captions |
| `--fs-key` | 11 | 600 | 0.02em | 1.0 | As printed | Key caps |

No HUD text is smaller than 11 px. `--fs-cap` appears only in menus and inventory, never over the 3D view.

### 2.4 Spacing, radii, strokes

- **Grid:** 4 px. Steps `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48, `--sp-8` 64.
- **HUD safe edge:** `--edge` 32. **Menu gutter:** 96 left and right (`clamp(24px, 5vw, 96px)`).
- **Radii:** `--r-1` 2 (bars, meter caps), `--r-2` 4 (cells, key caps, inputs, buttons), `--r-3` 8 (tooltips, context menus, dialogs, panels), `--r-round` 999 (cores, badges, minimap).
- **Strokes:**
  - Hairline: 1 px.
  - Core ring: 3 px.
  - Thin arcs (progress, stamina, breath): 2 px.
  - Icons: 1.75 px on a 24 grid.
  - Focus outline: 2 px ink at offset 2 px.
  - Drop-target outline: 1.5 px.

### 2.5 Shadow, halo, blur

```css
--halo-text: 0 0 1px rgba(0,0,0,.85), 0 1px 2px rgba(0,0,0,.55), 0 0 10px rgba(0,0,0,.35);
--halo-svg:  drop-shadow(0 0 .5px rgba(0,0,0,.9)) drop-shadow(0 1px 2px rgba(0,0,0,.5));
--shadow-pop: 0 16px 48px -12px rgba(0,0,0,.7), 0 0 0 1px var(--dt-line);
```

- **HUD:** no `backdrop-filter` anywhere. Removing the 21 blurred glass surfaces is also a real GPU saving on the SwiftShader/low tier, where the screenshots run at 17-28 fps.
- **Menus:** a single backdrop blur on the scrim layer only, never per panel.
- **HUD backing option:**
  - *Off* uses the halo only.
  - *Light* (default) adds `--dt-scrim-hud` behind clusters.
  - *Dark* doubles the scrim alpha to 0.7 and adds a 6% dark full-screen vignette.
- **Night dimming:** between 19:30 and 05:30 game time (`game.hour`), HUD opacity drops to 0.88 so white ink does not glare against a black frame.

### 2.6 Motion

| Token | Value | Use |
|---|---|---|
| `--t-fast` | 120 ms | Hover, press, tab underline |
| `--t-base` | 200 ms | HUD element appear, tooltip, context menu |
| `--t-slow` | 360 ms | Screen in and out, panel slide |
| `--t-fade` | 600 ms | HUD element fade-out |
| `--linger` | 3000 ms | Dynamic HUD hold after the last change |
| Toast | 3500 ms (bad: 5000) | Message life |
| Pickup | 2500 ms | Pickup row life |
| Place card | 400 in / 3500 hold / 800 out | Area name |
| Hit marker | 0 in / 180 out (kill 350) | |
| Damage wedge | 800 ms fade | |
| Loss trail | 600 ms | Lost part of a core ring fades from danger to transparent |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Appear |
| `--ease-in` | `cubic-bezier(.7,0,.84,0)` | Disappear |
| `--ease-io` | `cubic-bezier(.65,0,.35,1)` | Screen transitions |

Movement is small: at most 8 px of slide for appearing elements and 12 px for screens. With `prefers-reduced-motion`, slides are removed, fades last 120 ms and pulses stop (the colour change remains).

---

## 3. Iconography

- **Style:** 24×24 grid, 2 px padding (20 px live area), `fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`. Glyphs are frontal, symmetrical where the object allows, and have no perspective. Critical and condition states use the *filled* variant: the same path with `fill="currentColor"` and the stroke removed.
- **Sizes:** 14 (inside cores and badges), 16 (inline with text), 20 (buttons, prompts), 24 (menu and tab icons).
- **HUD item art:** the 3D item thumbnails from `render/Icons.js` stay full-colour in the inventory. In the HUD (weapon, hotbar, pickups) they are rendered as white silhouettes with `filter: brightness(0) invert(.96) var(--halo-svg)`. This gives kamon-like readability from the existing art at no cost.
- All glyphs live in `dom.js ICON` (extend it). `itemIcons.js GLYPH` fallbacks adopt the same stroke and grid.

### 3.1 Status (cores)

| Name | Path `d` |
|---|---|
| `health` | `M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z` |
| `blood` | `M12 3.5c3.3 4.1 5.5 7.3 5.5 10.3a5.5 5.5 0 0 1-11 0c0-3 2.2-6.2 5.5-10.3z` |
| `food` | `M6.5 3v5a2.5 2.5 0 0 0 5 0V3M9 3v18M17.5 21V3c-2 1.4-3 3.8-3 7v3h3` |
| `water` | `M6 4h12l-1.7 15.2a2 2 0 0 1-2 1.8H9.7a2 2 0 0 1-2-1.8zM6.9 11.5c1.7-.9 3.4-.9 5.1 0s3.4.9 5.1 0` (a glass with a wave line) |
| `temp` | `M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 11v6` |
| `energy` | `M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z` |
| `stamina` | `M13 3 5 13.5h6L10 21l8-10.5h-6z` (used only in Options and tooltips; the HUD arc has no icon) |
| `breath` | Circles `(6,15.5,r3)`, `(15,9,r4)`, `(17,18.5,r2)` |

### 3.2 Conditions (badges)

Each badge is a 20 px circle filled with the kind colour at 22% and a 1 px ring in the kind colour. The glyph is 14 px in ink, and an optional count sits to the right in `--fs-xs`.

| Condition id | Glyph |
|---|---|
| `bleed` | `blood`, filled |
| `frac` | Bone at 45°: `M8.3 5.6a2 2 0 1 0-2.7 2.7 2 2 0 1 0 2.7-2.7zM15.7 18.4a2 2 0 1 0 2.7-2.7 2 2 0 1 0-2.7 2.7zM8.3 5.6l2.9 2.9M15.7 18.4l-2.9-2.9M11.2 8.5l1.8 2.3-2 .4 1.8 2.3` (the shaft breaks in a zigzag). *Splinted* adds `M6 12h12` across the bone and uses the warn kind. |
| `inf` | Virus: circle `(12,12,r4.5)` and spikes `M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1` |
| `sick` | Spiral: `M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6` |
| `cold` | Snowflake: `M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.6 12 6l2.5-1.4M9.5 19.4 12 18l2.5 1.4` |
| `hot` | Sun: circle `(12,12,r4)` and `M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8` |
| `wet` | Rain: `M8 4 6 9M13 4l-2 5M18 4l-2 5M8 14l-2 5M13 14l-2 5M18 14l-2 5` |
| `blood` (low blood) | `blood` outline plus `M9.5 14h5` |
| `drunk` | Bottle tilted 20°: `M10 3h4M10.5 3v4.5L8 11v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-9l-2.5-3.5V3`, rotated with `transform="rotate(20 12 12)"` |
| `caf` | Cup with steam: `M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11.5h1.5a2.5 2.5 0 0 1 0 5H16M9 3.5c-.8 1 .8 2 0 3M13 3.5c-.8 1 .8 2 0 3` |
| `pk` | Capsule: `M7.1 16.9a4 4 0 0 1 0-5.7l4.2-4.2a4 4 0 0 1 5.7 5.7l-4.2 4.2a4 4 0 0 1-5.7 0zM9.2 9.2l5.6 5.6` |
| `tired` | "zz": `M5 7h5l-5 6h5M13 11h6l-6 7h6` |
| `heavy` | Weight: `M9 7a3 3 0 1 1 6 0M6.5 9h11L19 20H5z` |

### 3.3 Equipment slot glyphs

Shown in `--dt-ink-4` inside empty slots. They replace the text labels HEAD, EYEWEAR and so on.

| Slot | Glyph |
|---|---|
| `head` | Helmet: `M4 16a8 8 0 0 1 16 0M3 16h18M12 8v2` |
| `eyes` | Glasses: circles `(7.5,13,r3.5)`, `(16.5,13,r3.5)` and `M11 13h2M4 13 2.5 10M20 13l1.5-3` |
| `face` | Bandana mask: `M4 9h16v3a8 6 0 0 1-16 0zM8 12.5h8` |
| `torso` | T-shirt: `M7 4l5 2 5-2 4 4-3 3v9H6v-9L3 8z` |
| `vest` | Plate carrier: `M8 4v3L5 9v11h5v-5h4v5h5V9l-3-2V4M8 4h8` |
| `back` | Backpack: `M7 8a5 5 0 0 1 10 0v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM9 14h6v3H9zM10 5V3.5h4V5` |
| `hands` | Glove: `M7 21v-7l-2.2-3a1.3 1.3 0 0 1 2.1-1.5L8 11V5.2a1.2 1.2 0 0 1 2.4 0V10V4.2a1.2 1.2 0 0 1 2.4 0V10V5.2a1.2 1.2 0 0 1 2.4 0V11V7.5a1.2 1.2 0 0 1 2.4 0V15l-1.6 6z` |
| `legs` | Trousers: `M6 3h12l1 18h-5l-2-11-2 11H5z` |
| `feet` | Boot: `M6 4h5v7l7 3a2 2 0 0 1 2 2v3H4V5a1 1 0 0 1 1-1zM4 17h16` |
| `belt` | `M3 10h18v4H3zM10 9h4v6h-4z` |
| `primary`, `secondary` | Rifle profile: `M2 11h13l2-1.5h5V13h-4l-1 2h-3l-1.5 4H9l1-4H2z` |
| `sidearm` | Pistol: `M4 8h14v3.5h-6l-1 1.5H9l-1.2 5H4.5L6 11.5H4z` |
| `melee` | Machete: `M5 17 16 6c1.5-1.5 3-2 3.5-4.5C17 2 15.5 3.5 14 5L4 15.5zM4 20l2.5-2.5` |

### 3.4 Actions and UI

| Name | Path `d` |
|---|---|
| `close` | `M6 6l12 12M18 6 6 18` |
| `back` | `M15 5l-7 7 7 7` |
| `search` | Circle `(11,11,r6.5)` and `M20 20l-4.3-4.3` |
| `sort` | `M4 7h10M4 12h7M4 17h4M18 5v14M15 16l3 3 3-3` |
| `takeAll` | `M12 4v10M8 10l4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3` |
| `craft` | Existing wrench path |
| `catalog` | `M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z` |
| `nearby` | Open hand: `M7 12V7a1.5 1.5 0 0 1 3 0v4V5a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.5L2.8 13a1.5 1.5 0 0 1 2.4-1.8z` |
| `plus` / `minus` | `M12 5v14M5 12h14` / `M5 12h14` |
| `locate` | Circle `(12,12,r7)`, `M12 2v3M12 19v3M2 12h3M19 12h3` and a filled circle `(12,12,r1.6)` |
| `fit` | `M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5` |
| `pin` | `M12 21s6-5.3 6-10.5a6 6 0 0 0-12 0C6 15.7 12 21 12 21z` and circle `(12,10.5,r2)` |
| `legend` | Circle `(12,12,r9)` and `M12 11v6M12 7.5v.01` |
| `rename` | `M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4` |
| `duplicate` | `M8 8h12v12H8zM4 16V4h12` |
| `export` | `M12 15V3M8 7l4-4 4 4M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5` |
| `import` | `M12 3v12M8 11l4 4 4-4M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5` |
| `delete` | `M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13` |
| `settings` | Existing gear path |
| `about` | Same as `legend` |
| `fuel` | `M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M4 21h11M7 8h5M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3` |
| `repair` | `craft` |
| `altitude` | `M3 19l6-9 4 5 3-3 5 7z` |
| `jam` | Triangle `M12 3.5 21.5 20h-19z` plus `M12 10v4.5M12 17v.01` |
| `skull` | Existing path, redrawn symmetrical at 1.75 px |
| `car` | `M5 16v-4l2-5h10l2 5v4zM5 16v2h2v-2M17 16v2h2v-2M7.5 13h.01M16.5 13h.01` |
| `mouseL` / `mouseR` | Body `M7 9a5 5 0 0 1 10 0v6a5 5 0 0 1-10 0zM12 4v5`; the left or right half of the top `M7 9h5V4a5 5 0 0 0-5 5z` is filled |
| `wheel` | Mouse body plus `M12 6.5v3` stroked at 2.5 |

### 3.5 Map markers (canvas)

- **User marker:** filled diamond `M12 3l7 9-7 9-7-9z` in `--dt-marker` with a 2 px `#000` at 60% outline.
- **Death:** filled `skull` in `--dt-danger`.
- **Locate:** marker-yellow ring r6 at 2 px with a filled r2 centre.
- **Known vehicle:** `car` glyph in ink-2.
- **Player:** white arrow `M12 3l7 17-7-4-7 4z` with a dark outline and a 60° view cone `rgba(245,243,238,.10)`, radius 36 px.

### 3.6 Key caps

- **Size and shape:** 20 px high, minimum width 20 px, padding 0 6, radius 4, 1 px `--dt-line-2` border, fill `rgba(245,243,238,.08)`.
- **Text:** `--fs-key` Inter 600 ink. Labels come from `input.label( action )` and `prettyCode`.
- **Glyph substitutes:** Shift `⇧`, Enter `↵`, Backspace `⌫`, Space as the word `Space`.
- **Mouse buttons:** drawn as the `mouseL` / `mouseR` / `wheel` glyph inside the cap.
- **Hold variant:** a conic-gradient border ring fills clockwise in `--dt-marker` (RDR2's hold prompt). Implemented with `background: conic-gradient(var(--dt-marker) calc(var(--p)*1turn), transparent 0)`, masked to a 2 px ring.

---

## 4. HUD

### 4.1 Layout and zones (1920×1080)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▎toasts (TL, 32/32)           ·  |  ·  NW  ·  |  ·  ◆ N  ·  |               fps (TR, 11px) │
│                                             ▾                                              │
│                                            312                                             │
│                                  [ place card, y=112 ]                                     │
│                                                                                            │
│                                                                           pickups (R) ▸    │
│                                           ( · ) ── prompt at cx+24                         │
│                                   stamina arc under crosshair                              │
│                                   center feedback line cy+88                               │
│  conditions  ◉ ◉                                                                           │
│  cores       ◯ ◯ ◯ ◯ ◯ ◯                                                  weapon / ammo    │
│   .-'''-.                                                                 or vehicle        │
│  /  ▲    \                         hotbar (BC, on select)                                  │
│  \  mini /                                                                                  │
│   '-...-'                                                                                  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

The bottom-left stack is anchored at `left: --edge; bottom: --edge`:

1. Minimap: 168 px circle.
2. Gap: 12.
3. Cores row: 6 × 30 px with 8 px gaps (220 px wide, left-aligned with the minimap).
4. Gap: 8.
5. Condition badges row: 20 px, left-aligned.

With the minimap off, the cores row drops to `bottom: --edge`.

### 4.2 Visibility rules (`hudMode`: Dynamic default / Always / Minimal)

`hudMode` is a new settings key. The UI treats `undefined` as `'dynamic'`, just as `Menus.js` already does for `minimap`.

| Element | Dynamic shows when | Always | Minimal |
|---|---|---|---|
| Crosshair dot | Not aiming, not in a vehicle, no screen open. At 30% while sprinting. | Same | Same |
| Compass | Always (hairline, no box) | Always | Hidden |
| Minimap | Always | Always | Hidden |
| Cores | A core is below its fine threshold (that core stays), or any core changed by ≥ 5% (whole row, `--linger`), or peek | Always | Only critical cores |
| Condition badges | Any active (always) | Always | Always |
| Weapon / ammo | Draw, switch, fire, reload, fire-mode change, aim, magazine ≤ 25% (sticky), jam (sticky), peek | While holding | Ammo number only while aiming |
| Hotbar | Slot key pressed (2 s), inventory open, peek | While any slot is bound | Hidden |
| Vehicle cluster | In a vehicle | Same | Speed only |
| Prompt / progress / toasts / pickups | Event-driven (always) | Same | Same |

"Fine" thresholds (from the current `vset` numbers):

- health ≥ 95%
- blood ≥ 95%
- food and water ≥ 40%
- energy ≥ 30%
- temperature between 36.0 and 38.0 °C
- stamina = 100% (stamina lives in the crosshair arc and is never counted here)

**Peek (Horizon's on-demand HUD):** a *tap* of the `hideHud` action (F1) reveals everything for 4 s. *Holding* it for more than 0.4 s toggles the HUD fully hidden, which is today's behaviour. The binding name is unchanged.

**Aiming (`game.hands.aiming`):**

- Compass and minimap fade to 35%.
- Cores hide unless critical.
- The pickup feed pauses: new pickups queue and play after the aim ends.
- The weapon cluster shows only the magazine count.

### 4.3 Idle

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                        ·   |   ·   |   ·   NW   ·   |   ·   |   ·   N                     │
│                                              ▾                                           │
│                                             312                                          │
│                                                                                          │
│                                                                                          │
│                                               ·                                          │
│                                                                                          │
│                                                                                          │
│   .-'''''-.                                                                              │
│  /    ▲    \                                                                             │
│ N           |                                                                            │
│  \         /                                                                             │
│   '-.....-'                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Crosshair:**

- *Dot:* 3 px ink with a 1 px `rgba(0,0,0,.6)` ring.
- *Dynamic (lines):* four ticks, 6 × 1.5 px, with gap from `crosshairSpread()` using today's formula.
- *None:* nothing.

**Compass:**

- Width 480, no background. The mask is the existing horizontal fade (18% / 82%).
- Ticks: every 15° is 1 px × 6 in ink-3. Every 45° gets a cardinal or intercardinal letter in `--fs-xs` 600 ink (N in `--dt-marker`). The numeric labels every 15° are removed.
- Needle: a 5 px `▾` in `--dt-marker` at the bottom edge. The heading number sits below it in `--fs-xs` ink-2 tnum, for example `312`. There is no degree sign because the context is obvious.
- Markers: a 9 px diamond in `--dt-marker` (death is a skull in danger, locate is a ring in marker yellow). When a marker is within ±25° of the centre, its distance appears under it in `--fs-xs` ink-3 (`1.2 km`).
- Heading source is unchanged (`vehicles.hud().heading` when driving).

**Minimap (`HUD._minimap`):**

- 168 px circle clipped by CSS. Border: `box-shadow: 0 0 0 1px rgba(245,243,238,.18), 0 6px 20px rgba(0,0,0,.45)`. An inner vignette (radial gradient canvas overlay) fades the map edge by 25%.
- North is a 10 px `N` in marker yellow, placed on the rim *outside* the clip (the element orbits the circle) so it never covers roads.
- Player: white arrow, fixed and pointing up.
- Markers clamp to the rim at radius r − 8 in the same shapes as §3.5.
- Zoom follows speed as today (0.55 when faster than 12 m/s, otherwise 1.1). Zoom changes ease over 400 ms instead of snapping.
- Map colours follow §6.4, the same as the full map.
- `minimap-label` is removed; its job moves to the place card.

**Place card (new):** when `ui.locationName( pos )` changes (checked every 30 frames; ignored for 20 s after the last change to avoid flicker at borders), show it centred at y = 112:

```
                                      Waikīkī
                                       OʻAHU
```

The town is in `--fs-place` ink. The island is in `--fs-cap` ink-2 (omitted when the name already is the island). It appears on spawn too, which replaces the `announceSpawn` toast. This takes the region cards from Ghost of Tsushima and RDR2.

### 4.4 Damaged

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│░░                     ·   |   ·   NW   ·   |   ·   N                                  ░░│
│░                                            312                                        ░│
│                                                                                          │
│         ╲                                                                                │
│          ╲  (damage wedge, left)            ·                                            │
│         ╱                                                                                │
│                                                                                          │
│  ◉2  ◉          ← bleed ×2 (danger), broken leg (danger); labels show 3 s on first appear │
│  ◔  ◕  ●  ●  ●  ●   ← health 40% (warn ring), blood 72% (warn), others full                │
│   .-'''''-.                                                                              │
│  /    ▲    \                                                                             │
│░ \         / ░                                                                          ░│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Cores (RDR2 cores):**

- 30 px circle. Track: 3 px `--dt-ink-5` ring. Value arc: 3 px ink, starting at 12 o'clock, clockwise, round cap. Icon: 14 px in the centre.
- The arc turns warn below the low threshold and danger below the critical threshold. At critical the icon also switches to its filled variant and the ring pulses (opacity 1 to 0.55 at 1 Hz).
- *Trend* (replaces ▲▼): when a value drops, the lost segment stays drawn in danger and fades over 600 ms (loss trail). When it rises (eating, bandaging), the gained segment flashes `--dt-good` for 600 ms. Draw with two SVG `<circle>` elements and `stroke-dasharray`.
- *Temperature:* the ring shows comfort (1 − |t − 36.9| / 2.2, as today). The icon is tinted `--dt-cold` below 36 °C and `--dt-heat` above 38 °C.
- *Breath:* underwater only, as the top arc around the crosshair (below), not a core.

**Condition badges:**

- On first appearance (per condition id per session), the label shows for 3 s in `--fs-sm` ink to the right of the badge, then collapses into the icon. Labels come from `S.conditions()`: `Bleeding`, `Broken leg`, `Infected`, and so on.
- Bleeding shows its count as a numeral (`2`), not `×2`.

**Stamina and breath arcs (near focus):**

- Stamina: a 2 px arc at radius 26 around the crosshair, spanning 100° centred at 6 o'clock. Ink on an ink-5 track, turning danger below 20%. The unavailable part (`maxStamina < 100`) is drawn in `rgba(255,74,74,.25)`. It appears when stamina < 100% and fades 1 s after it refills. This replaces the stamina bar under the vitals.
- Breath: the same arc at 12 o'clock in `--dt-cold`.

**Damage:**

- *Edge vignette:* one full-screen div. `radial-gradient(ellipse at center, transparent 58%, rgba(110,0,0,a) 100%)` with `a = clamp((0.5 − health/100) × 1.2, 0, 0.6)`. Below 25% health it pulses at 1.1 s (heartbeat).
- *Hit flash:* 120 ms, alpha +0.25, on `S.lastHitDir.t` rising.
- *Directional wedge:* replaces the blurry ellipse. An SVG arc at radius 140, spanning 50°, 3 px danger, opacity = `lastHitDir.t`.
- *Hit marker:* four 5 × 1.5 px diagonal ticks, 6 px from the centre. A kill turns them danger at 7 px. A headshot scales the marker 1.2× for 90 ms.

### 4.5 Aiming

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      ·   |   ·   NW   ·   |   ·   N          (35%)                        │
│                                                                                          │
│                                   (weapon optic / irons)                                 │
│                                                                                          │
│                                                                                          │
│   (minimap 35%)                                                                  31      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

The magazine count stays in `--fs-num-xl`. Everything else in the weapon cluster fades out.

### 4.6 Weapon and held item (bottom-right, right-aligned, `right: --edge; bottom: --edge`)

```
                                                              M4A1 Carbine   ← 2 s on switch only
                                                            ▬▬▬▬ ━━━━━━━━   ← silhouette, 64×24 white
                                                               31 / 90
                                                          SEMI · 5.56        ← --fs-cap ink-3
                                                         ━━━━━━━━━━━        ← condition 2px, only < 85%
```

- **Magazine:** `ammoOf( held )` in `--fs-num-xl` ink. Warn at 25% or less. Danger at 0, where the `R Reload` cap appears to the left (key cap plus verb, `--fs-md`).
- **Reserve:** `ammoInfo().reserve` in `--fs-num` (15 px 600) ink-3 as `/ 90`, danger when 0.
- **Mode:** `ammoInfo().mode`, uppercased in `--fs-cap`.
- **Jam:** when Hands reports a jam, show the `jam` glyph in warn plus the `R Clear` cap. This replaces the module toast *Jammed — press R to clear it*.
- **Non-firearm stacks:** show the name for 2 s on select and `×N` quantity when there is more than one.
- The silhouette uses the item thumbnail with the silhouette filter (§3).

### 4.7 In vehicle (replaces the weapon cluster)

```
                                                               Pickup truck    ← 3 s on entry
                                                                 72 km/h
                                                          [fuel] ━━━━━━━━░░░     fuel 64×3
                                                          [rep]  ━━━━━━━━━━░     condition
                                                                    3           gear cap (N/R/1-6)
                                                             ▲ 240 m            aircraft only
```

(`[fuel]`, `[rep]` are the `fuel` and `repair` glyphs; `▲` is the `altitude` glyph.)

- **Speed:** `abs(speed) × 3.6` in `--fs-num-xl`. Boats use knots. Unit in `--fs-cap` ink-3. Honour the `units` setting (mph when imperial).
- **Fuel and condition:** 64 × 3 px bars on an ink-5 track. Fuel turns danger below 15%, condition below 30%.
- **Gear:** a key-cap-shaped box.
- **Altitude:** shown when `altitude != null`.
- **Contextual caps:** the first time you enter each vehicle `kind` per session, a caps row shows at bottom centre for 5 s: `H Horn  L Lights  Space Brake`, or `Space Up  Ctrl Down` for aircraft.
- The crosshair is hidden. The minimap zooms out with speed and eases.

### 4.8 Interaction prompt (right of the crosshair)

```
                                         ·  [F] Take M4A1 Carbine
                                                5.56 · Worn
```

- Anchored at `left: 50% + 24px; top: 50%`, vertically centred on the crosshair and left-aligned. The target stays uncovered and the eye reads left to right, like TLOU2's object-adjacent prompts.
- No pill background: a key cap, a 13 px 500 ink label with halo, and the sub-label below in `--fs-xs` ink-3.
- *Hold* (`t.hold`): the key cap uses the hold-fill ring driven by `interact.holdT / t.hold`. The word "hold" is dropped because the ring says it.
- Hidden when `showInteractHints` is false, while an action is busy, or when a screen is open (as today).

### 4.9 Timed action

```
                                              ╭───╮
                                             (  ·  )     r=20, 2px, marker fill clockwise on ink-5 track
                                              ╰───╯
                                            Bandaging
```

- The label comes from `actions.current.label`, centred at cy + 36 in `--fs-sm` ink-2. The ellipsis and "(move to cancel)" are removed.
- If `current.cancelOnMove` is set, the ring's track is dashed (4/3). This quietly signals that moving cancels it.

### 4.10 Toasts and feedback

| `kind` | Where | Look | Life |
|---|---|---|---|
| `warn` | **Centre feedback line** at cy + 88, one at a time; a new one replaces the old | `--fs-md` warn with halo, no box | 2.2 s |
| `bad` | Top-left feed, max 3 | 2 px danger left rule, text ink | 5 s |
| `info`, `good` | Top-left feed, max 3 | 2 px ink-3 or good rule | 3.5 s |

`warn` toasts are action refusals ("No room", "No bandages"), so they belong where the eye already is. The top-left feed has no card: `--dt-scrim-hud` stretched as a left-anchored gradient (`linear-gradient(90deg, rgba(4,6,8,.45), transparent)`). Consecutive identical texts merge and show a count (`No room ×3`). An optional 20 px icon keeps `t.icon` support.

### 4.11 Pickups (right edge, above the weapon cluster, stacking upward)

```
                                                               Canned beans   +2  [sil]
                                                               5.56 round    +30  [sil]
```

- Name in `--fs-sm` ink-2, `+qty` in `--fs-sm` 600 ink tnum, icon as a 20 px silhouette. No pill.
- Pickups of the same `id` within 2 s merge and bump the count, re-arming the timer.
- Max 4 rows. Oldest fades first. Each lives 2500 ms.

### 4.12 Hotbar (bottom centre)

- Nine 44 px cells with 4 px gaps, no glass. Filled cells have a `rgba(4,6,8,.35)` fill and a 1 px line border; empty cells are drawn only while the inventory is open.
- Selected (held) cell: 1.5 px ink outline and 100% opacity. Others are at 70%.
- Index in the top-left at 9 px ink-3. Quantity or ammo bottom-right in `--fs-xs` with halo. Icons are silhouettes.
- Dynamic mode: appears for 2 s on `slot1..9`, and whenever the inventory is open (where it becomes a drop target, see §5).

### 4.13 Control hints (replaces `TIPS`, gated by `tutorial`, now labelled "Control hints")

Caps rows only, bottom centre at y = bottom − 120, `--fs-sm` ink-2. Shown once per world and skipped in creative, except for fly:

| Trigger | Row | Dismiss |
|---|---|---|
| Spawn + 2 s | `W A S D Move   ⇧ Sprint   C Crouch` | Player moved 30 m, or 20 s |
| Holding items, inventory not yet opened, 60 s in | `Tab Inventory` | Inventory opened |
| First loot prompt seen | (none; the prompt already shows `F Take`) | |
| 200 m walked, map never opened | `M Map` | Map opened |
| Creative spawn | `Space ×2 Fly` | Flew, or 8 s |

### 4.14 FPS and debug

- **FPS:** top-right at `--edge`, `--fs-xs` tnum ink-3, no box. Text is the number only (`41`). Put a 1 px ink-5 left rule before it so it does not read as a heading.
- **Debug (F3):** keep the mono block with `rgba(7,9,11,.72)` and radius 4. Drop the `Deadtide — ` prefix.
- **Lock hint:** `Click to resume`, centred at cy + 60, `--fs-md` ink-2 with halo, no pill.

---

## 5. Inventory

The inventory takes the full screen over the world with the menu scrim (`--dt-scrim-menu`). The game keeps running, like DayZ and TLOU2's real-time backpack. There is no floating panel and no title. The columns are separated by space, not borders.

### 5.1 Layout (1920×1080)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Nearby   Crafting   Catalog                                ⌕ Filter        11.2 / 30 kg ━━━━━░░  Esc │
│  ───────                                                                                            │
│                                                                                                     │
│  FRIDGE                          4 / 20     [hd] [ey] [fc]      POCKETS                     3.5 / 4 │
│  ┌──┐┌──┐┌──┐┌──┐                            [to] [ve] [bk]      ┌──┐┌──┐┌──┐                         │
│  └──┘└──┘└──┘└──┘                            [gl] [lg] [ft]      └──┘└──┘└──┘                         │
│                                                   [bt]          CARGO SHORTS                  0 / 6 │
│  GROUND                               3                         ┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐           │
│  ┌──┐┌──┐┌──┐                     ┌─────────┐┌─────────┐        HIKING BACKPACK              0 / 30 │
│  └──┘└──┘└──┘                     │ primary ││secondary│        ┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐┌┄┄┐ │
│                        Take all    └─────────┘└─────────┘                                            │
│                                     ┌────┐ ┌────┐                                                   │
│                                     │ sd │ │ ml │                                                   │
│                                     └────┘ └────┘                                                   │
│                                                                                                     │
│                                   ◉ Bleeding 2   ◉ Broken leg                                        │
│                                   [hp] 64%  [bl] 4.1 L  [tp] 36.9° / 28° out                               │
│                                   [ins] 20%  [bite] 10%  [wet] 0%                                             │
│                                                                                                     │
│                                  1    2    3    4    5    6    7    8    9                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The column grid is `34% / 28% / 38%` with 48 px gutters inside the 96 px menu gutter. Each column scrolls on its own. The hotbar strip sits at the bottom, centred under the middle column.

**Top bar (y = 32, height 36):**

- Left: text tabs in `--fs-md` 500, ink-3, with the active tab in ink and a 2 px ink underline (`--t-fast` slide). With a container open, the first tab takes the container's `label`.
- Right:
  - A filter field (`⌕` plus an input with placeholder "Filter", 200 px). It dims every non-matching cell in all columns to 25%, a QoL addition.
  - The weight meter `11.2 / 30 kg` in `--fs-sm` tnum with a 96 × 3 bar: ink up to 30 kg, warn beyond, scaled to 45 kg.
  - An `Esc` key cap button that closes.

**Middle column (character):**

- Paper doll: a 3 × 3 grid plus belt centred below, 64 px slots, empty slots showing the slot glyph (§3.3) in ink-4, a 1 px dashed line border, radius 4.
- Weapons: `primary` and `secondary` are 2:1 wide cells (136 × 64) for long guns. `sidearm` and `melee` are 64 px.
- Conditions: badges with labels always shown (there is room here).
- Body stats: a two-column icon + value grid in `--fs-sm` tnum. There are no word labels; the `title` attribute gives the name on hover.
  - Health %
  - Blood in litres (4.1 L)
  - Body temperature with outside temperature in ink-3
  - Insulation %
  - Bite protection %
  - Wet %
  - "Infected killed" leaves this panel (it lives in Status and on the death screen).
- The "In hands" line goes; the held item shows a marker dot on its cell instead.

**Right column (carried):** one block per `inv.containers()` entry.

- Header row: 16 px owner icon, name in `--fs-cap` ink-2, `used / cap` in `--fs-xs` tnum ink-3 (danger when full), and a 2 px capacity bar under the header in ink-3 (warn above 80%, danger at 100%).
- The block grid shows a row of faint dashed empty cells when empty, so the drop area stays visible. There is no "Empty" text.
- A `sort` icon button sits at the end of the first header, sorting all containers (title "Sort").
- The "Carried x / y space" total header goes, along with the "Wear clothes with pockets…" sentence.

**Left column (Nearby):**

- The open container block (same design), the Ground block (count only), and a `Take all` text button (`--fs-sm`, `takeAll` icon) at the right of the Ground header.
- The empty ground block shows dashed cells.

### 5.2 Item cell

```
┌────────────────┐  56×56, r4, fill rgba(245,243,238,.04), 1px --dt-line
│▔▔ (rarity 2px) │  rarity edge only for rare+
│•           3   │  • held marker (5px ink dot, TL); 3 = hotbar binding (9px ink-3, TR)
│     [icon]     │  3D thumbnail at 82%
│            30  │  qty / rounds (--fs-xs 600, halo, BR)
│▁▁▁▁▁▁▁▁▁       │  condition 2px bar, only if < 0.85, condition colour
└────────────────┘
```

| State | Look |
|---|---|
| Hover | fill `.10`, border `--dt-line-2`, tooltip after 250 ms |
| Keyboard focus | 2 px ink outline, offset 1 |
| Drag source | opacity .3, dashed border |
| Spoiled | icon `grayscale(.7) sepia(.4)`, 4 px danger dot BL |
| Filtered out | opacity .25 |
| Catalog cell | same, with `+` in ink-3 TR on hover |

### 5.3 Drag and drop

- **Ghost:** 64 px icon on a `--dt-surface-2` plate (r4, `--shadow-pop`) with the quantity. It is offset 12/12 from the cursor so the target stays visible.
- **Verb tag (new):** under the ghost, `--fs-xs` 600 ink on a void chip, showing what dropping will do.
  - Onto a container: `Move` (or `Take` from ground or container).
  - Onto ground: `Drop`.
  - Onto an equipment slot: `Wear`.
  - Onto a matching magazine: `Load`.
  - Onto a firearm: `Insert` (magazine), `Load` (internal feed) or `Attach` (attachment).
  - Onto the same stackable id: `Merge`.
  - Onto a hotbar slot: `Bind 4`.
  - Computed with the same rules as `_dropOnItem` and `move`, dry-run only.
- **Valid target:** container block or slot gets a 1.5 px ink outline and a `rgba(245,243,238,.06)` fill. A valid item-on-item target gets a 1.5 px marker-yellow ring.
- **Invalid target:** 1.5 px danger outline, the verb tag becomes the reason in danger (`Wrong slot`, `No room`, `Not inside itself`), and `cursor: not-allowed`. A drop onto an invalid target plays a 120 ms 4 px horizontal shake on the ghost before it returns, instead of a toast. The toast from `_deny` is dropped when the reason already showed on the tag.
- **Hotbar strip:** dropping an item on a hotbar cell binds it (QoL, alongside hover + 1-9). Dragging a bound cell off the strip unbinds it.

### 5.4 Tooltip (260 px, `--dt-surface-2`, r8, padding 12, `--shadow-pop`, 250 ms delay)

```
┌──────────────────────────────────────┐
│ M4A1 Carbine                         │  --fs-lg ink
│ FIREARM · WORN                       │  --fs-cap ink-3 (category · condLabel)
│ ━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░       │  condition 2px
│ 5.56          Loaded   30 / 30       │  key --fs-xs ink-3, value --fs-sm tnum ink
│ Damage 34     RPM      800           │
│ Range 400 m   Modes    Semi, Auto    │
│ Attached      Red dot                │
│ 3.2 kg        Size     4             │
│ ──────────────────────────────────── │
│ [mouseL]×2 Hold      [mouseR] More   │  --fs-xs ink-3; first = default action
└──────────────────────────────────────┘
```

- The description paragraph (`d.desc`) and the rarity word are removed.
- Tags replace sentences, as 18 px chips in `--fs-cap`: `Raw` (warn), `Sealed` (ink-3), `Alcohol`, `Splint`, `Spoiled` (danger).
- Food shows `kcal 400 · Water 20 · Fresh 72%`. Medical shows `Bleed 1 · Heals 20 · Infection 50% · Blood +500 ml`.
- **Compare (new, Horizon-style):** for clothing or weapons that go in a slot that is already filled, stat values show a delta against the equipped item: `Insulation 30% ▲10` in good or `▼5` in danger. The 11 px arrow glyphs are allowed because they carry meaning.
- Stat keys shortened: `Rate of fire` → `RPM`, `Stops bleeding` → `Bleed`, `Treats infection` → `Infection`, `Bite protection` → `Bite`, `Hydration` → `Water`, `Splints fractures` → tag `Splint`.

### 5.5 Context menu (`--dt-surface-2`, r8, min-width 200, row 30 px)

```
┌───────────────────────────────┐
│ Hold                       2× │  first row = default action; hint is the cap glyph
│ Eject mag                     │
│ Unload                        │
│ Detach Red dot                │
│ ───────────────────────────── │
│ Hotbar                    1-9 │  or "Unbind 3"
│ Split                         │
│ Put in Fridge              ⇧  │
│ Drop                          │
│ Delete                        │  danger, creative only
└───────────────────────────────┘
```

- Rows are `--fs-md`, with hover `--dt-surface-3` and hints right-aligned in `--fs-xs` ink-3.
- Keyboard: arrows move, Enter runs, Esc closes. Each row also gets a first-letter accelerator (underlined only while Alt is held).
- **Split:** replaces the popover title. It is an inline row under the menu: a slider, a number input (tnum, 44 px, editable), quick buttons `½` and `1`, and a `Split` primary button. Enter confirms.

### 5.6 Crafting tab

```
  ⌕ Filter                                   [ ] Craftable only
  ┌──────────────────────────────────────────────────────────────────┐
  │ [icon40]  Bandage ×2                                    [ Craft ] │  --fs-md ink; ×2 ink-3
  │           [rag] 2/2  [knife] 1/1  [fire] 0/1                      │  chips: 18px icon + count
  └──────────────────────────────────────────────────────────────────┘
```

- One 56 px row per recipe. Craftable rows come first (existing sort) with a 2 px left rule in `--dt-good`. Rows that cannot be crafted sit at 55% opacity, and their Craft button is disabled.
- **Ingredient chips:** thumbnail plus `have/need` tnum, good when satisfied, danger when missing. Tools use the same chip. The station (fire) chip uses the `hot` glyph.
- Hovering a chip shows the item tooltip.
- The `, ` separators, the `· at a campfire` text and the "No recipes." empty state are all removed.
- Craft still calls `C.craft( r )` and closes the screen, as today.

### 5.7 Creative catalog tab

```
  ⌕ Search                                               412
  All  Firearm  Ammo  Magazine  Melee  Medical  Food  Drink  Tool  …   (text chips, --fs-sm)
  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘
```

- The count (`412`, the filtered count) sits right in ink-3 tnum.
- Category chips: ink-3 text, active in ink with a 2 px underline. No pill borders.
- Behaviour is unchanged: click gives 1, Shift gives a stack, drag places. The tooltip footer shows `[mouseL] +1   ⇧ Stack`. The sentence explaining this is removed.
- The empty result shows nothing.

---

## 6. Map and minimap

### 6.1 Full map (`MapUI`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Waikīkī                                                                          [+]      │
│ OʻAHU · 17:37 · DAY 1                                                            [−]      │
│                                                                                  [loc]    │
│                                                                                  [fit]    │
│                     (full-bleed relief map)                                      [pin 3]  │
│                                                                                           │
│                                                                                           │
│                                                                                           │
│ [i]                                                                                       │
│              Dbl-click Mark    [mouseR] Remove    C Centre    ⇧ Click Teleport   ├──────┤ │
│                                                                                    2 km   │
│                                                         −3880  −9660 · ▲ 72 m · 1.2 km    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Top-left header:** no box, halo text. The place from `locationName( player, true )` is in `--fs-place`. The meta line (island, `fmtHour( g.hour )`, `DAY n`) is in `--fs-cap` ink-2.

**Right tool rail:** 36 px square icon buttons. Fill `rgba(7,9,11,.55)`, r4, 1 px line border; hover ink border.

| Button | Action |
|---|---|
| `plus` / `minus` | Zoom ×1.5 / ÷1.5 around the view centre (existing) |
| `locate` | Centre on me (existing "Me"; also `C`) |
| `fit` | Fit all islands (existing "Islands") |
| `pin` with count | Opens the marker panel (below) |

"Close" is removed: `Esc` and the map key already close. A 1 px separator sits between groups.

**Marker panel (new QoL):** a 260 px `--dt-surface-2` popover under the pin button.

- One row per marker: its glyph, the `label` (editable inline on double-click), the distance in tnum, and `close` to remove.
- Clicking a row centres the map on it.
- Rows are sorted by distance. The death marker is pinned on top.
- `/markers clear` stays in chat; the panel footer adds a `Clear` text button (it keeps the death marker, like `Markers.clear`).

**Legend:** collapsed into the `legend` button (bottom-left). It opens a small popover of line samples: Freeway, Road, Street, Dirt road, Building, Marker, Body, Vehicle. It is closed by default.

**Controls row:** a single caps row, bottom centre, `--fs-xs` ink-3. It fades to 0 after 4 s without mouse movement and returns on move. The creative-only teleport cap shows only in creative. Drag-to-pan and wheel-zoom are left out because they are universal.

**Readout:** bottom-right, `--fs-xs` tnum ink-2, no box: `x z · ▲ elev m` (or `▼ depth m` at sea) `· distance`. The "(real)" and "away" words are removed.

**Scale bar:** above the readout, a 1 px ink line with 4 px end ticks and the `fmtDist( nice )` label centred above it. The "(game)" suffix is removed.

### 6.2 Map markers on canvas

These use the shapes in §3.5.

- User marker labels are drawn in `--fs-xs` 600 ink with a 3 px `rgba(0,0,0,.6)` stroke, at +10/−4.
- Known vehicles use the `car` glyph in ink-2 at 14 px.
- The player arrow gets a view cone and a 1 px ring pulse every 2 s at 60% opacity, which helps find yourself when zoomed out.

### 6.3 Label tiers (Far Cry 5's progressive disclosure)

| ppm | Labels shown |
|---|---|
| < 0.02 | Island names only (`--fs-cap` +0.3em ink-2) |
| 0.02-0.08 | Plus towns (`--fs-sm` 600 ink), with the largest by `radius` first |
| 0.08-0.5 | Plus districts, bays and peaks (bays in italic 11 px `#8FB9CC`; peaks with a ▲ glyph) |
| > 0.5 | Plus street and road names where the vector data has them |

This goes through the existing `priority` option on `MapView.draw`. Labels collide-cull using the priority order.

### 6.4 Map palette (`MapView.js` / `maptile.js`)

The current relief is saturated orange and green with hard tile edges (screenshot 04). It becomes a muted, luminance-led palette so markers and roads read on top. The same palette serves the minimap.

| Layer | Value |
|---|---|
| Deep ocean | `#0A1A24`, shading to `#11303F` in the shallows (depth ramp); coast line 1 px `rgba(245,243,238,.35)` |
| Land base | Lowland `#39402F` → uplands `#4A4A3C` → summits `#8A877D`; beaches `#8C8065` |
| Hillshade | Multiply luminance only (no hue), 0.55 strength |
| Contours | 1 px `rgba(245,243,238,.07)` every 200 m real, drawn only when ppm > 0.08 |
| Freeway | `#E6D6AE` 2.5 px, 1 px dark casing |
| Highway / road | `#CFC7B6` 1.75 px |
| Street | `rgba(245,243,238,.45)` 1 px (ppm > 0.3) |
| Dirt | `#9C7A55` 1 px dashed 4/3 |
| Building | `#23272A` fill, 0.5 px `rgba(0,0,0,.4)` edge |
| Runway | `#4B4F52` |

**Tile loading:** the 64 m/px level for the whole archipelago is always drawn first as the base, so no hard rectangles appear while finer tiles stream (screenshot 04 shows a hard edge at the tile boundary). New tiles fade in over 200 ms.

### 6.5 Minimap

- Same palette and label tier `labels: false` (as today).
- Buildings are drawn at 60% alpha so the player arrow dominates.
- Shape and placement follow §4.3. Clicking is not possible (the HUD has no pointer events).

---

## 7. Chat and commands

```
│   <You> anyone out there                                                      │
│   /give m4a1                                             (cmd: mono ink-3)    │
│   Gave 1 × M4A1 Carbine                                  (ok: ink)            │
│   Unknown item "m4"                                      (err: danger)        │
│  ┌───────────────────────────────────────────────────┐                        │
│  │ /give  <item> [count]                   Give item │  suggestions           │
│  │ /gamemode  <survival|creative>          Set mode  │                        │
│  └───────────────────────────────────────────────────┘                        │
│  ▏/g▌                                               Tab ↵                     │
```

- **Position:** left `--edge`, bottom 300 (above the bottom-left stack), width 520.
- **Closed:** lines in `--fs-sm` with halo and **no background bubbles**. Each line fades after 8 s (as today) and at most 6 are visible. When chat opens, the log gets a `linear-gradient(90deg, rgba(7,9,11,.6), transparent)` backing and scrolls.
- **Line kinds:**
  - `sys`: ink-2
  - `ok`: ink
  - `err`: danger
  - `cmd`: mono `--fs-xs` ink-3
  - `me`: ink with `<You>` in ink-3
- **Input:** 36 px, mono `--fs-sm`, `rgba(7,9,11,.7)` fill, 1 px `--dt-line-2`, r4. No placeholder. The right edge shows `Tab` and `↵` caps only while suggestions exist.
- **Suggestions:** `--dt-surface-2` r4 above the input. Each row has the command in mono ink, its `usage` args in mono ink-3, and `desc` right-aligned in `--fs-xs` ink-3 (truncated at 24 chars). The selected row uses `--dt-surface-3` with a 2 px ink left rule. Behaviour (Tab, arrows, history) is unchanged.
- The welcome line is removed.

---

## 8. Title screen

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│                              (live vista: Waikīkī / Sunset Beach / Kona)                 │
│                                                                                          │
│                                                                                          │
│   D E A D T I D E                                                                         │
│                                                                                          │
│   ▎Continue      Kona run · Day 4                                                        │
│    Worlds                                                                                │
│    Options                                                                               │
│    About                                                                                 │
│                                                                                    v0.1  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Scrim:** `linear-gradient(90deg, rgba(7,9,11,.78) 0%, rgba(7,9,11,.35) 40%, transparent 65%)` plus a bottom gradient to 50%. There is no box.

**Column:** left at the menu gutter, bottom at 14vh.

- Wordmark in `--fs-hero`: solid ink, no gold gradient, no drop-shadow filter. Only the halo is used.
- Below it, 48 px of space, then items in `--fs-menu` ink-2.

**Item states:**

- Hover or focus: ink, a 2 px × 24 px ink bar at the left, and an 8 px slide right (`--t-fast`). A hover sound plays (existing).
- `Continue` shows the last live world as meta to its right (`--fs-sm` ink-3: `name · Day n`), and is removed when there is none (as today).
- Keyboard: Up and Down move, Enter selects. Focus starts on the first item.

| Current | New | Notes |
|---|---|---|
| Continue (hint "Last world") | Continue | Hint becomes the world name and day |
| Singleplayer (hint "Worlds") | Worlds | |
| Options | Options | |
| Controls | removed | Moved to Options > Keys |
| Credits | About | |

**Footer:** only `v0.1` in `--fs-xs` ink-4, bottom-right. The attribution footer moves to About.

**About:** uses the same typographic layout as Options (§10). It is a single two-column list with `--fs-cap` keys and `--fs-sm` values.

| Key | Value |
|---|---|
| Terrain | AWS Terrain Tiles (USGS 3DEP, SRTM, ETOPO1, GMRT) |
| Textures | Poly Haven, CC0 |
| Audio | Freesound CC0 via Tidewater |
| UI basis | Tidewater, DRG Software Solutions, MIT |
| Characters | Microsoft Rocketbox, MIT |
| Rendering | three.js |
| Fonts | Inter, JetBrains Mono, OFL |
| Version | 0.1 |

The links stay. The prose paragraphs and the sign-off line are removed.

---

## 9. Worlds, new world, edit world

### 9.1 Worlds

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Worlds                                                                   ⇩ Import      │
│                                                                                          │
│  ┌────────┐ Kona run                      │ ┌──────────────────────────────────────────┐ │
│  │ thumb  │ SURVIVAL  Day 4 · 3h 12m      │ │                                          │ │
│  └────────┘                   Today 14:20 │ │            thumbnail 16:9                │ │
│ ▎┌────────┐ Creative test                 │ │                                          │ │
│  │ thumb  │ CREATIVE  Day 1 · 12m         │ └──────────────────────────────────────────┘ │
│  └────────┘                       Sep 12  │  Creative test                               │
│  ┌────────┐ Hardcore one                  │  CREATIVE · NORMAL                           │
│  │ (grey) │ HARDCORE [skull] Day 9 · 5h 40m │  Day 1     12m      0 kills     0.4 km       │
│  └────────┘                       Sep 02  │  Seed 83721                                  │
│                                           │                                              │
│  + New world                              │  [   Play   ]  [ren] [dup] [exp] [del]       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

(`[ren]`, `[dup]`, `[exp]`, `[del]` are the `rename`, `duplicate`, `export` and `delete` icon buttons.)

- **Screen:** full-screen scrim, no panel. The header has the `back` icon and the title in `--fs-display`, with `Import` (icon + word, ink-2) on the right.
- **List (left, 520 wide):**
  - Rows 72 px: 96 × 54 thumb (r2), name in `--fs-lg`, meta line in `--fs-xs`.
  - The mode badge is `--fs-cap` text only: ink-2 for Survival, marker yellow for Creative, danger for Hardcore. A skull glyph marks a dead hardcore world.
  - The date sits right in ink-3.
  - Selection: 2 px ink left bar and `--dt-surface-3` fill.
  - A dead hardcore world renders at 50% with a greyscale thumb, and Play is disabled with no message.
- **Detail pane (right):**
  - Large thumb, name, mode and difficulty caps.
  - Stats row: numbers in `--fs-num` with `--fs-cap` captions (days, playtime, kills from `w.stats`, distance).
  - Seed in mono ink-3.
  - Actions: `Play` (primary: ink fill, void text, 44 px) plus the icon buttons Rename, Duplicate, Export and Delete (danger on hover). Rename is inline in the detail pane (Enter saves) and replaces the separate Edit dialog. The `Created` date appears in the detail pane in ink-3.
- **Keys:** Up and Down select, Enter plays, double-click plays, `F2` renames, `Delete` deletes (confirm), `N` opens New world, `Esc` goes back.
- **Empty state:** the list area is empty and `+ New world` is shown larger (`--fs-menu`) and focused.
- **Delete confirm (§12):** `Delete “Kona run”?` with `[Cancel] [Delete]`. No body sentence.

### 9.2 New world

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ← New world                                                                             │
│                                                                                          │
│     Name          [ New World                                   ]                        │
│     Seed          [ Random                                      ]   mono                 │
│     Mode          Survival   Creative                                                   │
│                   ────────                                                               │
│     Difficulty    Easy   Normal   Hard                                                   │
│     Hardcore      Off   On                                                               │
│     Day length    24   48   96   144   min                                               │
│     Start         Morning   Noon   Evening   Night                                       │
│     Spawn         Random  Niʻihau  Kauaʻi  Oʻahu  Molokaʻi  Lānaʻi  Maui  Hawaiʻi         │
│                                                                                          │
│                                                          Cancel      [  Create  ]        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- The form has a 720 px max width. Labels are `--fs-md` ink-2 in a 160 px column. Rows are 48 px.
- Segmented controls follow §10.3. With Creative selected, the Hardcore row is disabled at 40% (the mode and hardcore combination is otherwise meaningless).
- Spawn uses the same segmented style, wrapping, with islands in west-to-east order.
- Enter creates; Esc goes back.

### 9.3 Edit world

Folded into the Worlds detail pane (inline rename plus the icon actions). The stats sentence becomes the stats row.

---

## 10. Options

### 10.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Options                                                                               │
│                                                                                          │
│   Graphics  ▎   Preset              Low    Medium    High    Ultra                       │
│   Audio                                             ─────                                 │
│   Controls      Render distance     ━━━━━━━━━●──────────────────   1.4 km               │
│   Keys          Field of view       ━━━━━━●─────────────────────   80°                  │
│   Gameplay      Resolution          ━━━━━━━━━━━━━●──────────────   100%                 │
│   Interface     Head bob            ━━━━━━━━━━━━━━━━━━━━━━━━━━━●   100%                 │
│                                                                                          │
│                 DETAIL                                                                   │
│                 Shadows             Off    Medium    High    Ultra                       │
│                 Terrain             Low    Medium    High    Ultra                       │
│                 Vegetation          Low    Medium    High    Ultra                       │
│                 Grass               ○━━                                                  │
│                 …                                                                        │
│                                                                          Reset tab       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Full-screen scrim, no outer panel.
- Tab list on the left: `--fs-menu` at 18 px, ink-2. The active tab is ink with a 2 px ink bar at its right edge. Keys `Q` and `E` or `[` and `]` cycle tabs; arrows move through rows.
- Content column: 760 px max width. Rows 44 px, labels `--fs-md` ink-2, controls right-aligned in a 360 px column, and row hover in `--dt-surface-3` at 50%.
- Section caps in `--fs-cap` ink-3 with 24 px top space.
- `Reset tab` (bottom right, text button) resets only that tab's keys via `S.set`; bindings are excluded except on the Keys tab. `Done` is removed because `Esc` and `←` return. Changes save live (as today); the "Saved automatically." text is removed.

### 10.2 Tabs and rows (all existing keys kept; new keys marked with `*`)

**Graphics** (merges the old Display and Graphics tabs):

- Preset: `quality` via `applyPreset`
- Render distance: `renderDistance` 400-4000, shown as `x.x km`
- Field of view: `fov` 60-110, `°`
- Resolution: `renderScale` 50-150%
- Head bob: `headBob` 0-100%
- *DETAIL*
  - Shadows: `shadows`
  - Terrain: `terrainDetail`
  - Vegetation: `vegetation`
  - Grass: `grass`
  - Clouds: `clouds`
  - Water: `water`
- *IMAGE*
  - Anti-aliasing: `antialias` (Off / FXAA / MSAA 4×)
  - Bloom: `bloom`
  - Night brightness: `nightBrightness` 30-200%

**Audio:**

- Master: `masterVolume`
- Effects: `sfxVolume`
- Ambience: `ambientVolume`
- Music: `musicVolume` (exists in Settings but has no control today; add it)
- Interface: `uiVolume`
- Subtitles: `subtitles` (exists, not exposed today; add it)

**Controls:**

- Sensitivity: `sensitivity` 0.2-3.0 `×`
- Invert Y: `invertY`
- Toggle crouch: `toggleCrouch`
- Toggle aim: `toggleAim`
- Toggle sprint: `toggleSprint`

**Keys:** see §10.4. This tab is also the one controls reference; the old Controls screen is removed.

**Gameplay:**

- Auto-pickup ammo: `autoPickupAmmo`
- Require map items: `realisticMap`
- Units: `units` (Metric / Imperial; exists, not exposed today; add it)

**Interface:**

- GUI scale: `guiScale` 70-160%
- HUD: `hudMode*` (Dynamic / Always / Minimal)
- HUD backing: `hudBacking*` (Off / Light / Dark)
- Crosshair: `crosshair` (Dot / Dynamic / None)
- Compass: `compass`
- Minimap: `minimap`
- Hit markers: `hitMarkers`
- Damage direction: `damageIndicators`
- Prompts: `showInteractHints`
- Control hints: `tutorial`
- FPS counter: `showFps`

### 10.3 Controls

**Slider:**

- Track 240 × 2 px, ink-5, with the filled part in ink.
- Thumb: 12 px ink circle with a 1 px void ring. It grows to 14 px on hover or drag.
- Value: 56 px right-aligned, `--fs-sm` tnum ink. Clicking the value turns it into a number input (Enter commits, Esc cancels). Left and Right step when focused; Shift steps ×10.
- The existing `--p` custom property for the fill is kept.

**Segmented control:**

- Plain text options in `--fs-sm` 500 ink-3 with 16 px gaps.
- Selected: ink with a 2 px ink underline sliding under the option (`--t-fast`). Hover: ink-2. No pill or box.
- Keyboard: Left and Right change the value.

**Toggle:**

- 32 × 18 track (`--dt-ink-5`) with a 14 px knob (ink-2).
- On: the track fills ink and the knob becomes void (monochrome). No accent colour.

**Text input:**

- 40 px high, `rgba(7,9,11,.6)` fill, 1 px `--dt-line-2`, r4.
- Focus: 1 px ink border plus a 3 px `rgba(245,243,238,.08)` ring.

**Buttons:**

- *Primary:* ink fill, void text, 600, 40 px, r4.
- *Secondary:* transparent, ink-2 text, ink border on hover.
- *Danger:* transparent, danger text; danger fill at 15% on hover.
- *Text button:* ink-2, ink on hover, no border.

### 10.4 Keys (rebinding and reference)

```
  ⌕ Filter actions                                                   Reset keys

  MOVEMENT
  Move forward                               [ W ]        [   ]
  Sprint                                     [ ⇧ ]        [   ]
  …
  ACTIONS
  Interact                                   [ F ]  •     [   ]        ← • = conflict (danger dot + danger border)
  Reload                                     [ _ ]  Esc Cancel  ⌫ Clear    ← listening state
  …
  VEHICLES
  Horn                                       [ H ]        [   ]
```

- Two binding cells per action: 72 × 28 key-cap-style buttons in `--fs-key`. An empty cell shows nothing (the `—` is removed).
- **Listening:** the cell shows a blinking 8 × 1.5 px caret in marker yellow, and a contextual caps row appears inline to the right: `Esc Cancel  ⌫ Clear`. This replaces the tooltip sentence and "Press a key…".
- **Conflict:** danger border plus a 5 px danger dot. Hovering shows the tooltip `Also: Horn`. Vehicle and on-foot pairs are exempt (existing logic).
- **Filter:** matches label or key; for example typing `F` lists every action bound to F.
- Groups keep the current order: Movement, Actions, Hotbar, Menus, Vehicles. Hotbar collapses into one row `Hotbar 1-9` with the nine caps inline and small.
- Action labels come from `BINDING_LABELS` (Settings.js). Shorter labels are requested in §13.

---

## 11. Pause, death, loader

### 11.1 Pause

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  (world: blur 20 · brightness .6 · saturate .7, left scrim)                              │
│                                                                                          │
│                                                                                          │
│   KONA RUN · DAY 4 · 17:37                                                               │
│                                                                                          │
│   ▎Resume                   Esc                                                          │
│    Map                                                                                   │
│    Status                                                                                │
│    Options                                                                               │
│    Creative mode                                                                         │
│    Save                                                                                  │
│    Quit to title                                                                         │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Meta line:** `--fs-cap` ink-2 with world name, `Day n` and `fmtHour`. The "PAUSED" heading is removed; the dimmed world says paused.
- **Items:** `--fs-menu`, with the same states as the title screen. `Esc` shows as a cap only beside Resume.
- **Map:** opens `ui.map` (QoL).
- **Status:** opens `ui.journal()`.
- **Creative mode / Survival mode:** runs `/gamemode` as today and is hidden in hardcore. The code removes this row by position (`col.children[5]`); it must remove it by id instead.
- **Save:** on success, a menu toast `Saved`.
- **Quit to title:** saves, then quits (as today).
- "Controls" is removed (it is in Options > Keys).

### 11.2 Status (was "Survival journal", `ui.journal()`)

```
  ← Status                                                          DAY 4
  CONDITION
  ◉ Bleeding 2          [bandage] [rags]            ← remedy item icons (40% if not carried, ink if carried)
  ◉ Broken leg          [splint]
  ◉ Cold  35.8°         [jacket] [fire]
  THIS LIFE
  2.4 d        17         3.1 km       64         1
  SURVIVED     KILLS      DISTANCE     LOOTED     LIVES
  ALL TIME  212 kills
```

- The advice sentences become remedy chips: item icons drawn from `ITEMS` with the matching `medical` property, or a fixed map per condition. Hovering a chip shows the item tooltip. "You are holding up…" is removed; if there are no conditions the section is omitted.
- "Where" is removed (it is in the pause meta line and on the map).

### 11.3 Death (sticky)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                     (world → greyscale via CSS backdrop-filter, dark red radial)          │
│                                                                                          │
│                                                                                          │
│                                      D E A D                                             │
│                                     Blood loss                                           │
│                                                                                          │
│                                2.4 d               17                                    │
│                              SURVIVED             KILLS                                  │
│                                                                                          │
│                           [  Respawn  ]         Quit                                     │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

This follows GTA V's *Wasted* beat: the world desaturates, then a single word appears.

- **Background:** `backdrop-filter: grayscale(1) brightness(.5)` over the canvas, plus `radial-gradient(ellipse at center, rgba(60,0,0,.35), rgba(0,0,0,.85))`.
- **Sequence:**
  - 0 ms: the world desaturates over 900 ms.
  - 600 ms: `DEAD` fades in (`--fs-hero`, ink at 92%, 800 ms, 12 px rise).
  - 1200 ms: the cause appears (`--fs-display`, ink-2, sentence case: `Blood loss`).
  - 1600 ms: stats and buttons appear.
- **Stats:** exactly two. Survived is `days < 1 ? h : d` in `--fs-num`; kills is `stats.lifeKills` in `--fs-num`. Captions are `--fs-cap` ink-3. Travelled and lives are removed.
- **Buttons:** `Respawn` (primary, focused, Enter) and `Quit` (text button). In hardcore there is a single primary `Title` and a `--fs-cap` danger line `WORLD OVER`.
- The skull marker on the map is the only reminder of the body. The sentence is removed.

### 11.4 Loader (`index.html` + `main.js status()`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  (key art full-bleed, Ken Burns, bottom scrim)                                           │
│                                                                                          │
│                                                                                          │
│                                                                                          │
│   D E A D T I D E                                                                         │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────   72%         │
│   Terrain                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Wordmark:** `--fs-hero`, solid ink.
- **Progress bar:** 420 × 2 px, ink-5 track, ink fill. The glint animation and the sun gradient are removed.
- **Percentage:** `--fs-xs` tnum ink-2, right of the bar.
- **Step:** below the bar in `--fs-sm` ink-3, 1-3 words.
- **Removed:** kicker, tagline, all eight tips, the Tip label, elapsed time (`.loader-time`, which `main.js` must stop writing), and the `aria-label` text beyond "Loading".
- **Error state (`tw-error`):**
  - The bar turns danger.
  - The step line reads `Error` in danger, with the message on a second line in `--fs-xs` ink-3.
  - A `Reload` text button appears (`location.reload()`).

---

## 12. Dialogs, focus, sound

- **Confirm (`ui.confirm`):** 400 px `--dt-surface`, r8, `--shadow-pop`, padding 24. Title in `--fs-lg`, then buttons right-aligned. There is no body text unless the caller passes something that is not a sentence of advice (all current callers can drop it). Enter confirms, Esc cancels, and focus starts on Cancel for danger actions.
- **Menu toasts (`toastScreen`):** bottom-centre, `--fs-md` ink on a `--dt-surface-2` chip, r4, 2.5 s. Examples: `Imported`, `Saved`, `World over`.
- **Focus:** every interactive element has `:focus-visible` with a 2 px ink outline. All menus are keyboard-navigable.
- **Sound (existing hooks):**
  - `ui_hover` at 0.3 on menu items only, not rows.
  - `ui` on select.
  - `ui_error` on invalid drop and denied actions.
  - `zipper` when the inventory opens.

---

## 13. Text to cut or shorten

### 13.1 UI files (owned by the redesign)

| File | Current | New |
|---|---|---|
| `index.html` | `<title>Deadtide — Hawaiian Islands</title>` | `Deadtide` |
| `index.html` | `.loader-kicker` "A Hawaiian Islands survival game" | cut |
| `index.html` | `.loader-tagline` "Eight islands, one week after the outbreak. Scavenge the towns…" | cut |
| `index.html` | `.loader-tips` block: label "Tip" + 8 `<p class="loader-tip">` sentences | cut (whole block) |
| `index.html` | `.loader-time` "0:00" | cut |
| `index.html` | `aria-label="Loading Deadtide"` | `Loading` |
| `src/main.js` | `status( 'Entering the world' )` | `Entering world` |
| `src/main.js` | `status( 'Populating the area' )` | `Populating` |
| `src/main.js` | `status( 'Failed to start: ' + e.message )` | `Error` (message on a second line) |
| `src/main.js` | `.loader-time` update in `status()` | remove |
| `src/ui/UI.js` | `TIPS` (5 sentences: "Move with…", "Press Tab to check what you washed up with…", "Find a town. Look at loot…", "M opens the map. Double-click…", "T opens chat — type /help…") | caps rows (§4.13) |
| `src/ui/UI.js` | lockHint "Click to continue" | `Click to resume` |
| `src/ui/UI.js` | `announceSpawn`: "Creative mode — {where}. Double-tap Space to fly." / "You wake up on the shore. {where}." | cut (place card + `Space ×2 Fly` caps) |
| `src/ui/UI.js` | "You need a map (realistic map is on in Options)" | `No map` |
| `src/ui/UI.js` | `locationName` long form "{island} — near {town}" | `{island} · {town}` |
| `src/ui/UI.js` | `journal()` 10 advice sentences ("You are bleeding. Use a bandage or rags (right-click → Bandage) — blood loss kills.", … "You are holding up. Keep water and a bandage on you at all times.") | condition rows + remedy icons (§11.2) |
| `src/ui/UI.js` | journal title "Survival journal", sections "Condition", "This life", "Where" | `Status`; `CONDITION`, `THIS LIFE`; "Where" cut |
| `src/ui/UI.js` | journal labels "Infected killed", "Distance travelled", "Items looted", "Total infected killed" | `Kills`, `Distance`, `Looted`, `All time` |
| `src/ui/UI.js` | `✕` close in journal header | `back` icon + Esc |
| `src/ui/HUD.js` | compass readout "{deg}°  ·  {time}  ·  Day {n}  ·  {place}" | heading number only |
| `src/ui/HUD.js` | `minimap-label` (long location) | cut (place card) |
| `src/ui/HUD.js` | vital `title` "Body temperature {t} °C — outside {e} °C" | cut |
| `src/ui/HUD.js` | vital arrows `▲` `▼` | loss/gain trail |
| `src/ui/HUD.js` | condition pills with text ("Bleeding ×2", "Broken leg", …) | icon badges; label on first appearance only |
| `src/ui/HUD.js` | prompt `<span class="dim">hold</span>` | hold ring on key cap |
| `src/ui/HUD.js` | progress label "{label}…  (move to cancel)" | `{label}` |
| `src/ui/HUD.js` | weapon sub caliber/category line (always) | on switch only; category word for non-guns cut |
| `src/ui/HUD.js` | vehicle "Fuel", "Condition", "Gear {n}", "ALT {n} m" | icons + numbers |
| `src/ui/HUD.js` | pickup "{name} ×{qty}" | `{name}  +{qty}` |
| `src/ui/HUD.js` | fps "{n} fps" | `{n}` |
| `src/ui/HUD.js` | debug first line prefix "Deadtide — " | cut |
| `src/ui/InventoryUI.js` | header "Inventory" + sub "{w} kg carried — overloaded" | weight meter `11.2 / 30 kg` |
| `src/ui/InventoryUI.js` | "Double-click: use / equip · Shift-click: move · Right-click: actions · 1–9: hotbar" | cut |
| `src/ui/InventoryUI.js` | `✕` close | `Esc` cap button |
| `src/ui/InventoryUI.js` | h3 "Carried" + "{used} / {cap} space" | cut |
| `src/ui/InventoryUI.js` | Sort `title` "Sort every container by type and name" | `Sort` (icon button) |
| `src/ui/InventoryUI.js` | "Wear clothes with pockets or a backpack to carry more." | cut |
| `src/ui/InventoryUI.js` | Ground cap "{n} items" | `{n}` |
| `src/ui/InventoryUI.js` | "Drop items here" | cut (dashed cells) |
| `src/ui/InventoryUI.js` | "Empty" | cut (dashed cells) |
| `src/ui/InventoryUI.js` | h3 "Character" + "Creative"/"Day {n}", h3 "Weapons" | cut |
| `src/ui/InventoryUI.js` | "In hands: {name}" / "Hands empty" | cut (held dot) |
| `src/ui/InventoryUI.js` | slot labels "HEAD", "EYEWEAR", "FACE", "TOP", "VEST", "BACK", "GLOVES", "PANTS", "SHOES", "BELT", "SHOULDER", "SHOULDER 2", "HOLSTER", "MELEE" | slot glyphs; `title` keeps the name |
| `src/ui/InventoryUI.js` | char-stats labels "Weight", "Health", "Blood", "Body temp", "Outside", "Insulation", "Bite protection", "Wet", "Infected killed" | icon + value; "Weight" and "Infected killed" rows cut |
| `src/ui/InventoryUI.js` | item tag "HELD" | 5 px dot |
| `src/ui/InventoryUI.js` | tooltip cat line "{Category} · {rarity}" | `{CATEGORY} · {CONDITION}` |
| `src/ui/InventoryUI.js` | tooltip `d.desc` paragraph | cut |
| `src/ui/InventoryUI.js` | tooltip "Raw: cook it first", "Sealed: needs a can opener or a blade", "Alcohol: yes", "Splints fractures: yes" | tags `Raw`, `Sealed`, `Alcohol`, `Splint` |
| `src/ui/InventoryUI.js` | tooltip keys "Rate of fire", "Stops bleeding", "Treats infection", "Bite protection", "Hydration", "Calories" | `RPM`, `Bleed`, `Infection`, `Bite`, `Water`, `kcal` |
| `src/ui/InventoryUI.js` | tooltip hint "Double-click: {verb}" | `[mouseL]×2 {verb}` |
| `src/ui/InventoryUI.js` | deny "{name} doesn't go there" / "{name} doesn't go in that slot" | `Wrong slot` (on drag tag) |
| `src/ui/InventoryUI.js` | deny "It can't go inside itself" | `Not inside itself` |
| `src/ui/InventoryUI.js` | deny "Not enough room" / "Only part of it fits" | `No room` / `Partly moved` |
| `src/ui/InventoryUI.js` | "No room — dropped it" | `Dropped` |
| `src/ui/InventoryUI.js` | ctx hints "Shift-click", "Double-click", "hover + 1–9" | `⇧`, `2×`, `1-9` |
| `src/ui/InventoryUI.js` | ctx "Remove magazine", "Empty magazine", "Load rounds", "Insert magazine ({n})" | `Eject mag`, `Unload`, `Load`, `Insert mag` |
| `src/ui/InventoryUI.js` | ctx "Hold in hands", "Add to hotbar", "Remove from hotbar {n}", "Split stack" | `Hold`, `Hotbar`, `Unbind {n}`, `Split` |
| `src/ui/InventoryUI.js` | split popover title "Split {name}" | cut |
| `src/ui/InventoryUI.js` | "Crafting is not available." / "No recipes." | hide tab / nothing |
| `src/ui/InventoryUI.js` | recipe need text "{q}× {name}, …  · {tool} · at a {station}" | ingredient chips |
| `src/ui/InventoryUI.js` | catalog placeholder "Search items…" | `Search` |
| `src/ui/InventoryUI.js` | "{n} items · click to take one, Shift-click for a full stack, or drag" | `{n}` |
| `src/ui/InventoryUI.js` | "Nothing matches." | nothing |
| `src/ui/Menus.js` | title kicker "A Hawaiian Islands survival game" | cut |
| `src/ui/Menus.js` | menu hints "Last world", "Worlds" | world name / cut |
| `src/ui/Menus.js` | "Singleplayer" | `Worlds` |
| `src/ui/Menus.js` | title "Controls" item | cut |
| `src/ui/Menus.js` | "Credits" | `About` |
| `src/ui/Menus.js` | `.title-foot` "Terrain: AWS Terrain Tiles … Built with three.js · Deadtide v0.1" | `v0.1` (credits to About) |
| `src/ui/Menus.js` | worlds sub "Worlds are saved in this browser. Export them to keep a backup or move them to another computer." | cut |
| `src/ui/Menus.js` | "No worlds yet.<br>Create one to wash up on a beach somewhere in Hawaiʻi." | cut |
| `src/ui/Menus.js` | "Play selected world" / "Create new world" / "Import world…" | `Play` / `New world` / `Import` |
| `src/ui/Menus.js` | toast "Imported “{name}”" | `Imported` |
| `src/ui/Menus.js` | "That hardcore world is over — its survivor died." | `World over` |
| `src/ui/Menus.js` | delete confirm body "This world will be gone forever (export it first to keep a copy)." | cut |
| `src/ui/Menus.js` | row "seed {n}" | detail pane only |
| `src/ui/Menus.js` | row meta "Day {d} · {difficulty} · played {t} · {date}" | `Day {d} · {t}` + date right |
| `src/ui/Menus.js` | new world title "Create new world" + sub "Eight islands, the infected, and whatever you can find." | `New world` |
| `src/ui/Menus.js` | seed placeholder "Leave blank for a random seed" | `Random` |
| `src/ui/Menus.js` | 5 row hints ("Loot, the infected and events come from the seed", "Creative: fly, no hunger or damage, every item in the catalog", "How fast you get hungry and how hard the infected hit", "No cheats; the world ends when you die", "Real minutes per game day") | cut |
| `src/ui/Menus.js` | "World name", "Game mode", "Wash up on", "Start at" | `Name`, `Mode`, `Spawn`, `Start` |
| `src/ui/Menus.js` | "On — one life" | `On` |
| `src/ui/Menus.js` | "2 h 24", "24 min"… | `24 48 96 144` + `min` unit |
| `src/ui/Menus.js` | "Any island (random beach)", "Hawaiʻi (Big Island)" | `Random`, `Hawaiʻi` |
| `src/ui/Menus.js` | "Create world" | `Create` |
| `src/ui/Menus.js` | edit world "Survivor stats" "{n} infected killed · {n} deaths · {n} km walked" | stats row |
| `src/ui/Menus.js` | credits prose (3 paragraphs) + "Mahalo for playing. Stay off the beaches after dark." | About list; sign-off cut |
| `src/ui/Menus.js` | options sub "Saved automatically." | cut |
| `src/ui/Menus.js` | tabs "Display", "Key bindings" | merged into `Graphics`; `Keys` |
| `src/ui/Menus.js` | "Mouse sensitivity", "Invert mouse Y", "Show FPS", "Interaction hints", "Pick up ammo automatically", "Realistic map & compass (need the items)", "Tutorial tips", "Resolution scale", "Terrain detail" | `Sensitivity`, `Invert Y`, `FPS counter`, `Prompts`, `Auto-pickup ammo`, `Require map items`, `Control hints`, `Resolution`, `Terrain` |
| `src/ui/Menus.js` | "Reset to defaults" + confirm "Reset all options?" / "Key bindings are kept." | `Reset tab`; confirm `Reset options?` |
| `src/ui/Menus.js` | "Done" | cut (Esc / back) |
| `src/ui/Menus.js` | keybind title "Click, then press a key. Esc cancels, Backspace clears." | cut (listening caps) |
| `src/ui/Menus.js` | "Press a key…" | caret |
| `src/ui/Menus.js` | "Also bound to: {list}" | `Also: {list}` |
| `src/ui/Menus.js` | keybind empty `—` | empty |
| `src/ui/Menus.js` | "Reset key bindings" | `Reset keys` |
| `src/ui/Menus.js` | pause kicker "Day {n} · {name}" + h1 "PAUSED" | `{NAME} · DAY {n} · {time}`; h1 cut |
| `src/ui/Menus.js` | pause hints "Esc", "F1", "Game mode"; item "Controls" | Esc cap on Resume only; Controls cut |
| `src/ui/Menus.js` | "Switch to survival" / "Switch to creative" | `Survival mode` / `Creative mode` |
| `src/ui/Menus.js` | "Save world" / toast "World saved" / "Save & quit to title" | `Save` / `Saved` / `Quit to title` |
| `src/ui/Menus.js` | death kicker "You died" | cut |
| `src/ui/Menus.js` | "Cause of death: {cause}" | `{Cause}` |
| `src/ui/Menus.js` | death stats "Travelled", "Lives"; "Infected killed" | cut; `Kills` |
| `src/ui/Menus.js` | "Respawn on a beach" / "Quit to title" / "Back to title" | `Respawn` / `Quit` / `Title` |
| `src/ui/Menus.js` | "Your body — and everything you carried — stays where you fell. It is marked on your map." / "Hardcore: this world is over." | cut / `WORLD OVER` |
| `src/ui/Menus.js` | whole `controls()` screen: 33-row grid + 4 prose paragraphs ("Looting.", "Staying alive.", "The infected", "Commands.") + sub "Rebind keys in Options → Key bindings." + "Key bindings…" | cut; Options > Keys is the reference |
| `src/ui/MapUI.js` | sub "Drag to pan · wheel to zoom · double-click to mark · C to centre · Shift-click to teleport" | caps row (§6.1) |
| `src/ui/MapUI.js` | buttons "+", "−", "Me", "Islands", "Close" | icon rail; Close cut |
| `src/ui/MapUI.js` | legend "Freeway", "Highway / street", "Dirt road", "Building", "Marker", "Your body" (always visible) | collapsed popover; `Road`, `Body` |
| `src/ui/MapUI.js` | coords "{x}, {z}  ·  elev {n} m (real)  ·  {d} away" / "depth {n} m" | `{x} {z} · ▲ {n} m · {d}` / `▼ {n} m` |
| `src/ui/MapUI.js` | scale "{dist} (game)" | `{dist}` |
| `src/ui/MapUI.js` | marker label "Marker {n}" | `{n}` (editable in panel) |
| `src/ui/Chat.js` | "Welcome to Deadtide. Press T to chat, type /help for commands." | cut |
| `src/ui/Chat.js` | placeholder "Say something or type /help" | none |
| `src/ui/ui.css` | `.loader-tip*`, `.loader-kicker`, `.loader-tagline`, `.title-foot`, `.help-grid`, `.status` pills, `.tw-glass` on HUD | remove |

### 13.2 moduleTextToTrim (not editable by the UI; for module owners)

| File | Current | Proposed |
|---|---|---|
| `src/game/World.js` | "Loading the islands" / "Starting world workers" / "Loading materials" / "Building terrain" | `Terrain` / `Workers` / `Materials` / `Building terrain` |
| `src/core/Settings.js` | `DEFAULTS.showFps: true` | `false` |
| `src/core/Settings.js` | `BINDING_LABELS` "Interact / pick up", "Quick melee / shove", "Hold breath / zoom", "Climb (air / boat)", "Descend (air)", "Walk (hold)", "Free look (hold)", "Jump / vault", "Fire / attack", "Aim down sights", "Survival journal", "Debug overlay" | `Interact`, `Melee`, `Hold breath`, `Ascend`, `Descend`, `Walk`, `Free look`, `Jump`, `Attack`, `Aim`, `Status`, `Debug` |
| `src/weapons/Hands.js` | "Jammed — press R to clear it" | `Jammed` (HUD shows `R Clear`) |
| `src/weapons/Hands.js` | "Your spare magazines are empty — load them from the inventory" / "No magazine for the {gun}" | `Mags empty` / `No magazine` |
| `src/weapons/Hands.js` | "{ammo} don't fit a {mag}" / "{mag} doesn't fit the {gun}" / "Wrong ammunition for the {gun}" / "The {gun} takes magazines" | `Wrong calibre` / `Doesn't fit` / `Wrong ammo` / `Needs magazine` |
| `src/weapons/Hands.js` | "{att} attached to the {gun}" | `Attached` |
| `src/weapons/Hands.js` | "{gun}: {mode}" (fire-mode toast) | cut (HUD shows mode) |
| `src/weapons/Hands.js` | "No lighter — the rag is not lit" / "The batteries are dead" / "Pick it up first" | `No lighter` / `Dead batteries` / `Not carried` |
| `src/weapons/Hands.js` | "No room: dropped the empty magazine" / "No room: some rounds dropped" / "No room: dropped it" / "No room: dropped the magazine" | `Dropped` |
| `src/game/items/ItemUse.js` | "You need a knife or machete to cut this open" / "You need a can opener or a knife — or bash it open with a stone" / "You need a blade — a machete, a knife — to crack a coconut" | `Needs blade` / `Needs opener` / `Needs blade` |
| `src/game/items/ItemUse.js` | "You spill some of it opening it that way" / "That was raw…" | `Spilled some` / `Raw` |
| `src/game/items/ItemUse.js` | "You need a campfire to cook on — place a fire kit and light it" | `Needs fire` |
| `src/game/items/ItemUse.js` | "You have nothing to fill — find a bottle, canteen or pot" / "It needs to be raining, and you need to be outside" | `No container` / `No rain` |
| `src/game/items/ItemUse.js` | fill toast suffix " — boil it at a fire before drinking" | cut |
| `src/game/items/ItemUse.js` | "Tablets do nothing for salt — boil seawater at a fire instead" / "You have no dirty water to purify" | `Not for seawater` / `Nothing to purify` |
| `src/game/items/ItemUse.js` | "The infection is still there — keep treating it" / "Leg splinted — take it slow while it heals" / "You are no longer thirsty" | `Still infected` / `Splinted` / cut |
| `src/game/items/ItemUse.js` | "The {x} is dead — it needs batteries" / "Your {x} died — the batteries are flat" / "You have no batteries" | `Dead batteries` / `Dead batteries` / `No batteries` |
| `src/game/items/ItemUse.js` | "The panel needs direct sunlight" / "Nothing needs charging" | `No sun` / `Nothing to charge` |
| `src/game/items/ItemUse.js` | "The fire is laid. Light it with a lighter or matches (F)." | `Fire laid` |
| `src/game/items/ItemUse.js` | "The canister is empty — fit a propane canister" / "The stove is good for ten more meals" | `Empty canister` / `Refilled` |
| `src/game/items/ItemUse.js` | "Aim to look through the binoculars" / "You scan the horizon." | cut |
| `src/game/items/ItemUse.js` | "Empty its pockets first" | `Not empty` |
| `src/game/items/ItemUse.js` | "You learned something about {skill}" | `{Skill} +` |
| `src/game/items/ItemUse.js` | Flavour toasts: laptop "The battery is dead. Somebody's whole life is on it.", family photo, `RADIO[]`, `PHONE[]` | optional: keep as diegetic reading, but route to a subtitle line rather than the toast feed |
| `src/game/items/Fishing.js` | "You need a fishing rod" / "Stand at the water and look at it to cast" | `No rod` / `Face water` |
| `src/game/items/Fishing.js` | "You reel in… {x}. Great." / "You caught a {x}!" | cut (pickup feed shows the catch) |
| `src/game/items/Fishing.js` | "Missed it — and it took the bait" / "No room — it flops onto the ground" | `Missed, bait lost` / `Dropped` |
| `src/game/items/Fishing.js` | labels "Strike!" (sub "Something is biting"), "Reel in" (sub "Waiting for a bite…") | `Strike` (no sub), `Reel in` (no sub) |
| `src/game/Crafting.js` | "There is nothing left to burn — add firewood or sticks" / "You need sticks, firewood, planks or charcoal" | `No fuel` |
| `src/game/Crafting.js` | "You need a lighter or matches" / "The rain puts out the flame — try again" / "Fuel added — light it again" | `No lighter` / `Rained out` / `Fuel added` |
| `src/game/Crafting.js` | "No room — it is on the ground" / "{x} L of clean drinking water" | `Dropped` / `+{x} L water` |
| `src/game/Crafting.js` | prompt sub "Add sticks or firewood to relight it" | cut |
| `src/game/Survival.js` | "Your leg is broken — find a splint" / "Your stomach turns…" / "You are exhausted — find somewhere to sleep" | `Broken leg` / `Nauseous` / `Exhausted` |
| `src/game/Survival.js` | `msg()` toasts that duplicate a condition badge (bleeding, cold, overheating, hungry, thirsty, exhausted) | drop; the HUD badge label reveal covers them |
| `src/game/Water.js` | subs "Boil or distil it before drinking", "Salty — it will make you thirstier", "Slow, but clean" | `Salt water` / cut / cut |
| `src/game/Water.js` | "A few mouthfuls of rainwater" | cut (water core gain flash) |
| `src/world/Vegetation.js` | subs "Knock down a coconut", "No coconuts left", "Already picked" | cut / `Empty` / `Picked` |
| `src/game/Game.js` | "You can't sleep with the infected nearby" / "You aren't tired" / "You slept {n} hours" | `Infected nearby` / `Not tired` / `Slept {n} h` |
| `src/game/Commands.js` | `/help` line "Tab completes names. Up/Down recalls earlier commands." | cut |
| `src/game/Commands.js` | "Game mode: creative — double-tap Space to fly, the inventory has an item catalog" | `Creative` |
| `src/game/Commands.js` | "This deletes everything you carry. Type /clear confirm" / "Flying needs creative mode (/gamemode creative)" / "Needs creative mode" | `/clear confirm` / `Creative only` / `Creative only` |
| `src/game/Commands.js` | "Unknown command /{x}. Type /help" | `Unknown: /{x}` |

---

## 14. Implementation map (integration points kept)

| File | Changes | Must keep |
|---|---|---|
| `ui.css` | New `--dt-*` and `--fs-*` tokens and the `--u` formula (§2.1). Remove `.tw-glass` from the HUD. New classes: `.core`, `.badge`, `.place-card`, `.feedback`, `.caps`, `.key.hold`, `.arc`. Loader restyle. | `--gui` multiplies everything; `.tw-root [hidden]` rule; `tw-hidden` and `tw-error` loader classes |
| `HUD.js` | Dynamic visibility state machine (per-element `lastChange`, `linger`); cores as SVG; stamina and breath arcs; place card; feedback line; pickup merge; vehicle cluster; peek on `hideHud` tap | `attach()` events `toast`, `hitmarker`, `item:pick`; `game.hands.aiming / ammoInfo() / crosshairSpread()`; `vehicles.hud()` fields; `markers.list()`; `interact.target {key, hold, label, sub}`; `actions.busy / progress / current.label`; `S.conditions()`, `S.lastHitDir` |
| `UI.js` | Caps-row hints replace `TIPS`; `announceSpawn` leads to the place card; journal becomes Status | `show / closeScreen / screenOpts` semantics, `openContainer`, `confirm` promise API, `locationName`, hotkey routing, `_quickHeal` |
| `InventoryUI.js` | Full-screen layout, filter, verb tag on drag, hotbar strip drop target, compare in tooltip, chips in crafting | `move / _place / _dropOnItem / _quickMove` logic; `items3d.near / remove`; `dropStack`; `itemUse.actions / use`; `crafting.recipes / canCraft / craft`; `hands.*` loaders; `container:changed / container:close` emits |
| `Menus.js` | Typographic title and pause, worlds with detail pane, new world form, options tabs as in §10.2, About, death sequence | `saves.list / load / importWorld / exportWorld / duplicate / rename / delete`; `SaveSystem.newWorld`; `settings.get / set / applyPreset / resetAll`; `input.capture`; `prettyCode`; `app.startGame / quit`; `game.respawn / saveNow / commands.run` |
| `MapUI.js`, `MapView.js`, `maptile.js` | Icon rail, marker panel, collapsed legend, readout, label tiers, palette, base-tile underlay, tile fade | `MapView.draw( ctx, view, opts ) → { toScreen }` (used by the minimap); `markers.add / remove / list`; `commands.teleport`; `vehicles.known()` |
| `Chat.js` | Bubble-less lines, input restyle, suggestion columns | `events 'chat'`, `commands.complete / run / history` |
| `dom.js`, `itemIcons.js` | `ICON` extended with §3 paths; `GLYPH` restroked to 1.75 | `h()`, `icon()`, `fmtDist`, `setIcon`, `iconUrl` |
| `index.html`, `main.js` (strings only) | Loader markup trimmed; font weight 300 added; status strings | `.loader-status`, `.loader-pct`, `.loader-fill` selectors used by `status()` |

**New settings keys** (the UI treats `undefined` as the default): `hudMode` (`'dynamic'`), `hudBacking` (`'light'`).

**New UI-only per-world flags** (memory only): `seenHints{}` for the control hints.
