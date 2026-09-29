# Deadtide ← Tidewater: rendering port plan

Plan only. No code has been changed. The inputs are:

- `docs/fidelity/diff.md`: a source-level diff of both renderers, with every constant (referred to below as "diff §n").
- `docs/fidelity/ref/*.jpg`: 3 real screenshot pairs and 8 Deadtide-only views. I reviewed all 14 images.
- The Tidewater source at `/tmp/claude-0/-home-user-dzz/958079a3-5be3-5eb7-94c2-8118c5e0c0a0/scratchpad/tidewater` (MIT).

Tidewater's `main` branch is raw WebGPU with **WGSL** shaders, not TSL. Porting to GLSL ES 3.0 is therefore a mechanical translation; diff.md §A is the cheat sheet. Compute kernels become full-screen fragment passes into float render targets.

Paths below are written `TW:src/...` (Tidewater) and `DT:src/...` (ours). `file:123` means a line number in that file as it was checked out when this plan was written. Priorities are global, and **1 means the highest visual impact**.

---

## 0. The gap, from the screenshots

| # | What the pairs show | Measured (DT vs TW) | Root cause | Tasks |
|---|---|---|---|---|
| 1 | Milky, over-exposed, flat frames with a pale sky everywhere | Noon: mean luma 192 vs 116, SD 25 vs 52, 5th percentile 157 vs 11, saturation 0.14 vs 0.39. Zenith (166,189,207) vs (37,75,126). | The sky LUT is scaled 22 and the sun 3.4 (TW uses 11 for both), so the direct:ambient ratio is 1.07 against TW's 7.7. Exposure is a fixed 1.0 where TW uses 0.55 × auto (≈0.33 on a beach). The grade is display-referred, and bloom has a threshold. | LPS-1, LPS-2 |
| 2 | Sunset (18:21) and night: a black sky with white glowing clouds | Luma 3 and 8 | Bug: `atmRaySphere` treats a miss as a hit. There is no multiple scattering. Clouds get a painted ambient. | LPS-0, LPS-1, LPS-4, LPS-9 |
| 3 | Grey-khaki sand; lime grass with a blue channel of about 0; greenish shade | Sand albedo 0.33 vs 0.66–0.79. Grass 2× TW and yellower. Shade (113,115,83) vs neutral-cool. | Photo textures are repainted with the wrong palette. The IBL paints a bright warm ground under the horizon. | TER-1, LPS-1 (env ground), LPS-3 |
| 4 | Pale cyan-white water with white "venetian blind" streaks, no depth colour and no seabed | Sea (222,232,231) vs a turquoise (50,112,110) → blue (70,104,139) gradient | `R.y = abs( R.y )` reflections, Schlick F0 0.02, a painted scatter mix, and a straight-ray column 1.75–2.8× too absorbing | WAT-1 |
| 5 | Soft grey blob clouds, darker than the sky at noon; no silver linings and no small distant clouds | n/a | A 2-D fbm slab at quarter resolution with no temporal reconstruction | LPS-4 |
| 6 | Nothing is grounded; uniformly soft shadows with a halftone stipple; aliased fronds and power lines | n/a | No AO, one shadow map with IGN-rotated PCF and no TAA to resolve it, MSAA only | LPS-5, LPS-7, LPS-8 (LPS-0 hides the stipple) |
| 7 | Wide-angle framing; empty beaches | FOV 80° vs 62° | Settings default; no props or clutter | lead / other modules (§5) |

**Milestone M1** (LPS-0, LPS-1, LPS-2, TER-1, WAT-1, and the FOV change from the lead) fixes rows 1–4 and most of row 7's framing. This is where most of the "not even close" goes away. M2 is sky and air (LPS-4, LPS-3, LPS-5, LPS-6). M3 is surfaces (TER-2, TER-3, TER-4, WAT-2, WAT-3). M4 is image quality and depth (LPS-7, LPS-8, WAT-4, and the rest).

---

## 1. Rules for every porter

1. **Port, don't reinvent.** Translate the cited TW function line by line, with the same maths, constants and order of operations. Our own inputs (land-use masks, real sun path, moon phase, gameplay effects) plug into TW's structure; they do not replace it.
2. **Licence header.** Start every ported file, or ported block inside an existing file, with `// Ported from Tidewater <TW path> (MIT, see LICENSE-Tidewater.txt)`.
3. **Do not copy** `TW:public/clouds/baseShape64.bin` or `blueNoise.bin`. `TW:public/clouds/LICENSING.md` says they fall under the Three.js Sky Pro licence. Generate the noise instead (LPS-4). All TW code is MIT (TW README "Credits and license").
4. **Units.** TW metres are our world units (the world is 1:8 horizontally and 1:6 vertically; `world.json` hScale 0.125, vScale 0.1667). Use TW's metre constants unchanged, in world units. The only exception is atmosphere altitude, which stays in real metres (`y · 6`, as today).
5. **Owners and files are disjoint.**
   - **light-post-sky**: `DT:src/render/Renderer.js`, `Materials.js`, `Atmosphere.js`, `DT:src/world/Sky.js`, `DT:src/game/World.js` (lights, shadows, camera), `DT:src/game/Weather.js` (visual parameters). May create new files under `DT:src/render/post/` and `DT:src/render/sky/`.
   - **terrain**: `DT:src/world/Terrain.js`, the terrain handlers in `DT:src/workers/world.worker.js` (it may add new handlers there: `detailTexture`, `heightGrid`), and `public/textures`. May create new files under `DT:src/world/terrain/`.
   - **water**: `DT:src/world/Ocean.js`. May create new files under `DT:src/world/ocean/`, including its own worker `ocean/shore.worker.js`.
6. **Quality tiers.** Every new pass reads an existing setting (`clouds`, `shadows`, `antialias`, `bloom`, `water`, `terrainDetail`) or `settings.get( 'ao' ) ?? true` until the lead adds the new keys (§5).
7. **Headless checks.** Use lavapipe via `test/lib/browser.mjs`, one browser at a time, and batch many views into one boot (`test/preview/session.mjs`, see §6). Lavapipe is a CPU rasteriser, so judge colour and tone, not speed. For cost, count passes and draws (`__app.renderer.gl.info`).
8. **Style and repo.** Tabs, `fn( a, b )`, short comments that explain why. No git commands; the lead commits.

---

## 2. Contracts between owners (agree before coding)

### 2.1 Energy scale (after LPS-1 + LPS-2)
- Scene-linear HDR with `SUN_ILLUMINANCE = 11`. Sun colour at 60° ≈ (10.26, 9.35, 8.06), at 30° ≈ (9.75, 8.31, 6.43), at 5° ≈ (6.02, 2.77, 0.71). Sky E/π at 30° ≈ (0.091, 0.179, 0.381).
- Tone mapping: ACES(`c · 0.55 · auto / 0.6`), with auto ∈ [0.6, 6] (at most 2 at night).
- Albedos are physical linear values (TW palettes).
- **Emissives must be re-tuned by their owners.** Effective exposure on a sunny beach falls from 1.0 to ≈0.33, and at night from 2.4 to ≤1.1 (§5).

### 2.2 Shared uniforms in `G` (`DT:src/render/Materials.js`, owned by light-post-sky)

| Uniform | Type | Written by | Read by | Lands in |
|---|---|---|---|---|
| `uFrame` | float (frame % 1024) | Renderer | IGN, grain, Bayer | LPS-0 |
| `uSkyIrr` | vec3, sky E/π including night ambient | Sky | water foam, vegetation, clouds, haze | LPS-1 |
| `uHorizon` | vec3 | Sky | water below-horizon reflection | LPS-1 |
| `uTransLUT`, `uMultiLUT` | sampler2D | Sky | sun disc, clouds, `skyLuminance` | LPS-1 |
| `uAtmoR` | float (camera radius, km) | Sky | sky-view uv mapping | LPS-1 |
| `uSkyLUT` | now the 192×108 sun-relative sky-view LUT | Sky | everyone, via `skyLutUv` / `skyLuminance` | LPS-1 |
| `uHillShadow`, `uHillShadowRect`, `uHillShadowOn` | sampler2D, vec4, float | **terrain** (TER-4). Declared by light-post-sky in LPS-0 with a 1×1 white default | `terrainSunShadowAt` | LPS-0 / TER-4 |
| `uHazeDensity` | float (1.6 × weather) | Weather | `atmosphereFog` | LPS-6 |
| `uCloudShadow`, `uCloudShadowRect` | sampler2D 256², vec4 | Clouds | `cloudShadowAt` | LPS-4 |
| `uCloudPano` | sampler2D 512×160 | Clouds | `skyReflectionRadiance`, env | LPS-4 |
| `uCsmMat[3]`, `uCsmSplit`, `uCsm0` (raw), `uCsm1`, `uCsm2` (sampler2DShadow) | | World | `dtSunVis`, `sunShadowPCF` | LPS-8 |
| `uBounceMap`, `uBounceRect`, `uBounceOn` | | **terrain** (TER-6). Declared by light-post-sky in LPS-10 | `groundBounce` | LPS-10 / TER-6 |

### 2.3 GLSL API (`COMMON_GLSL` and `patchMaterial`, owned by light-post-sky)

Signatures stay stable; only bodies change. `Ocean.js` and every module's `patchMaterial` users compile against these names.

