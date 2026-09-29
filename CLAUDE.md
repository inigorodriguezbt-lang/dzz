# Deadtide — notes for contributors and agents

## Testing in this container (no GPU)
- Launch headless browsers through `test/lib/browser.mjs` (`launch()`, then `lean( page )`). It uses Mesa's lavapipe
  (ANGLE → Vulkan → llvmpipe): a full game boot takes ~40 s instead of minutes, and it doesn't stall or run out of
  memory like SwiftShader does. If `/tmp/deadtide-hs-lvp/headless_shell` is missing, run `test/lib/make-lvp-shell.sh`.
  `test/probe.mjs`, `test/shot.mjs` and `test/preview/session.mjs` already use it.
- Memory: the whole container shares ~15 GB. One game page can take 3–5 GB. Keep at most ONE browser open at a time,
  close it as soon as you have your screenshots, and never leave a Playwright process running in the background.
- Batch many checks into one boot (`test/preview/session.mjs <url> <outdir> <steps.json>`) instead of booting per check.
- Save screenshots as JPEG (`page.screenshot( { type: 'jpeg', quality: 85 } )`) under your own directory in /tmp.
- Quick start: `http://127.0.0.1:<port>/?quick=1&mode=creative&at=<x>,<z>&yaw=<deg>&hour=<h>`; `window.__app`, `__world`.
- Node checks: `node test/logic.mjs`, `node test/items.mjs`, `node test/weapons.mjs`.

## Code
- Three.js r186 WebGLRenderer (WebGL2), GLSL via `patchMaterial` (src/render/Materials.js) — lit materials must use it.
- Style: tabs, spaces inside parentheses `fn( a, b )`, ES modules, short comments that explain why.
- Player-facing text: short and plain (verbs for prompts, a few words for toasts, no flavour text).
- Module contracts and shared item ids: docs/ARCHITECTURE.md. UI design: docs/UI_SPEC.md.
