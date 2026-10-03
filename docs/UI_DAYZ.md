# DayZ-style UI direction

The user asked: "Can you make the UI more like DayZ". This document sets the target. It replaces the graphite and
orange look of docs/UI_SPEC.md wherever the two disagree. Where this document is silent, UI_SPEC still holds:
units (`--u`, GUI scale), legibility, short and plain text, keyboard support.

## What DayZ's UI is like (DayZ Standalone 1.x)

- **Almost nothing on screen.** There is no minimap, no compass, no ammo counter, no location card and no quest
  text. You read the world, not the HUD.
- **Status notifiers** sit in the bottom-right corner. They are a row of small monochrome icons: health, blood, food,
  water and body temperature, then the stance silhouette (standing, crouched, prone). Each icon is white when fine,
  yellow when low and red when critical. Small tendency arrows beside it (↑ ↑↑ ↑↑↑ / ↓ ↓↓ ↓↓↓) show which way the
  value is moving and how fast.
- **Badges** stack above the notifiers when something is wrong: bleeding (with a count), sick, poisoned, fracture,
  wet, cold, stuffed, and so on.
- **The stamina bar** is a thin white horizontal bar at the bottom centre. It shows only while stamina is not full,
  and it shrinks and flashes when you are exhausted.
- **The quickbar** is a row of small square slots at the bottom centre, numbered 1–9 and 0. Each slot holds an item
  icon. The bar shows while the inventory is open, or for a moment when you switch items. A dark translucent square
  sits behind each icon.
- **Interaction prompts** sit just right of screen centre. The target's name is in white caps on a dark strip,
  with the key and the action below it, e.g. `[F] Take`. When there is more than one action, the others are listed
  under it in grey and the scroll wheel picks one. There is no big tooltip card.
- **The crosshair** is a tiny dot, or nothing. Hits show only as a short red flash.
- **The inventory (Tab)** fills the screen with a dark, see-through overlay (black at roughly 60–75 %). It has square
  corners and thin 1 px lines, and is almost monochrome: white and greys, plus colour only for condition and danger.
  - **Header bars** are small, uppercase and tracked. They read VICINITY, INVENTORY, HANDS, then the name of each
    container ("HIKING BACKPACK").
  - **Left column, VICINITY.** It lists the ground items near you as a grid, and nearby containers as collapsible
    blocks (a car trunk, a cupboard, a body).
  - **Centre column.** It shows your 3D character, idle and lit softly against the dark, with the gear slots in two
    columns either side of the body.
    - Left of the body: headgear, mask, eyewear, gloves, armband.
    - Right of the body: body, vest, back, legs, feet.
    - Below the body: shoulder and melee (our primary, secondary, sidearm and melee).
    - An empty slot is a dark square with a faint grey silhouette glyph of what goes there.
  - **Right column, INVENTORY.** At the top is HANDS: the held item, with its attachment slots as a small row.
    Below it each worn container is listed in body order. Each one is a header bar (small icon, name in caps, weight
    or capacity right-aligned) above a **grid of square cells**. Items fill rectangles of cells that match their
    size (a can is 1×1, a rifle 2×5, a backpack 3×4…).
  - **Condition** shows as the tint of an item's cell background: no tint when pristine, grey when worn, yellow when
    damaged, orange when badly damaged, red when ruined.
  - **Inside each cell:** quantity (stack count, rounds) sits as small white digits in a corner. Liquid or fill level
    is a thin bar along the bottom edge. Wet items get a small blue drop and hot ones a small red dot.
  - **The item tooltip** is a dark box. It has the name in caps, a one-line description, then rows for condition (in
    its colour), weight, wetness, temperature and quantity.
  - **The right-click menu** is a plain dark list with no icons.
  - **Dragging** shows the item's rectangle following the cursor, outlined green where it fits and red where it
    doesn't.
  - **Crafting** happens by combining items (drag one onto another, or onto the item in your hands). That's our
    Combine. Our Craft tab can stay, styled to match.
- **Menus** use a dark, cinematic style. The main menu has the title in big uppercase letters and the options as
  a short list of uppercase text buttons (PLAY, OPTIONS, EXIT); the hovered one turns white and gets a thin bar. The
  death screen is "YOU ARE DEAD" in white caps on black, fading in. Options are a tabbed, flat list of label and
  value rows.
- **Type.** A condensed sans in uppercase for headers, labels and buttons (we use Google Fonts' **Roboto
  Condensed**), and a plain sans for body text (**Roboto**). Letter-spacing is about +0.06 em on caps. There is no
  monospace in the HUD, so use tabular figures.
- **Colour.**
  - Base: near-black see-through panels (rgba(0,0,0,0.62) for panels, rgba(0,0,0,0.45) for slots), white text at
    3 levels (#fff, #c8c8c8, #8a8a8a), 1 px lines at rgba(255,255,255,0.12).
  - Danger: a muted red #c33a32. Warning: a muted yellow #d8b23a. "Good" green only where DayZ uses it (a drop fits,
    an increase arrow): #6aa84f.
  - There's no orange accent any more. Selection and focus use white outlines and a lighter cell fill
    (rgba(255,255,255,0.14)).
- **Shape.** Square corners everywhere (radius 0–2 px), no drop shadows except a soft one behind floating
  tooltips and menus, no glassy blur.

## How we map it onto our game

- **Settings.**
  - New defaults are a **DayZ HUD**: minimap off, compass bar off, ammo counter off and location card off. The
    settings toggles keep them available: the existing `minimap` and `compass` settings, plus new `ammoCounter` and
    `locationCard`.
  - In realistic-map mode, the compass bar shows while a compass is in your hands; that's the DayZ way. Give the map
    item and a held compass their DayZ behaviour where it's cheap.
  - Existing players' saved settings keep what they chose. Only a fresh install gets the new defaults, through a
    settings version bump that resets just those keys once.
- **Our vitals map onto DayZ notifiers.**
  - Health, blood, food (hunger), water (thirst) and temperature (body temperature, cold or hot) each get an icon,
    a colour and a tendency arrow, worked out from the value's rate of change.
  - Stamina is the DayZ bar. Energy (sleep) is a sixth notifier, shown only when low.
  - Our conditions, mood moodles and pharmacy conditions become DayZ **badges** above the notifiers.
- **Our inventory model keeps its rules** (volume capacity per container, stacks, the slots), but each container
  is **drawn as a DayZ grid**.
  - Each container is `cols` cells wide; capacity 30 is 6×5, for instance.
  - Each item's rectangle comes from its `size` (volume), and items are auto-packed in order.
  - If packing fragments, the grid grows by a row rather than refusing what the volume rules allow. Auto-arranging
    is fine: no manual positioning.
- **The character preview.** A small Three.js render into a canvas in the centre column shows a living Rocketbox
  survivor avatar (src/ai/Characters.js: CharacterLib/CharacterInstance; pick the avatar by the worn torso and legs
  where possible, e.g. board shorts → m_swim). It plays an idle pose, under soft studio light on a dark gradient,
  and slowly turns with mouse drag. It renders only while the inventory is open and stops rendering when closed. It
  must not hurt frame time in the game or leak memory; one small render target is enough.
- **Everything else stays working:**
  - drag and drop between all places, item-on-item Combine with its verb chip, the context menu and its Combine
    submenu, split stacks, search, the Craft tab, the Catalog in creative mode;
  - the hotbar and binding keys, tooltips (dishes, books, liquids, ammo), keyboard navigation, GUI scale, the
    1280×720 to 4K layout.