- `vec2 skyLutUv( vec3 d )` keeps its name. From LPS-1 it returns TW's sun-relative sky-view uv, so existing `texture2D( uSkyLUT, skyLutUv( d ) )` calls keep working.
- `vec3 skyLuminance( vec3 d )` (LPS-1): TW `atmosphereSkyLuminance`.
- `vec3 skyReflectionRadiance( vec3 d )`: sky plus moonlit sky in LPS-1; clouds are added in LPS-4 (TW `Sky.js:185`).
- `vec3 atmosphereFog( vec3 col, vec3 wp )` keeps its name. LPS-6 replaces the body with TW's two-layer haze.
- `float cloudShadowAt( vec3 wp )` keeps its name. LPS-4 makes it sample the 256² cloud shadow map.
- `float terrainSunShadowAt( vec3 P )` (LPS-0): the TW `TerrainGPU.js:285` formula. Returns 1 until `uHillShadowOn`.
- `vec3 groundBounce( vec3 P, vec3 Nw )` (LPS-10). `float sunShadowPCF( vec3 P, vec3 Nw )` (LPS-8, for ShaderMaterials such as the ocean).
- Locals inside every `patchMaterial` fragment:
  - `float dtAO = 1.0;` is declared at the top of `main()`. Material code may lower it (terrain baked AO, vegetation canopy AO). `patchMaterial` applies it to indirect diffuse and as Lagarde specular occlusion (LPS-3). Three's `computeSpecularOcclusion` is the same formula as TW's.
  - `float dtSunMod = 1.0;` is a material-specific key-light modulation (terrain meadow self-shading, TER-4).
  - `float dtSunVis` is computed by `patchMaterial` as: three's shadow (until LPS-8) × `cloudShadowAt` × `terrainSunShadowAt` × `dtSunMod`. It is applied to **directional light 0 only**, which is the key light (sun or moon), and never to point or spot lights. It stays readable after the lighting chunk, so vegetation translucency can use `uSunColor · dtSunVis`.
- Opt-out defines: `NO_ATMOS_FOG` (exists), `NO_SUN_VIS` and `NO_GROUND_BOUNCE`. The view model uses all three, because it lives in its own scene.

### 2.4 Renderer targets
- `renderer.sceneColor` returns `T.beauty` (opaque × AO) from LPS-5. `renderer.sceneDepth` is unchanged (opaque depth).
- New getters: `renderer.mainDepth` (depth texture including water, LPS-6), `renderer.frame`, and `camera.userData.projNoJitter` (LPS-7). Every pass that rebuilds positions from depth must use the unjittered projection.
- `renderer.resetExposure()` snaps the eye adaptation after a teleport or a time jump (LPS-2).

### 2.5 Changes the lead should commit together
- **LPS-1 + LPS-2 + the one-line water change** `Ocean.js:176`: `texture2D( uSkyLUT, vec2( 0.5, 0.9 ) )` becomes `uSkyIrr`. That fixed uv is meaningless after the LUT remap, and the scale change looks wrong until the exposure lands.
- The LPS-3 `dtAO` hook lands before TER-3 and before vegetation's AO change.

---

## 3. Task queue (ordered by visual impact)

| Pri | ID | Owner | Task | Needs | M |
|---|---|---|---|---|---|
| 1 | LPS-0 | light-post-sky | Cheap bug fixes: atmosphere miss, moon size, cloud shadow on the key light only, grain/dither, shadow stipple | none | M1 |
| 2 | LPS-1 | light-post-sky | Hillaire atmosphere, one SUN_ILLUMINANCE, TW light colours, env without the painted ground | LPS-0 | M1 |
| 3 | LPS-2 | light-post-sky | Exposure 0.55 × auto exposure, scene-referred grade, TW bloom, dither | with LPS-1 | M1 |
| 4 | TER-1 | terrain | TW albedo palette on the current shader (sand, meadow, forest, rock, wet sand) | none | M1 |
| 5 | WAT-1 | water | Water shading port: exact Fresnel, TW water column, Snell path, horizon occlusion, SSR, spec | LPS-1 | M1 |
| 6 | LPS-4 | light-post-sky | Volumetric clouds (SkyProClouds port with our own noise), panorama, cloud shadow map | LPS-1 | M2 |
| 7 | LPS-3 | light-post-sky | Environment capture (sky + clouds, amortised), `dtAO` and specular occlusion hook | LPS-1 | M2 |
| 8 | LPS-5 | light-post-sky | GTAO + beauty target | LPS-2 | M2 |
| 9 | LPS-6 | light-post-sky | Two-layer haze in `atmosphereFog`, then volumetric sun shafts and god rays | LPS-1 | M2 |
| 10 | TER-2 | terrain | Procedural detail texture + TerrainShading + TW surface shader (sand ripples, wet band, meadow, canopy, rock) | TER-1 | M3 |
| 11 | WAT-2 | water | Remove inland pools (sea-connectivity mask) | none | M3 |
| 12 | LPS-7 | light-post-sky | TAA (TW TemporalUpscale at native scale) + RCAS; retire MSAA | LPS-2 | M4 |
| 13 | LPS-8 | light-post-sky | 3 sun cascades + PCSS (TW Shadows.js + lighting.js) | LPS-7 | M4 |
| 14 | TER-4 | terrain | Heightfield hill shadow bake + meadow sun modulation | LPS-0 | M3 |
| 15 | TER-3 | terrain | Baked horizon AO + cavity per vertex → `dtAO` | LPS-3 | M3 |
| 16 | WAT-3 | water | Shore waves: travel-time shore field, shoaling/breaking profile, bores, swash, surf foam | WAT-1 | M3 |
| 17 | LPS-9 | light-post-sky | Night sky: TW stars, moon disc, moonlit sky | LPS-1 | M4 |
| 18 | LPS-10 | light-post-sky | Ground-bounce shading hook | TER-6 | M4 |
| 19 | TER-6 | terrain | Ground-bounce bake | TER-4 | M4 |
| 20 | WAT-4 | water | FFT ocean (4 cascades) + Jacobian foam + CPU height query | WAT-1 | M4 |
| 21 | WAT-5 | water | TW foam texture + sea detail (cat's paws, slicks) | WAT-4 | M4 |
| 22 | LPS-11 | light-post-sky | Lens flare | LPS-2 | M4 |
| 23 | WAT-6 | water | Breaker lip ribbon + spray, ShoreSim wetness → terrain, caustics | WAT-3 | M4 |
| 24 | TER-5 | terrain | (optional) Finer near mesh with sub-metre procedural relief | TER-2 | M4 |
| 25 | LPS-12 | light-post-sky | (optional) Motion blur | LPS-7 | M4 |

---

## 4. Task specifications

Each task gives: **Port** (TW source), **Change** (ours), **Done when** (checked against §6), and pitfalls.

### LPS-0: Cheap bug fixes (pri 1, light-post-sky)
**Port:** `TW:src/sky/Sky.js` skyMoon 138–147 (disc radius 0.0048 rad, colour (0.9, 0.92, 1)·3); `TW:src/post/PostFX.js` postHash 502–507 plus the dither in the final pass.

**Change:**
1. `Atmosphere.js:18`: make `atmRaySphere` return `vec2( -1.0 )` on a miss. Today `(1e9, -1e9)` makes `g.x > 0.0` treat a sun ray that misses the planet as blocked, so everything above R·e²/2 goes black at sunset and the horizon gets a black band (diff §0 bug 1).
2. `Sky.js:196–205`: moon disc threshold `mm > 0.9995` becomes `mm > 0.9999885` (cos 0.0048), and the divisor `0.0316` becomes `0.0048`. Keep our phase terminator; use TW's colour.
3. `Materials.js:107–111`: remove `reflectedLight.direct* *= cs`, which also darkens lamps under clouds. Add the `dtSunVis` hook from §2.3:
   - declare `float dtAO = 1.0; float dtSunMod = 1.0;` right after `void main() {`;
   - compute `dtSunVis = cloudShadowAt( vWorldPos ) * terrainSunShadowAt( vWorldPos ) * dtSunMod` before `#include <lights_fragment_begin>`;
   - in that chunk, replace `getDirectionalLightInfo( directionalLight, directLight );` with the same call followed by `if ( UNROLLED_LOOP_INDEX == 0 ) directLight.color *= dtSunVis;` (three unrolls the loop, so the index is a literal);
   - skip all of this under `NO_SUN_VIS`.
   Also add the `uHillShadow*` stubs and `terrainSunShadowAt` (TW formula: `w = occ·0.012 + 0.35`, `mix( 1, smoothstep( -w, w, P.y - top ), uHillShadowOn )`), and `uFrame`.
4. `Renderer.js:247, 283`: replace the `sin` hash grain with TW `postHash( uvec2( gl_FragCoord.xy ), uint( uFrame ) )`. Add a ±1/255 triangular dither after `toSRGB`, from two hashes.
5. `World.js:73`: `L.shadow.radius = 1`. r186's PCF is 5 IGN-rotated Vogel taps meant for TAA, and at radius 2 it prints the halftone stipple seen in dt-palms and dt-forest. This is removed by LPS-8.
6. Fix the `Renderer.js:2` comment: there is one shadow map, not cascades.

**Done when:** dt-sunset has a lit twilight sky (no sky pixel below RGB 10); dt-night shows a small moon; no stipple on sand or forest floor; street lamps no longer dim when a cloud passes.

### LPS-1: Hillaire atmosphere and one energy scale (pri 2, light-post-sky; commit with LPS-2)
**Port:** `TW:src/sky/Atmosphere.js`, all 532 lines:
- constants 24–58: SUN_ILLUMINANCE 11; SUN_ANGULAR_RADIUS 0.004675·1.15; RG 6360 and RT 6460 km; Rayleigh (5.802, 13.558, 33.1)e-3 /km with H 8; Mie scattering 3.996e-3 and extinction 4.44e-3 with H 1.2 and g 0.8 (Cornette-Shanks); ozone (0.65, 1.881, 0.085)e-3 as a tent at 25 ± 15 km; ground albedo (0.06, 0.08, 0.1);
- `atmosphereMedium` 59, `atmosphereTransmittanceUV` 74, `atmosphereRaySphereNearest` 88, `atmosphereSampleTransmittance` 167, `atmosphereTransmittanceToSpace` 171, `atmosphereSampleMultiScat` 182, `atmosphereSkyLuminance` 197;
- kernels: transmittance 234 (256×64, 40 steps); multi-scatter 272 (32×32, 8×8 directions × 20 steps, `Lms = Lin/(1 − fms)`); sky-view 348 (192×108, 32 quadratic steps, azimuth relative to the sun `u = sqrt( 0.5 − 0.5·cos )`, horizon-aware v); irradiance readback 439 (sky E/π over 16×16 cosine-weighted, horizon colour over 16 azimuths at y 0.03);
- `update()` 471–513 (rebuild rules; view height quantised to 2 m below 100 m, then 2 % log steps).

Also port the light colours from `TW:src/App.js` updateSun 440–458 and applyAtmosphereReadback 460–478, and from `TW:src/sky/Sky.js` skySunDisk 86–99, skyRadiance 168, skyRadianceWithClouds 176, skyReflectionRadiance 185 and skyViewRadiance 192–247.

**Change:**
- `Atmosphere.js`: replace the single-scattering `ATMOS_GLSL` with the ported functions (km units), and export `SUN_ILLUMINANCE` and `SUN_ANGULAR_RADIUS`. Add the LUT owner (a class in this file or `src/render/sky/AtmosphereLUT.js`) with three RGBA HalfFloat targets:
  - transmittance 256×64 and multi-scatter 32×32, built once at start;
  - sky-view 192×108, rebuilt when the sun moves more than 0.0005 rad or the quantised camera altitude changes.
  Each kernel is one full-screen `ShaderMaterial` draw, with the WGSL loops kept. Replace `transmittanceCPU` with a JS port of TW's 40-step transmittance, so the sun colour has no readback lag. **Keep** `sunDirection()`: our real sun path at 20.5° and day of year, not TW's 24° / 6°.
- Readback: every 0.25 s, one pass computes sky E/π and the horizon colour into a 2×1 RGBA FloatType target, read with `gl.readRenderTargetPixelsAsync` (r186 `WebGLRenderer.js:3216`). The results go to `sky.skyIrradiance` and `G.uSkyIrr` (+ `0.012·night·(0.6, 0.7, 1)`), and to `sky.horizonColor` and `G.uHorizon`.
- `Materials.js` `COMMON_GLSL`: `skyLutUv( d )` now returns the sky-view uv. Add `skyLuminance( d )` and `skyReflectionRadiance( d )`, and the G uniforms listed in §2.2. **The LUT wrap mode must be ClampToEdge**, not Repeat as at `Sky.js:57`.
- `Sky.js`:
  - `update()`:
    - sun colour = T(sea level, sun) × 11 × `smoothstep( -0.03, 0.02, sunY )` (App.js:466–470);
    - `night = smoothstep( 0.02, 0.18, -sunY )` (App.js:447);
    - the key light is the sun while sunY > −0.07, then the moon. Moon colour = (0.6, 0.7, 1.0)·0.12·night × our phase factor (0.3 + 0.7·moonBright) × nightBrightness. Keep our real moon direction and phase.
  - `World.js:108`: switch to the moon at −0.07 (today −0.05).
  - Dome = TW skyViewRadiance: `skyLuminance` + skySunDisk × cloud transmittance + moon + stars + clouds. The sun disc has radius 0.00538, edge `smoothstep( 1, 0.9, r )`, limb darkening `1 − 0.6( 1 − μ )`, radiance `T·2500`, faded by `smoothstep( -0.02, 0, dir.y )`. **Delete** our `disk·60`, the `pow( μ, 900 )·1.6` glow and the horizon-band blend (`Sky.js:214–217`): TW's horizon is the atmosphere itself, which keeps the sea horizon crisp.
  - Env sphere (`Sky.js:238–245`): **delete the painted warm ground and the overcast greying now**. The ground term scales with `uSunColor`, which grows 3.2×, and would light every vertical surface from below. Paint the full sphere from `skyLuminance` and set `environmentIntensity = 1`.
  - Interim cloud ambient until LPS-4: `uAmbTop = uSkyIrr·π·0.7`, `uAmbBottom = uAmbTop·0.5`.
- `Weather.js:59`: stop writing `sky.haze`. TW keeps Mie at scale 1; haze moves to LPS-6. Keep `G.uFogBoost` until then.

**Done when** (together with LPS-2):
- dt-beach-sea-noon zenith is within ±20 of sRGB (31, 68, 120), 30° up ≈ (67, 110, 156), horizon ≈ (155, 171, 173);
- dt-sunset keeps an orange-pink glow toward the sun and a blue-violet anti-sun sky;
- in the console, `__app.game.world.sky.sunColor` at 30° ≈ (9.75, 8.31, 6.43) and `skyIrradiance` ≈ (0.091, 0.179, 0.381), within 5 %.

**Pitfall:** float readback needs `EXT_color_buffer_float`. Fall back to the CPU transmittance and the last value.

### LPS-2: Exposure, grade, bloom, dither (pri 3, light-post-sky; commit with LPS-1)
**Port:** `TW:src/post/PostFX.js` ACES 36–60, `_buildBloom` 323–392, `_buildMeter` 394–456, `_buildFinal` 458+ (postHash 502, final fragment 517+), and `TW:src/App.js:79` (exposure 0.55).

**Change** (`Renderer.js`):
- **Bloom:**
  - 5 levels (1/2 … 1/32; today 6);
  - the first downsample Karis-averages the 5 Jimenez boxes (centre box 0.5, 4 corner boxes 0.125, each weighted by `c/(lum(c)+1)`) and is undone right after with `s / max( 1 − lum( s ), 0.02 )` (PostFX.js:337–360);
  - **remove the threshold and the 60 cap**; strength 0.05.
- **Auto exposure:**
  - two 1×1 FloatType targets, ping-ponged. The meter pass loops over `T.bloom[ 3 ]` (1/16) with `texelFetch`:
    - `l = log2( max( lum, 1e-4 ) )`, weighted by `w = max( 1 − |uvc·( 1, 1.4 )|·1.2, 0.15 )`;
    - `avg = exp2( Σwl/Σw )`, `ratio = 0.25/avg`;
    - `target = clamp( ratio > 1 ? pow( ratio, 0.8 ) : ratio, 0.6, mix( 6, 2, uNight ) )`;
    - `k = 1 − exp( −dt·( target > cur ? 1.6 : 1.1 ) )`, `next = exp2( mix( log2 cur, log2 target, k ) )`;
  - `dt` comes from the Renderer's own clock, clamped to 0..0.1 s;
  - the grade reads the value with `texelFetch`; there is no CPU readback;
  - `renderer.resetExposure()` snaps to the target.
- **Grade shader,** in TW's order:
  1. `c = scene + bloom·0.05`, then `c *= auto × ( f.grade.exposureBias ?? 1 )`;
  2. warmth `c *= ( 1.02, 1, 0.98 )`, saturation `mix( lum, c, 1.06 )`, contrast `pow( max( c, 0 )/0.18, 1.04 )·0.18`;
  3. vignette `1 − smoothstep( 0.25, 0.75, length( ( uv − 0.5 )·( 1, 0.8 ) ) )·0.28`;
  4. grain `c += c·n·0.012`, with n triangular from `postHash( pixel, frame )`;
  5. our low-blood desaturation;
  6. `ACES( c·0.55/0.6 )`;
  7. our display-space effects (underwater tint, damage rim, low-blood vignette, flash);
  8. sRGB, then the ±1/255 triangular dither, then fade.
- **Delete** the display-referred saturation/contrast/warmth, the night tint (0.86, 0.95, 1.18) and the additive grain. **Ignore** `f.grade.exposure` and `f.grade.night`; the lead moves `Game.js` to `exposureBias` (§5). Keep FXAA and MSAA until LPS-7.

**Done when** (dt-beach-sea-noon, metric script in §6): mean luma 105–130 (TW 116), SD ≥ 45 (52), 5th percentile ≤ 40 (11), saturation ≥ 0.30 (0.39); no 8-bit bands in the dt-aerial sky; walking from beach to forest shade re-adapts in 1–2 s.

### TER-1: Tidewater palette on the current terrain shader (pri 4, terrain)
**Port:** `TW:src/world/terrain/TerrainShading.js` `srgb()` 25–32, PALETTE 48–65, MEADOW 66–76, terrainMeadowTone 254–278, terrainSaturation 237. `TW:src/world/Terrain.js`: sand colours 349–370, laterite 345–348, canopy and forest-floor colours 474–487, wet film and roughness 552–591.

**Change** (`Terrain.js` `TERRAIN_ALBEDO` only; keep the structure and our land-use weights):
- **Sand:** base = mix( srgb(0.83, 0.75, 0.60), srgb(0.90, 0.84, 0.72) ) by macro noise and height, plus a warm drift srgb(0.84, 0.72, 0.55)·0.45. The photo sand becomes luminance detail only (×0.85–1.15). **Delete** `mix( lum, sand, 0.55 )·( 1.62, 1.52, 1.34 )` (`Terrain.js:303`). Target linear luminance 0.52–0.69.
- **Wet sand:** replace `×( 0.62, 0.6, 0.56 )` and roughness −0.25 with TW's wet film: albedo ×0.58, saturation 1.15, tint (0.97, 0.98, 1.0), roughness `mix( 0.42, 0.16, wet )`, damp band `smoothstep( 1.7, 0.5, h )`.
- **Meadow, grass, pasture and lawn:** the TW MEADOW palette converted to linear:
  - lush (0.0153, 0.0331, 0.0039), green (0.0509, 0.0835, 0.0100), olive (0.1065, 0.1128, 0.0174);
  - yellow (0.2140, 0.1789, 0.0331), straw (0.3424, 0.2530, 0.0890), soil (0.0245, 0.0153, 0.0072).

  Convert with TW's `srgb()` rather than copying these numbers.

  Mix them with `terrainMeadowTone`, fed by our moisture, slope and south exposure, and by our `fbm2` in place of mA/mB until TER-2. **Delete** the `grassT / lg` renormalisation (`Terrain.js:261–272`), which multiplies texture contrast into lime blotches. The photo textures keep only ±10 % luminance detail.
- **Forest:** floor srgb(0.10, 0.16, 0.05). Far canopy srgb(0.05, 0.08, 0.025) → (0.22, 0.27, 0.09) beyond 25–70 m on forested ground.
- **Rock:** PALETTE rockDark/Mid/Light × (0.36, 0.34, 0.31) for inland basalt; coastal rock uses the full palette.
- **Our own covers** (lava, cinder, snow, farm rows, red laterite, city and roads): keep them, but check their linear albedo against TW (lava ≈ 0.02–0.04; laterite uses TW's scar colour).

**Done when:** sunlit dry sand at noon is sRGB (201, 182, 149) ± 15 (TW key art); meadow is olive (saturation 0.45–0.65, blue channel clearly above 0, never (113, 127, 2)); the beach is clearly brighter than the grass; the forest floor is dark.

### WAT-1: Water shading port (pri 5, water)
**Port:** `TW:src/ocean/WaterMaterial.js`:
- fresnelDielectric 17–26 (IOR 1.333) and waterPhaseHG 27–31;
- uniforms 71–80: backscatter 0.035, sss 1.0, refraction 0.06, waterRoughness 0.035, reflectionStrength 1, ssr 1;
- `_shadeWGSL` 201–639, without the hull and ShoreSim parts:
  - reflection 333–365: `skyReflectionRadiance`, tilted up by σ_unresolved·1.3; below the horizon it fades to `uHorizon·0.35` with `smoothstep( -0.12, 0.08, R.y )`; SSR;
  - sun specular 366–375: GGX D × Smith height-correlated V × exact F, with `α² = 0.035² + ( 0.003 + 0.00512·U )·2·unresolved·rough² + foam·0.2`, clamped at 400, × sun visibility;
  - refraction and water volume 376–528: σa (0.42, 0.075, 0.035)/m, σs (0.012, 0.018, 0.024)/m, backscatter 0.035, HG g 0.86 (0.7 HG + 0.3 isotropic), Gordon albedo `bb·1.32/( σa + bb )`, Snell-refracted view ray, analytic in-scatter of the refracted sun (1 − F) and of the sky along it. Crest translucency `sun·( 0.12, 0.55, 0.45 )·0.06·back^2.5·crest`;
  - foam lighting 529+;
- helpers 640–679 (`_waterDGGX`, `_waterVSmithGGX`, `_waterSceneZAt`, `_waterProject`) and `_waterSSR` 680+ (11 steps with ×1.7 growth + 3 bisections, ≤ 260 m, only rays with R.y < 0.45).

**Change** (`Ocean.js` fragment):
- **Delete** `R.y = abs( R.y )` (line 153), which causes the white streaks on wave backs. Also delete Schlick F0 0.02, the painted shallow/deep scatter mix (lines 146–149) and σ `( 0.46, 0.085, 0.062 )·1.6`.
- Water column:
  - seabed point P_bed from `uSceneDepth` at the pixel; vertical depth `D = max( 0, surfaceY − P_bed.y )`;
  - `Rt = refract( -V, N, 1.0/1.333 )`; path length `L = min( D/|Rt.y|, 400 )`, which matches TW's traced end point;
  - refraction image = `uSceneColor` at `_waterProject( P_surface + Rt·L )`, keeping the "nothing in front" test;
  - transmittance `exp( −( σa + σs )·L )` plus TW's in-scatter.
- Replace `Ocean.js:176` `texture2D( uSkyLUT, vec2( 0.5, 0.9 ) )` with `uSkyIrr`, **in the same commit as LPS-1**.
- Wind speed U = 3 + weather wind·12 m/s (from `uSea`). `unresolved = 1 − fd`.
- Sun visibility: `cloudShadowAt × terrainSunShadowAt` now, `sunShadowPCF` after LPS-8.
- Keep the polar grid, the Gerstner waves, the underwater branch and the 6 cm shore alpha for now.

**Done when:** in dt-beach-sea-noon the water runs foam line → turquoise ≈ (50, 112, 110) in the first metres → teal → blue ≈ (70, 104, 139) toward the horizon; the sandy seabed shows through 0–2 m of water; no white horizontal streaks; a crisp horizon; at golden hour a narrow, bright glitter path.

### LPS-4: Volumetric clouds (pri 6, light-post-sky)
**Port:** `TW:src/sky/SkyProClouds.js`:
- PRESET 27–50 ("Partly cloudy"): altitude 4000, thickness 5200, density 0.019, coverage 0.49 (+0.12 toward the horizon over 20–65 km), edgeSoftness 0.095, weatherScale 29000, baseScale 7500, baseStrength 0.69, erosion scale 0.13 and strength 0.24 → 2.15, base weather 0.54 up to 0.13;
- lighting: albedo 1, powder 0.7, ambient 0.7, multiple scattering 0.99, ground bounce albedo (0.0091, 0.0152, 0.0185);
- QUALITY 51: history divisor 2, lattice 4, maxSteps 256, lightTaps 6, stepMeters 25, fullLightingAlpha 0.5, lightReuseSteps 3, historyWeight 0.9;
- the density, erosion, light-march, 3-octave (`e^−τ + 0.5e^−τ/2 + 0.25e^−τ/4` with HG 0.8/0.4/0.2 at 80 % + backward 20 %), powder and base-darkening WGSL;
- the lattice trace and temporal reconstruction (638–760), the panorama 512×160 at lattice 4 (800+), and the shadow map 256² over 12 km at strength 0.85 (514–544).

**Noise:** build our own 64³ Perlin-Worley `Data3DTexture` (RGBA8, repeat, mipmaps) with `TW:src/sky/Clouds.js` (MIT): clWorley3 87–101, clGnoise 102–119, clBillows/clPerlinFbm 120–122 and the shape composition 745–762 (`_generateNoise` 378). **Not** `baseShape64.bin`. Use IGN in place of `blueNoise.bin`.

**Optional after:** the cirrus veil from `TW:src/sky/Clouds.js` 56, 259–300 (amount 0.5, altitude 9000), 369–371 and 545–620.

**Change:** new `src/render/sky/Clouds.js` replaces `Sky.js` `CLOUD_GLSL`, `cloudPass` and `cloudRT`.
- Lighting: direct = `atmosphereSampleTransmittance` at the sample altitude × 11 × the key light. At night the key light is the moon, which gives dark clouds. Ambient comes from the sky-view LUT (zenith and horizon) and `uSkyIrr`.
- Outputs:
  - a half-resolution view texture (rgb in-scatter, a transmittance), reconstructed at full resolution for the dome;
  - `G.uCloudPano` for `skyReflectionRadiance` and the env;
  - `G.uCloudShadow`, with `cloudShadowAt = mix( 1, T_sun, 0.85 )`. Delete the fbm coverage path and `uCloudShadowK`.
- `Weather.js` coverage: clear 0.35, fair 0.49, cloudy 0.62, showers 0.72, overcast 0.88, storm 0.96; density ×1.3 and ambient ×0.7 for overcast and storm. Wind drift 12 m/s along `uWind`, skew 1750.
- Settings: `clouds` low = 128 steps with quarter-resolution history; high = TW; off = none.

**Done when:** at noon there are many small crisp cumulus with bright tops (≥1.3× the surrounding sky luminance) and blue-grey bases that melt toward the horizon; silver linings when shot into the sun; night clouds darker than the sky around them; visible moving cloud shadows on the beach; no crawling per-frame noise.

**Pitfall:** keep TW's altitude in world units (4000 is above our highest summit, ≈700) and TW's curved-earth shell.

### LPS-3: Environment lighting and the AO hook (pri 7, light-post-sky)
**Port:** `TW:src/sky/Environment.js`: envCubeDir 35–51; capture with no sun or moon disc 82–104; amortised steps and refresh (on a 0.004 rad sun move or every 3 s) 253–326; the hooks 228–250. Three's PMREM GGX plus its irradiance stand in for TW's GGX prefilter and SH9. The Lagarde specular occlusion (`TW:src/engine/render/wgsl/lighting.js`) equals three's `computeSpecularOcclusion`.

**Change:**
- `Sky.js`: a 128² HalfFloat `WebGLCubeRenderTarget`, **one face per frame** from six fixed face cameras, painted with `skyRadianceWithClouds( dir, false )`: the sky-view LUT over the full sphere (the dark planet below the horizon), the cloud panorama and the moonlit sky (LPS-9). On the seventh frame, `pmrem.fromCubemap( cube.texture, this.envRT )` reuses `envRT` (r186 `PMREMGenerator.js:167`). This removes the `fromScene` hitch every 4 s.
- `Materials.js`: replace `#include <aomap_fragment>` with the same chunk followed by `reflectedLight.indirectDiffuse *= dtAO;` and, when `STANDARD`, `reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, dtAO, material.roughness );`.

**Done when:** shade on sand is neutral-cool (G ≤ 1.05·R, B ≥ 0.85·G); sunlit:shaded sand luma ≥ 1.7:1 at noon; no warm up-light on trunks and walls; no periodic frame hitch.

### LPS-5: GTAO (pri 8, light-post-sky)
**Port:** `TW:src/post/GTAO.js` (20–357). Its GLSL twin, `three/examples/jsm/shaders/GTAOShader.js`, runs the same algorithm (12 samples = 3 directions × 4 steps) and is the scaffold; TW's parameters and additions take precedence. Also port the beauty pass `TW:src/post/PostFX.js` 221–322 (postDepthLoad 249, postColorAO 258–296).
- Parameters:
  - half-resolution R16F depth, radius 2.2 m, thickness 2.0 m, exponent 1.6, normals from depth (gtaoNormalFromDepth 122), 5×5 magic-square noise;
  - temporal rotations [60, 300, 180, 240, 120, 0]° and offsets [0, .5, .25, .75]. Until LPS-7, use index 0 only, or it flickers;
  - separable 5+5 bilateral blur, `w = 1/( rel·40 + 1 )²`.
- Composite:
  - depth-aware 4-tap upsample;
  - multi-bounce `max( a, ( ( a·0.382 − 1.036 )·a + 1.654 )·a )`;
  - `c *= mix( 1, aMB, k )` with `k = mix( 0.35, 1, 1 − smoothstep( 0.12, 0.9, lum( c ) ) )`;
  - skip sky pixels (reversed depth 0) and pixels whose world y is below `uWaterLevel` (TW skips water-covered pixels).

**Change** (`Renderer.js`): after step 1, run GTAO + blur, then a beauty pass writes `T.scene × AO` into a new `T.beauty` (HalfFloat, no depth). The composite copies `T.beauty` + `T.scene` depth into `T.main`, and `sceneColor` returns `T.beauty.texture`. Setting `ao`.

**Done when:** trunks, bushes, rocks, kerbs and building bases sit in soft contact darkening (dt-palms, dt-forest, dt-meadow); sunlit sand is unchanged; no halos against the sky.

### LPS-6: Haze, sun shafts, god rays (pri 9, light-post-sky)
**Port:** `TW:src/post/AirHaze.js`:
- constants 39–49: MARCH_DIST 2500, NEAR 900, FAR_CLAMP 60000, SS_GAIN 3.5, marine σ 1.5e-4 with H 110, aerosol σ 3.2e-5 with H 1400; density 1.6 (87);
- hazeLayerDepth 236, hazeInScatter 245, hazePhase 252 (Cornette-Shanks g 0.62 × 0.7 + 0.3/(4π)), hazeApply 345–424;
- shaft march 435–499: half resolution, 16 quadratic steps to 2500 m, IGN + golden-ratio jitter; the shadow is one hard tap × terrain hill shadow × cloud shadow;
- temporal 500–541: 3×3 clamp, 0.12 blend, disocclusion at 5 % + 0.3 m;
- god-ray mask 542–571: quarter resolution, `exp( ( c − 1 )·600 ) + 0.25·exp( ( c − 1 )·50 )` × cloud transmittance on sky pixels;
- radial blur 572+: 3 passes × 8 taps, span `0.95/8^p`, decay 0.9 / 0.97 / 1.0; golden-hour fade `1 − smoothstep( 0.3, 0.75, L.y )`.

**Change, step A** (per material, analytic, first): replace the body of `Materials.js` `atmosphereFog( col, wp )` with the geometry part of `hazeApply`:
- `fog = skyLuminance( normalize( vec3( d.x, max( d.y, 0.02 ), d.z ) ) )`, plus the moonlit sky from LPS-9;
- `Ep = uSunColor·hazePhase( dot( d, uSunDir ) )`;
- `fSun = lum( Ep )/( lum( Ep ) + lum( uSkyIrr ) + 1e-5 )·min( shafts, 1 )`, with `h = smoothstep( 0, 900, dist )`;
- `tau = ( hazeLayerDepth( marine ) + hazeLayerDepth( aerosol ) )·uHazeDensity`, with `camH = max( uCamPos.y − uWaterLevel, 0 )`;
- `out = col·T + fog·( 1 − T )·( 1 − fSun·( 1 − h ) )`;
- drop `uFogDensity`, `uFogFalloff` and `uFogBoost`.

`Weather.js`: `G.uHazeDensity = 1.6 ×` {clear 0.8, fair 1, cloudy 1.3, showers 1.8, overcast 2.2, storm 3.2}. The sky dome gets no haze.

**Change, step B** (post):
- give `T.main` a `DepthTexture`; run the shaft march over `mainDepth`;
- until LPS-8, the shadow is one hard tap on the existing compare-mode map as `sampler2DShadow`;
- temporal pass, then a pass on `T.main` before bloom adds `near − deficit` (hazeApply 386–412) and the god rays (413–419);
- run the shafts only by day in clear, fair or cloudy weather, and the god rays only while `ssFade > 0.001`.

**Done when:** in dt-aerial the far hills turn blue-grey, not white, with a warm glow toward the sun, and the sea horizon stays crisp; at 16:30–17:30 shooting into the sun, shafts show through the palms; the far treeline in dt-meadow is softened.

### TER-2: Procedural terrain surface (pri 10, terrain)
**Port:**
- `TW:src/world/terrain/DetailTextures.js`, all of it: makeNoise 16, makeFbm 46, makeWorley 70, getDetailTexture 149–232. It makes a 512² RGBA8 texture (R rock plates, G soil, B sand grain and pebbles, A fbm), mipmapped, anisotropy 4.
- `TW:src/world/terrain/TerrainShading.js` SHADING_WGSL 77–278: terrainImplicitGrad; terrainPerturbNormal (Mikkelsen surface-gradient bump, tilt clamp about 55°); terrainTriWeights; terrainDetailGrad; terrainTriplanar (27 / 6.1 / 1.3 m, w = a⁴); terrainRockSurface; terrainMeadowTone.
- `TW:src/world/Terrain.js` `TERRAIN_SURFACE` 169–640:
  - detail samples 271–287: macroA `rot( xz, 0.7 )/173`, macroB `rot( xz, 2.1 )/47`, dM `rot( xz, 1.3 )/6.7`, dN `xz/1.9`, dF `rot( xz, 2.4 )/0.63`;
  - rock 288–334 and weights 335–348;
  - **beach sand 349–384**: wind ripples with λ 0.105 m and `pow( sin·0.5 + 0.5, 1.6 )`, ±6 % albedo, 5 mm bump, AA by `1 − smoothstep( 0.6, 2.2, fwidth( ph ) )`, only above h 1.5–2.2 m; trodden patches; a wrack band at h 1.15–2.1 m with shells, pebbles and dried seaweed;
  - seabed 385–422: megaripples 0.75 m, wave ripples 0.16 m, seagrass, rubble;
  - ground 423–496: meadow clumps, comb streaks, gust sheen, soil gaps, forest floor, far canopy with streaks down steep faces;
  - paths 497–504 (from our road/dirt mask); combine 505–511; beach scarp 512–551 (optional);
  - **wetness 552–580**: TW's fallback `smoothstep( 0.5, 0, h )` until WAT-6; mottled drying, backwash rills `( dot( xz, slopeDir )/3.2, perp/0.3 )`, swash lines every 0.13 m of height between 0.2 and 1.6 m, foam residue (0.88, 0.9, 0.9);
  - roughness 581–591;
  - micro relief 592–609: sand grain 4 + 3 mm, pebbles 4 mm, ripples 5 / 12 / 35 mm; meadow clumps 0.12; rock `R.hd·2.2 + R.height·0.6`;
  - AO 610+.

**Change:**
- New `src/world/terrain/DetailTextures.js`: generated once, in a new `detailTexture` worker handler or on the main thread (about 0.3 s). Export `getDetailTexture()` for the vegetation gust field.
- New `src/world/terrain/TerrainShading.js`: GLSL strings, PALETTE and MEADOW. Export `TERRAIN_MEADOW_GLSL` for the grass.
- Rewrite `Terrain.js` `TERRAIN_ALBEDO` and `TERRAIN_NORMAL` on TW's structure. Our per-vertex inputs become TW's land-cover weights:
  - moisture/forest ↔ jungle; pasture ↔ short meadow;
  - field rows are kept;
  - lava uses `terrainRockSurface` with a black basalt palette and glassy roughness;
  - red soil ↔ laterite; city and roads use the path and paving logic.
- Normals come from `terrainPerturbNormal` with `dFdx`/`dFdy` of `vWorldPos`, replacing the fixed-tangent normal maps.
- Drop the photo textures for sand, grass, drygrass, forest, dirt, rock and cliff. Remove them from `World.js` `TEXTURES` only after grepping that no other module uses them.
- `terrainDetail` low uses TW's cheap 6-sample seabed-style path.

**Done when:**
- dt-beach-sea-noon / dt-beach-along-noon: ripples readable in raking light within ~15 m, no visible tile repetition at 20–100 m, a wrack line, and a darker glossy wet band;
- dt-aerial: forests read as a lumpy canopy carpet, and cliffs show rock and scree bands;
- dt-meadow: tussocky ground, not a flat lime texture.

### WAT-2: Inland pools (pri 11, water)
**Change** (`Ocean.js`):
- At construction, flood-fill `hf.coarse` (2383×1589 cells of 32 m) from the map border over cells below +0.5 m, dilate the result by one cell, and upload it as an R8 texture on the `uBathyRect` mapping.
- Fragment: `discard` where the bilinear mask is below 0.5.
- `heightAt()` returns −1000 where the mask is 0. `Physics.js:215` then stops swimming in the pools.
- Alternative for the lead: lift inland ground below sea level in the bake.

**Done when:** dt-aerial has no pools on the Waikiki sand plain, and canals and harbours connected to the sea keep their water.

### LPS-7: TAA and RCAS (pri 12, light-post-sky)
**Port:** `TW:src/post/TemporalUpscale.js` at native scale, dropping the upscale parts:
- halton 42–55; 4 jitter phases (`jitterPhaseOverride`, 104), `jitterScale` 0.5, and 0.35 while moving (107–113); `_cameraMotion` 190;
- the resolve 219–650: YCoCg 240–243, taauTonemap 245–246, Lanczos-2 249, lock luma 256, 5-tap Catmull-Rom history 263, depth and previous depth 291–306;
- parameters 84–100: maxAccumulation 2, motionAccumulation 10, blurComp 0.5, lockThreshold 1.05, staticKeep 1;
- ping-ponged history as an MRT: colour RGBA16F, lock RGBA16F, luma history RGBA8;
- velocity is camera-only reprojection from depth (TW does this for terrain, water, rocks and vegetation; characters rely on the variance clamp).

Also port RCAS from `TW:src/post/PostFX.js` 474–500 (`c/( max( c ) + 1 )`, lobe clamp `−( 0.25 − 1/16 )`, strength 0.45, ×0.3 on sky pixels) into the grade.

**Change:**
- `antialias` `taa` uses no MSAA samples.
- Jitter by writing `projectionMatrix.elements[ 8 ]` and `[ 9 ]` after `updateProjectionMatrix`; store the clean matrix in `camera.userData.projNoJitter` for the ocean, GTAO and haze.
- The resolve runs after water and transparents. The view model is drawn afterwards, into the TAA output with its own depth clear, so it never enters the history.
- Bloom and the exposure meter read the TAA output. If rain or particles ghost, draw them after the resolve.
- The lead adds the `taa` option (§5).

**Done when:** palm fronds, power lines and grass edges are stable both standing still and strafing; zombies and cars leave no trail longer than about 2 frames; GTAO and shadow noise are resolved.

### LPS-8: Cascaded sun shadows with PCSS (pri 13, light-post-sky)
**Port:**
- `TW:src/engine/render/Shadows.js` SunShadows 22–175: splits 10 / 60 / 400 m; bounding-sphere fit with the radius quantised to 1/16 m; texel snap; lightMargin 200 m; updates every 1 / 2 / 4 frames, and all of them when the sun moves.
- `TW:src/engine/render/wgsl/lighting.js` 105–255: shadowCascadeOf 114, _shadowTap 119, _shadowDepth 124, _sunShadowCascade 148–198, sunShadowPCF 204, sunShadowHard 245.
  - Cascade 0 PCSS: sun angular diameter 0.00925; blocker search `clamp( 30 m·SD/width, 1.5, 24 )` texels with 8 Vogel taps + the centre; penumbra `clamp( dz·SD/width, 1.2, 32 )` texels with 12 taps; both rotated by IGN(pixel + (frame % 64)·5.588).
  - Other cascades: 5-tap Vogel hardware PCF.
  - Normal bias [0.015, 0.06, 0.3] m, depth bias 2e-5, seam blend `max( 0.25e², 0.25e )·400`.

**Change** (`World.js`, `Materials.js`):
- Three hidden `DirectionalLight`s (not added to the scene), each with a 2048² map, `shadow.autoUpdate = false`, and `needsUpdate` set by the update period.
- Fit their orthographic cameras per TW `_fit`, call `light.shadow.updateMatrices( light )`, and render with `renderer.gl.shadowMap.render( [ c0, c1, c2 ], scene, camera )`, so the terrain-skirt and vegetation `customDepthMaterial`s keep working.
- Cascade 0: after the first render, set `shadow.map.depthTexture.compareFunction = null` and Nearest filtering for raw PCSS reads (r186 `WebGLShadowMap.js:256–272`). Cascades 1–2 stay compare-mode (`sampler2DShadow`).
- **Reversed-Z:** r186 uses GreaterEqual compare, so the manual compares must flip.
- The visible sun keeps `castShadow = false`, and `dtSunVis` multiplies in the cascade result.
- Put the matrices and textures in `G` so the ocean can call `sunShadowPCF`.
- Retire `_setupShadows`. Settings: medium = 2 cascades at 1024², high = 3 at 2048², ultra = 3 at 4096².

**Done when:** palm shadows are sharp at the trunk base and soft at the crown; shadows reach about 400 m (dt-aerial); no shimmer when turning; no acne under a low sun.

### TER-4: Hill shadows (pri 14, terrain)
**Port:**
- `TW:src/world/TerrainGPU.js` `_initSunShadow` 134–190: start at 24 m, dt 6 m, growth 1.22, 24 steps (≈3.2 km); it samples max-mip heights at `log2( dt/texel )` and writes (top, occluder distance).
- `updateSunShadow`: rebake when the key light has moved more than 0.0015 rad.
- `terrainSunShadowAt` 285–297 (already a stub from LPS-0).
- `TW:src/world/terrain/TerrainBake.js` buildShadowHeights 161–213 (max mips).
- `TW:src/world/Terrain.js` materialSunModulation 140–147: `mix( 1, smoothstep( −0.05, 0.45, sunY )·0.35 + 0.62, meadowW )`.

**Change:**
- New `src/world/terrain/HillShadow.js`: a camera-centred 1024² height texture at 8 m (8.2 km), filled by a new `heightGrid` worker handler `{ x0, z0, n, step }` that returns a Float32Array. Build the max-mip chain with fragment passes, then bake into a 1024² RGBA16F target. Recentre after the camera moves 25 % of the extent. Write `G.uHillShadow`, `uHillShadowRect` and `uHillShadowOn`.
- `Terrain.js` sets `dtSunMod` for meadow self-shading.

**Done when:** at 17:00–18:00, long soft-edged hill shadows cross the valleys and beaches (Kaneohe cliffs, Kona slopes), and there is no acne on sunlit faces.

### TER-3: Baked terrain AO (pri 15, terrain)
**Port:** `TW:src/world/terrain/TerrainBake.js` bakeTerrainMaps 13–160: horizon AO over 8 directions with steps [4, 8, 13, 19, 27, 38, 52, 72, 100] m, `vis = mean( 1/( 1 + tan²θ ) )`, × cavity `1 − max( 0, cav − 0.5 )·0.7` from the height Laplacian (our baseline is 8 m, the data spacing).

**Change:**
- In the `world.worker.js` terrain handler, compute AO per vertex for nodes with step ≤ 16 m (1.0 elsewhere) and write it to the free byte `nor[ k·4 + 3 ]` (0..127).
- `Terrain.js`: add `new THREE.InterleavedBufferAttribute( ib, 1, 3, true )` as `ao`, and set `dtAO = vAO ×` the detail AO: jungle `dN.y·0.5 + 0.7`; meadow `smoothstep( 0.2, 0.7, clump )·0.35 + 0.65`.
- Keep node build time under 2× today's.

**Done when:** gullies, valley floors and cliff feet are darker in ambient light, with no seams between nodes.

### WAT-3: Shore waves and surf (pri 16, water)
**Port:**
- `TW:src/world/ShoreField.js` (243 lines): a Fast Marching travel-time field. r = arrival time, gb = direction × exposure, a = arrival time at the nearest shoreline.
- `TW:src/ocean/ShoreWaves.js`: shoreBar 284, shoreWaveAmp 304 (Green's-law shoaling), shoreBreakParams 322, shoreProfile 381, shoreWorld 445, shoreBore 454, shoreCrest 460, shorePhaseAt 510, shoreSwashRunup 575 (beach slope 0.066; uprush 0.4 and backwash 0.55 of the period), shoreSwashEdge 602.
- `TW:src/ocean/SurfFoam.js`: lace foam with a 3.5 m tile.

**Change:**
- Solve the shore field per 2–4 km tile around the camera in a new `src/world/ocean/shore.worker.js` (water-owned; it imports `HeightField` read-only).
- The polar grid is too coarse for breakers beyond about 30 m (2.8 m tangential spacing at 100 m). Either switch to TW's CDLOD water grid (`TW:src/ocean/WaterSurface.js`: grid 32, leaf 8, 12 levels) or add a dense shore band.
- The CPU `heightAt` must include the shore wave, for swimming and boats.

**Done when:** readable sets of waves shoal and break along the beaches with a turquoise translucent face, white bores run up the sand, and a swash sheet runs up and back.

### LPS-9: Night sky (pri 17, light-post-sky)
**Port** (`TW:src/sky/Sky.js`):
- skyHash13 79;
- skyStars 101–137: 160 cells per cube half-face; probability `band·0.035 + 0.025`; Milky Way pole (0.3, 0.2, 1); magnitude `log2( u )·0.602 + 6.5`; limiting magnitude `dark·7.5 − 1` with `dark = 1 − smoothstep( −0.28, −0.1, sunY )`; flux `u^−0.8`; PSF σ 0.1 cell, growing with flux; twinkle; ×0.0075; Milky Way glow (0.55, 0.6, 0.75)·band·0.0035;
- skyMoon 138–147;
- skyMoonSky 148–158: `( 0.005, 0.0068, 0.0105 )·( mix( 1.7, 1, sat( y·3 ) ) + e^−14a·2.4 + e^−2.5a·0.9 )·night`;
- skyBackground 159–167.

**Change** (`Sky.js`): replace `starField` and the LUT night floor. The moonlit sky feeds the dome, `atmosphereFog` and the env capture.

**Done when:** in dt-night the moonlit ground is readable but dark (mean luma 15–35); stars show a magnitude spread and, on a moonless night, a faint Milky Way; clouds are dark grey.

### LPS-10: Ground-bounce hook (pri 18, light-post-sky) and TER-6: bake (pri 19, terrain)
**Port hook** (`TW:src/materials/GroundBounce.js` hookBounce 158–190):
- only when `view = sat( −N.y·0.5 + 0.5 ) > 0.03` and `P.y > sea − 0.3`;
- `above = P.y − map.w`; `fade = smoothstep( −0.3, 0.3, above )·mix( 0.4, 1, smoothstep( 30, 4, above ) )`;
- `selfShade = 1 − sat( −dot( N.xz, normalize( sun.xz ) ) )·sat( 1 − sun.y )·0.6`;
- `E = map.rgb·uSunColor·cloudShadowAt( P )·view·fade·selfShade·0.6` (SURROUND).

In `patchMaterial`, after `#include <lights_fragment_maps>`, add `irradiance += E;`. Three multiplies irradiance by diffuse/π, which matches TW's E/π·diffuse. Skip it under `NO_GROUND_BOUNCE` (water, view model).

**Port bake** (`TW:src/materials/GroundBounce.js` 28–150):
- 512² at 4 m;
- land-cover albedo: sand srgb(0.86, 0.79, 0.66), darker when damp; meadow srgb(0.3, 0.36, 0.16) → jungle srgb(0.12, 0.17, 0.07); rock 0.08; sea = the seabed through the water column;
- `map = albedo·max( N·L, 0 )·hillShadow − 0.08·L.y`, w = ground height;
- 5×5 binomial blur; rebake on a sun move or a 25 % recentre.

Terrain writes it in a new `src/world/terrain/GroundBounce.js`, from `heightGrid` plus `hf.surfaceAt` and shoreness.

**Done when:** palm crown undersides, eaves and car bodies near the sand pick up a warm fill, and there is no light leaking through walls.

### WAT-4: FFT ocean (pri 20, water)
**Port** (`TW:src/ocean/OceanFFT.js`):
- FFT_SIZE 256; cascades [733, 157, 33.3, 7.1] m;
- local sea: 7 m/s, 25°, fetch 120 km, spread 0.85, swell 0.05. Swell system: ×0.48, 6 m/s, 5°, fetch 1200 km, spread 1, swell 0.9, short-wave fade 0.1 (90–91);
- spectrum 243–300: dispersion, tmaCorrection, jonswap, normalisationFactor, directionSpectrum, shortWavesFade;
- choppiness 0.9, depth 500; Jacobian foam with bias 0.58, gain 3, decay 0.35, add 2.5 (102–108);
- oceanSampleDisplacement 158;
- from `TW:src/ocean/WaterSurface.js` 70: attenuation `d0 = min( 40, size·0.08 )` with floors [0, 0.05, 0.25, 0.5]; foam weights [0.35, 0.45, 0.5, 0.25], sharpness 2.2.

**Change:**
- WebGL2 passes: the initial spectrum once; per frame, a time-evolution pass, then 8 horizontal + 8 vertical butterfly ping-pong passes with a twiddle texture. Pack the 4 cascades side by side in one 1024×256 float target, and generate mips.
- The CPU `heightAt` (for Physics and boats) must stay within about 5 cm of the rendered surface. Either read back a 64² decimation of the two largest cascades every ~4 frames with `readRenderTargetPixelsAsync`, or run the same spectrum through a 64² CPU FFT.
- This replaces the 8 Gerstner waves.

**Done when:** the open sea shows non-repeating, multi-scale, choppy waves with whitecaps from "fair" upward, and boats ride the rendered surface.

### WAT-5: Foam texture and sea detail (pri 21, water)
**Port:** `TW:src/ocean/FoamTexture.js` 13–111 (a procedural 1024² texture: density, bubbles, mottling, streaks; worley 46, vnoise 63) and `TW:src/ocean/SeaDetail.js` 18–173 (cat's paws, slicks, windrows; seaDetailSample 51–97; makeNoiseTexture 98).

**Change:** replace the value-noise foam (`Ocean.js:172–177`) and the two scrolling ripple layers.

### LPS-11: Lens flare (pri 22, light-post-sky)
**Port** (`TW:src/post/LensFlare.js`): a 7-blade aperture (BLADES 7); the GHOSTS table 30–38 (7 ghosts along the sun axis); halo; a 14-spike starburst; veiling glare. Visibility comes from 24 depth taps over a 6 px disc × cloud transmittance, eased (flareSkyTap 96, main 102). The light is `sunColor·vis·0.02`.

**Change:** one tiny visibility pass plus a term added in the grade before exposure.

### WAT-6: Breakers, swash simulation, caustics (pri 23, water)
**Port:**
- `TW:src/ocean/Breakers.js`: the thrown-lip ribbon and spray.
- `TW:src/ocean/ShoreSim.js`: Eulerian foam and wetness. r foam, g wetness (dries in about 30 s), b stranded foam, a flow speed.
- `TW:src/ocean/Caustics.js`: photon splatting on 2 focal planes; causticsSample 264.

**Change:** expose `G`-style uniforms for the ShoreSim texture and rect so terrain can drive the wet sand. Terrain wetness section `TW Terrain.js` 552–580 reads r/g/b in place of its fallback. Expose `causticsSample( P, depth, … )` for the terrain seabed.

### TER-5: Finer near mesh (pri 24, optional, terrain)
Our heights are 8 m data, so a finer mesh only helps if it carries procedural relief.

**Change:** LEAF 32 m (1 m spacing) within about 150 m, displaced by the detail texture's fbm at ≤ 0.1 m on sand and meadow. Physics still uses `hf.heightAt`, so keep the amplitude small.

### LPS-12: Motion blur (pri 25, optional, light-post-sky)
**Port:** `TW:src/post/MotionBlur.js` (McGuire 2012 with Jimenez 2014 reconstruction, TILE 20 px, shutter 0.5), with camera-only velocity from depth. Setting defaults to off.

---

## 5. For other modules (not owned by this workflow)

1. **Lead, `src/core/Settings.js`.**
   - `DEFAULTS.fov` 80 → **62** (`TW:src/engine/Engine.js:31`; both are vertical FOV). Migrate saved values of 80.
   - `QUALITY_PRESETS` high/ultra: `antialias: 'taa'` once LPS-7 lands.
   - New keys: `ao` (true on medium and up) and `exposure` (EV bias, default 0; TW `ui/AppUI.js:42` slider).
2. **Lead, `src/game/Game.js`.**
   - `exposure()` should return only the indoor factor (1.35 indoors, else 1), as `exposureBias` in `grade()`, with no night term and no easing (the Renderer's auto exposure replaces them). Stop passing `exposure` and `night`.
   - `Commands.js`: call `renderer.resetExposure()` after `/tp` and `/time set`.
3. **Lead, memory.** The decoded terrain buffer is 46 MB and is cloned into each worker (`WorkerPool.broadcast` `slice`), which accounts for about 180 MB, not the GBs. Under software GL, GPU memory counts as process RSS, so audit `gl.info.memory`, keep geometry arrays from being retained after upload (`attribute.onUpload( … )` for static meshes), and check texture and instance-buffer counts. This plan adds about 200 MB of GPU targets at 1080p (§7).
4. **Vegetation** (`src/world/Vegetation.js`, `vegetation/*`, `scatter.js`):
   1. Material: `MeshPhysicalMaterial.specularIntensity` 0.15 for canopy leaves (TW `VegMaterials.js:715`); 0.4 for palms, grass and stems' leaves; 0.3 for bark and stems; 0.42 for broadleaf (`:502`). Roughness 0.82 / 0.65 for canopy by species, 0.62–0.7 for palms, 0.92 for bark. Keep going through `patchMaterial`.
   2. AO split: albedo × `mix( 0.55, 1, ao )`; set `dtAO = mix( 0.35, 1, ao )` (indirect only, via the LPS-3 hook). Outer leaves × (1.16, 1.22, 0.92) by `smoothstep( 0.62, 1, ao )·0.7`. Bark `dtAO = smoothstep( 0, 0.75, hf )·0.45 + 0.4`.
   3. Translucency: `TW:src/world/vegetation/VegNodes.js` vegTranslucency 160–185. `( albedo·( 1.25, 1.45, 0.55 ) + ( 0.012, 0.018, 0 ) )·sat( −N·L )·( pow( sat( −V·L ), 3 )·0.7 + 0.3 )·strength·( 1 − uNight )`, times the **shadowed** key light `uSunColor·dtSunVis`. Strength 0.5·( ao·0.6 + 0.4 ) for canopy (`VegMaterials.js:721`), 0.3 for palms, 0.2 for broadleaf (`:504`), 0.35 for impostors (`Impostors.js:303`). This replaces ours (`diffuse·( 1.05, 1.25, 0.5 )·…·0.5`).
   4. Canopy normal `normalize( geoN + V·0.7 )` (ours 0.45). Thin edge-on cards by adding `( 1 − smoothstep( 0.08, 0.35, facing ) )·0.45` to the alpha threshold.
   5. Palette: leaf and ground greens far too saturated (blue channel ≈ 0). Use canopy srgb(0.05, 0.08, 0.025) → (0.22, 0.27, 0.09), the MEADOW palette (TER-1) for grass, and TW palm bark `VegMaterials.js` PALM_BARK 23+ (leaf-scar rings, fissures, silver weathering) for trunks.
   6. Gust field: TW `vegGustAt` 104 samples the detail texture's A (fbm) channel at 140 m and 61 m, with a CPU-integrated offset of `0.7·wind + 1.5` m/s. Use terrain's `getDetailTexture()` (TER-2) so grass, trees and the terrain's wind sheen move together.
   7. Impostors: 6×6 frames of 128 px; 3-frame blend inside 100 m; forest thinned 50 % over 140–320 m; shrubs dropped beyond 180 m; near-to-impostor at 75 m for trees and 45 m for shrubs; a 12 % Bayer band, reshuffled every frame once TAA lands.
   8. After LPS-8, trees and palms cast into cascade 2 (up to 400 m). Grass never casts.
5. **Grass:** port `TW:src/world/vegetation/GrassField.js`.
   - Layout: CELL 8 m (26); CLUMPS 384 per cell, 6/m² (36); BLADES 7 per clump with tiers [0, 0, 1, 1, 2, 2, 2] and TIER_N [2, 2, 3], with width compensation.
   - LOD: R_NEAR 18 (3 segments), R_MID 46 (2), R_FAR 88 (1 triangle) (27–29); fades FADE_T2 [11, 17], FADE_T1 [36, 45], FADE_T0 [62, 87] (30–32). Height comes from the terrain heightmap in the vertex shader.
   - Masks: RGBA density mask (dune grass, meadow grass, sea oats, creeper).
   - Colour: blade base from `TERRAIN_MEADOW_GLSL` (terrain, TER-2) so the sward fades into the ground: base `mix( tone·0.5, soil, 0.3 )`, tip `tone·( 1.25, 1.25, 1.05 )`, toward straw by dryness. Dead blades `mt.dry·0.3 + 0.07`; pale midrib `pow( 1 − |across|, 6 )·0.18`.
   - Shading: AO `mix( 0.32, 1, smoothstep( 0, 0.75, hf ) )`; roughness 0.8; specularIntensity 0.4; normal `normalize( N + V·0.4 )`; translucency `albedo·( 1.1, 1.3, 0.6 )·pow( sat( −V·L ), 4 )·0.3·smoothstep( 0.2, 1, hf )`.
   - Wind: bend `w·( g·0.55 + 0.22 ) + sin·w·0.1`; gust sheen ×(1.3, 1.28, 1.1) + (0.03, 0.03, 0.015).
   - Beyond R_FAR the terrain meadow tone takes over (TER-2).
   - Today we have about 12 blades/m² out to 45 m; TW has 42/m² out to 88 m.
6. **City and buildings** (`src/city/*`):
   - Route every building, road and prop material through `patchMaterial` so they get haze, AO, specular occlusion and bounce.
   - Street lamps and windows: mirror `TW:src/materials/LocalLights.js` (nearest 8 lights packed into uniforms each frame; `( 1 − ( d/r )⁴ )²` window on inverse square; GGX, Lambert-only on terrain and foliage; spot profile `max( m², smoothstep( cosO − 0.55, cosO, cd )·0.05 )`; lanterns (1, 0.72, 0.42)·7.5 with range 11 and flicker 0.08, on from dusk).
   - Lamps must be point or spot lights. LPS-0 stops the cloud shadow from dimming them.
   - Albedo: TW village painted and galvanised surfaces 0.3–0.6 linear (galvanised (0.34, 0.35, 0.35), chalk paint `tint·0.64 + 0.27`); dark wood and rust 0.03–0.12.
   - Re-tune emissive windows and signs for night exposure ≤ 1.1 (was 2.4).
   - The Honolulu blocks were empty lawns in dt-aerial and dt-meadow; check building streaming.
7. **Beach clutter** (items or world-props owner, lead to assign):
   - `TW:src/world/debris/PebbleField.js`: PCELL 4 m, R_FAR 25 m, 150 small + 44 chips + 18 cobbles per cell, fades 8–15 / 15–24 m, no shadows.
   - `TW:src/world/Debris.js` + `DebrisPlacement.js`: driftwood, coconuts, shells, coral, fronds, rope and nets along the wrack line, h 1.15–2.1 m.
   - The CC0 Poly Haven scans are in `TW:public/models/debris`; keep their credits.
   - Clutter is a large share of TW's close-range "detail".
8. **Weapons and view model** (`src/weapons/*`, `src/render/FX.js`):
   - Add `NO_SUN_VIS`, `NO_GROUND_BOUNCE` and `NO_ATMOS_FOG` to view-model materials; they live in their own scene, so world-space hooks do not apply.
   - Recheck hand brightness after LPS-2: `Game.viewSun` = sunColor·0.55, and sunColor becomes 3.2× brighter while exposure becomes about 3× lower.
   - Re-tune muzzle flash, tracers and explosions for exposure ≈0.33 by day and ≤1.1 at night.
   - Recheck the view-model FOV formula `min( 70, fov·0.72 )` at fov 62.
   - `ViewModel.js:89` threw "Cannot read properties of undefined (reading 'set')" in one boot.
9. **Vehicles:** re-tune headlight and taillight emissive; car paint through `MeshPhysicalMaterial` clearcoat plus `patchMaterial`; boats keep using `ocean.heightAt`, which WAT-3 and WAT-4 keep accurate.
10. **AI and creatures:** `src/ai/Creatures.js` returned HTTP 500 during some boots (a Vite transform error; check the syntax).
11. **UI:** an exposure (EV) slider, an AO toggle, the TAA option, and the FOV slider defaulting to 62.

---

## 6. Verification protocol

### 6.1 The shot list (one boot per batch; `test/preview/session.mjs <url> <outdir> <steps.json>`)
Start from `http://127.0.0.1:<port>/?quick=1&mode=creative&at=-3968,-9779&yaw=150&hour=12.5`. Each step uses `__app.game.commands.run( '/tp x z' )`, `__app.game.player.yaw = <rad>`, `__app.game.player.pitch = <rad>`, `__app.game.commands.run( '/time set hh:mm' )`, `__app.game.commands.run( '/weather fair lock' )` and `__app.ui.hud.hidden = true`. Wait about 10 s for streaming, and call `__app.renderer.resetExposure?.()` before each shot.

| Shot | Place | yaw (rad) / pitch | Time, weather | TW counterpart |
|---|---|---|---|---|
| beach-sea-noon | Waikiki −3968, −9779 | 2.618 / −0.04 | 12:30 fair | `ref/tw-beach-sea-noon.jpg` |
| beach-into-sun | Sunset Beach: 20–40 m seaward of −6786, −15272 on dry sand (the baseline camera ended at the vegetation line) | 2.414 / −0.08 | 16:45 fair | `ref/tw-beach-into-sun.jpg` |
| pier-golden | Hilo 31788, 11826 | −0.436 / 0 | 16:30 fair | `ref/tw-pier-golden.jpg` |
| beach-along-noon | Waikiki | along the shore | 12:30 fair | missing |
| shore-swash | Waikiki −3977, −9764 | / −0.35 | 16:12 fair | missing |
| palms | −7664, −9941 | | 09:30 fair | missing |
| meadow | −7008, −12128 | | 11:00 fair | missing |
| forest | −8928, −13792 | | 11:00 fair | missing |
| sunset | Kona 19870, 13024 | π/2 | 18:21 clear | missing |
| night | Waikiki | | 22:00 clear | missing |
| aerial | Waikiki, 95 m up (`/fly`) | / −0.55 | 15:00 fair | missing |

The baseline was taken at 1280×720 with the scratch script `scratchpad/dt-capture.mjs` (`LVP=1 node dt-capture.mjs <port> <outdir> <views>`). `session.mjs` uses a 960×540 viewport, so compare metrics on the 320×180 downsample below.

### 6.2 Tone metrics (reproduces the baseline numbers exactly)
```sh
python3 - shot.jpg <<'EOF'
import sys, colorsys
from PIL import Image
im = Image.open( sys.argv[ 1 ] ).convert( 'RGB' ).resize( ( 320, 180 ) )
b = im.tobytes(); px = [ tuple( b[ i:i + 3 ] ) for i in range( 0, len( b ), 3 ) ]
L = sorted( 0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px ); n = len( L ); m = sum( L ) / n
sd = ( sum( ( l - m ) ** 2 for l in L ) / n ) ** 0.5
sat = sum( colorsys.rgb_to_hsv( r / 255, g / 255, b / 255 )[ 1 ] for r, g, b in px ) / n
print( f'luma {m:.0f} sd {sd:.0f} p5 {L[ n // 20 ]:.0f} sat {sat:.2f}' )
EOF
```

| View | Tidewater | Deadtide baseline | Target after M1 |
|---|---|---|---|
| beach-sea-noon | luma 116, SD 52, p5 11, sat 0.39 | 192, 25, 157, 0.14 | 105–130, ≥ 45, ≤ 40, ≥ 0.30 |
| beach-into-sun | 128, 38, 62, 0.34 | 101, 69, 29, 0.65 | 110–140, 35–55, n/a, 0.30–0.45 |
| pier-golden | 112, 51, 25, 0.32 | 118, 67, 44, 0.40 | 100–125, ≥ 45, n/a, 0.28–0.40 |
| meadow | none | 130, 47, 53, 0.69 | saturation ≤ 0.50 |
| sunset / night | none | 3 / 8 | sunset ≥ 40 with an orange sky; night 15–35 |

### 6.3 Colour probes (5×5 means, sRGB, from TW `ref/tw-beach-sea-noon.jpg`)

| Probe | TW value | Pixel in TW image |
|---|---|---|
| zenith | (31, 68, 120) | (640, 10) |
| sky 30° up | (67, 110, 156) | (640, 200) |
| sky at horizon | (155, 171, 173) | (900, 320) |
| far-sea band | (70, 104, 139) | (880, 350) |
| near-shore turquoise | (51, 114, 106) | (880, 368) |
| surf foam line | (206, 202, 191) | (880, 398) |
| sunlit dry sand | (201, 182, 149) | (800, 560) |
| deep shade under the stall, on sand | (58, 66, 69) | (900, 655) |

The shade is neutral-cool. Ours measures (113, 115, 83), greenish.

### 6.4 Tidewater reference shots still missing
Eight views have no Tidewater counterpart, because running the external Tidewater code in this container was denied by the permission system. Someone with permission (the user or the lead) must allow it. The procedure is recorded in the baseline report (Vite on 5261; Playwright with `--enable-unsafe-webgpu --use-vulkan=swiftshader`; the scratch patches to `Shader.js` and `ComputeMips.js` to fit SwiftShader's limits; `scratchpad/tw-capture.mjs` using `__bench.pose( name )` from `TW:src/core/DebugViews.js`). Until then, judge those views by the qualitative targets in §4.

---

## 7. Performance and memory budget (1920×1080)

| Addition | GPU memory | Cost per frame |
|---|---|---|
| LUTs (256×64, 32×32, 192×108) + 2×1 readback | < 1 MB | sky-view rebuild only when the sun moves |
| Auto exposure 1×1 ×2 | none | 1 small pass |
| `T.beauty` RGBA16F | 16.6 MB | 1 full-resolution pass |
| GTAO half-res depth, AO, blur | ~6 MB | 3 half-resolution passes |
| `T.main` depth texture | 8.3 MB | none |
| Shafts (half) + god rays (quarter) + temporal | ~10 MB | 4–6 small passes, golden hour only |
| Clouds: half-res history ×2 + source, panorama, shadow 256², noise 64³ | ~20 MB | 1/16 of pixels traced |
| Env cube 128² + PMREM | ~3 MB | 1 face per frame |
| TAA history (colour, lock, luma) ×2 | ~83 MB (replaces MSAA ×4 at ~130 MB) | 1 resolve |
| Cascades 3 × 2048² depth32 | 50 MB (replaces the 16 MB single map) | cascades 1 / 2 / 4 frames |
| Hill shadow 1024² RGBA16F + heights + mips | ~14 MB | rebake on sun move |
| Ground bounce 512² | 4 MB | rebake on sun move |
| FFT 1024×256 float ×3 + mips | ~12 MB | ~18 small passes |

Settings keep every item switchable: `ao`, `clouds` off/low/high, `shadows`, `antialias` fxaa/msaa/taa, `bloom`, `water`, `terrainDetail`.

---

## 8. Risks

- **Three chunk patching.** `patchMaterial` replaces r186 chunk text (`lights_fragment_begin`, `aomap_fragment`, `lights_fragment_maps`). Pin three at r186 and assert that every `.replace` matched: log once if the output string is unchanged.
- **Shared GLSL names.** Every module compiles `COMMON_GLSL`. Keep old names working (`skyLutUv`, `atmosphereFog`, `cloudShadowAt`) and add new functions instead of renaming.
- **Big-bang energy change.** LPS-1 without LPS-2 looks worse than today (the sun 3.2× brighter at exposure 1). They must land together, plus the one-line `Ocean.js:176` change.
- **TAA ghosting** on characters, vehicles, rain and particles. Ship it behind the `taa` setting and keep FXAA/MSAA; draw particles after the resolve if needed.
- **Headless verification** is slow and memory-bound. Batch views into one boot, keep one browser at a time, and use lavapipe, not SwiftShader.
