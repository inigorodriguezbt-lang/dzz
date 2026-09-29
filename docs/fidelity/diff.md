# Tidewater vs Deadtide: rendering fidelity diff

Reference: Tidewater (MIT, `dgreenheck/tidewater`, checked out in the session scratchpad as `tidewater/`). Deadtide:
this repo. Every Tidewater number below is copied from its source; every Deadtide number from ours. File paths
are `TW:src/...` and `DT:src/...`.

**Important discovery about the source.** Tidewater's current `main` is not TSL any more. It runs on its own
WebGPU engine (`TW:src/engine`, see `TW:docs/PORTING.md`) and every shader is plain **WGSL** in template strings.
That makes the port easier: WGSL to GLSL ES 3.0 is a mechanical translation (see §A). What has no direct WebGL2
equivalent is compute: those kernels become full-screen fragment passes into float render targets (or CPU
work).

---

## 0. Why ours doesn't look like theirs (ranked by visual impact)

| # | Cause | Tidewater | Deadtide | Owner |
|---|---|---|---|---|
| 1 | **Sun vs sky energy.** Direct:ambient on flat ground, sun at 30° | **7.7 : 1** | **1.07 : 1** (7x flatter) | light-post-sky |
| 2 | Sky brightness (zenith radiance, sun 30°) | (0.043, 0.096, 0.236) × exposure ≈0.33 | (0.116, 0.234, 0.471) × exposure 1.0 | light-post-sky |
| 3 | Exposure | 0.55 × auto exposure (0.6..6) | fixed 1.0 (2.4 at night) | light-post-sky |
| 4 | Albedo palette (linear) | sand 0.52–0.69 lum, meadow green 0.075, jungle 0.02 | sand 0.27, grass 0.15, forest 0.07 | terrain |
| 5 | Ambient occlusion | GTAO (half res, temporal) + baked terrain horizon AO + canopy AO | none on the terrain / world (only vertex AO in plants) | light-post-sky / terrain |
| 6 | Aerial perspective at sea level | σ = 2.9e-4 /m (3.4 km e-folding) + shadowed sun shafts + god rays | σ = 5e-5 /m clear (20 km), no shafts | light-post-sky |
| 7 | Post | scene-referred grade, bloom with no threshold, TAAU + RCAS, dither, motion blur, flare | display-referred grade, thresholded bloom, MSAA/FXAA, no dither | light-post-sky |
| 8 | Shadows | 3 cascades 10/60/400 m, PCSS near, heightfield hill shadow to ~3 km, cloud shadow map | one 2048² map ±85 m, 5-tap PCF | light-post-sky / terrain |
| 9 | Terrain detail | procedural height detail at 6 scales + surface-gradient bump, 0.2 m mesh | 512² photo JPGs tiled at 3–6 m, 2 m mesh | terrain |
| 10 | Water | 4-cascade FFT, physical water column, SSR, refraction pass, breakers, swash | 8 Gerstner waves, ad-hoc absorption, sky-LUT reflection | water |
| 11 | Clouds | volumetric Perlin–Worley, 3 scattering octaves, temporal | 2-D value-noise slab, quarter res, no temporal | light-post-sky |
| 12 | Grass | 42 blades/m² out to 88 m, 3 LODs | ≈12 blades/m² out to 45 m | vegetation |
| 13 | Foliage specular | specularIntensity 0.15 (F0 ≈ 0.006) | F0 0.04 (6.7x more sheen) | vegetation |

**Deadtide bugs found while reading (fix first, they are cheap):**

1. `DT:src/render/Atmosphere.js` `atmRaySphere` returns `vec2( 1e9, -1e9 )` on a miss, and `atmTransmittance` tests
   `if ( g.x > 0.0 ) return vec3( 0.0 )`. A sun ray that **misses** the planet is therefore treated as blocked.
   With the sun at elevation e, every sample higher than R·e²/2 is unlit: at 1° that is anything above ≈970 m, so
   the whole sunrise/sunset sky goes black. The script below measured sky irradiance (0, 0, 0) at 1°. The same
   miss value in `atmSky` (`if ( g.x > 0.0 ) tMax = g.x`) sets tMax = 1e9 for view rays within ±0.1° of the horizon
   at sea level, and within ±2° from a 700 m summit (alt = y·6 = 4.2 km real), giving a black horizon band. Fix:
   return `vec2( -1.0 )` on a miss and test `g.x > 0.0 && g.y > 0.0`. Better, replace the model with Tidewater's
   Hillaire LUTs (§3).
2. The moon disc is 7x too big: `mm > 0.9995` means a radius of 0.0316 rad (1.8°). Tidewater uses 0.0048 rad
   (0.275°; the real value is 0.26°). `DT:src/world/Sky.js`.
3. `DT:src/render/Materials.js` multiplies **all** direct light (`reflectedLight.directDiffuse/Specular` after
   `lights_fragment_end`) by the cloud shadow, which includes point lights. Street lamps get cloud-shadowed at
   night. Apply it to the sun light colour only.
4. `DT:src/render/Renderer.js` grade: `t += ( hash - 0.5 ) * grain` uses a `sin` hash of `vUv * resolution`.
   It is a fixed pattern, gives diagonal hatching in dark gradients, and there is no dither before 8-bit, so
   skies band.

### Measured: atmosphere energy of both models (scratch `skyratio.mjs`, JS port of both shaders)

Sky E/π is the cosine-weighted mean sky radiance, which is exactly what multiplies albedo as ambient in both
engines. Tidewater: Hillaire 2020 with transmittance and multi-scatter LUTs, `SUN_ILLUMINANCE = 11`, view height 2 m.
Deadtide: `atmSky( …, sunI = 22 )`, clear-weather haze 0.676, alt 10 m, sun colour = 3.4 · T.

| sun elev | TW sun colour | TW sky E/π | TW direct:amb | DT sun colour | DT sky E/π | DT direct:amb |
|---|---|---|---|---|---|---|
| 60° | (10.26, 9.35, 8.06) | (0.101, 0.207, 0.463) | 12.8 | (3.18, 2.90, 2.50) | (0.282, 0.548, 1.019) | 1.54 |
| 30° | (9.75, 8.31, 6.43) | (0.091, 0.179, 0.381) | 7.7 | (3.03, 2.58, 2.00) | (0.220, 0.411, 0.725) | 1.07 |
| 15° | (8.76, 6.48, 3.96) | (0.081, 0.146, 0.286) | 3.9 | (2.73, 2.02, 1.24) | (0.174, 0.299, 0.486) | 0.61 |
| 5° | (6.02, 2.77, 0.71) | (0.062, 0.088, 0.139) | 1.07 | (1.91, 0.88, 0.23) | (0.117, 0.153, 0.193) | 0.20 |
| 1° | (2.50, 0.43, 0.01) | (0.040, 0.040, 0.055) | 0.11 | (0.83, 0.15, 0.00) | **(0, 0, 0)** (bug 1) | — |

Our sky is 2–2.7x brighter than Tidewater's while our sun is 3.2x dimmer. The two use one physical model but
different scales (sky 22 vs sun 3.4, a 6.5x ratio). Tidewater uses 11 for both. That single mismatch is most of
the "flat, pale, no contrast" look: shadows 5–7x too bright, a washed-out pale sky, and the sunlit side barely
brighter than the shade.

---

## 1. Renderer, colour space, tone mapping, exposure

**Tidewater** (`TW:src/App.js`, `TW:src/engine/render/SceneRenderer.js`, `TW:src/engine/render/Frame.js`, `TW:src/post/PostFX.js`)
- HDR scene target: `rgba16float` colour + `rgba16float` velocity + `rgba8unorm` water mask, `depth32float`, reversed-Z
  (1 near, 0 far, cleared to 0), camera near 0.1, far 60000. Internal resolution = output × renderScale (0.5..1),
  upscaled by TAAU.
- Pass order: opaque layer, then the sky background drawn where depth == 0 (compare `equal`), then copies (opaque colour +
  depth, half-float depth), hull masks, the refraction pass (scene below sea level only, half res), then water +
  transparents.
- Tone mapping: three's ACES fitted curve (`RRTAndODTFit`, same matrices as ours) applied to
  `c * frame.exposure / 0.6`, then `linearToSrgb`, then a ±1 LSB triangular dither (two `postHash` per pixel per frame).
- **Exposure = `settings.exposure` 0.55 × auto exposure.** The auto exposure (`_buildMeter`) meters the 1/16-res
  bloom level after TAA with a centre-weighted log average: `w = max( 1 - |uvc·(1, 1.4)|·1.2, 0.15 )`,
  `refLum 0.25`, `ratio = 0.25 / avg`, softened to `pow( ratio, 0.8 )` when brightening, clamped to
  `[0.6, mix( 6.0, 2.0, night )]`, adapting at `up 1.6 /s`, `down 1.1 /s` in log2 space
  (`k = 1 - exp( -dt·rate )`), stored in a storage buffer and used from the next frame. On a sunny beach avg ≈ 0.5,
  so the multiplier sits at its 0.6 floor: effective scene scale **0.55 × 0.6 = 0.33** before `/0.6`.
- Physical scale: `SUN_ILLUMINANCE = 11` for both the sun and the sky LUT. Sun colour = LUT transmittance at sea
  level × 11 × `smoothstep( -0.03, 0.02, sunY )` (`App.applyAtmosphereReadback`).

**Deadtide** (`DT:src/render/Renderer.js`, `DT:src/game/Game.js` `exposure()`)
- `sceneRT` HalfFloat + FloatType DepthTexture (MSAA ×4 at high/ultra), `mainRT` HalfFloat, reversed-Z (log-depth
  fallback). Pipeline: opaque + sky, then composite + water/transparents, then view model, then bloom, then grade (+FXAA).
- `outputColorSpace = Linear`, `NoToneMapping`; the grade does ACES fitted (same curve) on `c * exposure / 0.6`, then
  sRGB, then additive grain. No dither.
- Exposure: `1.0 + night·1.4·nightBrightness` (×1.35 indoors), eased at 3 %/frame. No metering.
- Sun colour = CPU transmittance × **3.4** × `smoothstep( sunY, -0.12, 0.08 )`. Sky LUT sun illuminance **22**.

**Gap.** Same curve and colour space, but (a) a 6.5x sky/sun scale mismatch, (b) no auto exposure, so a scene can't
be "dark shade + bright sun" and still land mid-grey, (c) no dither, (d) the exposure is 3x too high once the scales
match.

**Fix (light-post-sky).** Set one constant `SUN_ILLUMINANCE = 11` for the LUT and the sun (drop 22 and 3.4), and use
TW's horizon fade `smoothstep( -0.03, 0.02, sunY )`. Set exposure 0.55 and port the meter as a fragment pass: the
1/16 bloom level (already ours: `T.bloom[3]`) → one 1×1 pass that loops over it (or a 16×16 then a 1×1 reduction)
→ a 1×1 RGBA32F "adapted exposure" RT ping-pong read by the grade. Keep the constants 0.25 / 0.6 / 6 (2 at night) /
1.6 / 1.1 / pow 0.8. Add the ±1/255 triangular dither after sRGB.

---

## 2. Post chain (AO composite, haze, AA, sharpen, bloom, grade, vignette, grain, motion blur, flare)

**Tidewater order** (`TW:src/post/PostFX.js`): scene (HDR + velocity) → GTAO at half res → 5+5 depth-aware blur →
**beauty pass** (AO applied to opaque pixels not covered by water, then `hazeApply`, then the underwater composite) →
**TAAU** → bloom chain from the TAA output → **final**: RCAS sharpen → motion blur → + bloom·0.05 → + lens flare →
lens droplets → × auto exposure → grade → vignette → grain → ACES(×0.55/0.6) → sRGB → dither.

- **Bloom** (`_buildBloom`): 5 downsamples at output scales 0.5, 0.25, 0.125, 0.0625, 0.03125. The 13-tap Jimenez
  downsample uses a **Karis average on the first level** (`karis(c) = c/(lum+1)`, weights 0.5 / 4×0.125, undone
  after with `s / max( 1 - lum(s), 0.02 )`) and plain 13-tap weights after. 3×3 tent upsamples (4/2/1 /16) add the
  larger level. **No threshold.** Strength **0.05**, added in scene-referred HDR before exposure. The whole image
  glows slightly, so the bright sky bleeds over palm silhouettes (the "cinematic" veil in their screenshots).
- **Grade** (in linear HDR, *before* ACES): warmth `c *= ( 1 + 0.02, 1, 1 - 0.02 )`, saturation 1.06
  (`mix( lum, c, s )`), contrast 1.04 as `pow( c / 0.18, 1.04 ) * 0.18` (pivot at mid grey), vignette 0.28:
  `1 - smoothstep( 0.25, 0.75, length( ( uv - 0.5 ) * ( 1, 0.8 ) ) ) * 0.28`, grain 0.012:
  `c += c * n * grain` with triangular noise `(h1 + h2 - 1)·0.5` from an integer hash of (pixel, frameIndex).
- **Sharpen**: RCAS (FSR1) strength **0.45** on a max-channel Reinhard proxy `c/(max(c)+1)`, lobe clamp
  `-(0.25 - 1/16)`, ×0.3 on sky pixels, then inverted back to HDR.
- **AA**: `TemporalUpscale.js`, the FSR2 2.2 accumulation. Halton(2,3) jitter with **4 phases**, jitterScale 0.5,
  jitterMoving 0.35. Lanczos-2 reconstruction over 3×3 taps, 5-tap Catmull-Rom history, variance-box clamp, thin-feature
  locks (lockThreshold 1.05), luma-instability history (4 frames), maxAccumulation 2, motionAccumulation 10,
  blurComp 0.5, staticKeep 1. Depth-dilated velocity; the water keeps its history. Alternatives in `AntiAlias.js`:
  SMAA, FXAA, SMAA+TAA.
- **Motion blur**: McGuire 2012 + Jimenez 2014 reconstruction, TILE 20 px, shutter 0.5 (180°).
- **Lens flare** (`LensFlare.js`): 7-blade aperture, 7 ghosts along the sun axis (a, r, tint, k:
  0.72/0.018/(1,.85,.6)/.55, 0.44/0.045/(.55,.9,1)/.35, 0.16/0.022/(.8,1,.7)/.45, -0.18/0.07/(.6,.75,1)/.22,
  -0.42/0.03/(1,.7,.9)/.4, -0.75/0.11/(.7,1,.85)/.14, -1.15/0.05/(1,.8,.55)/.28), a halo, a 14-spike starburst, and
  veiling glare. Light = `sunColor · visibility · strength · 0.02`, where visibility = the unoccluded share of the
  disc (24 depth taps, disc radius 6 px) × cloud transmittance, eased.
- **God rays** and **sun shafts**: in AirHaze (§5).
- **Lens droplets** after surfacing (other).

**Deadtide** (`DT:src/render/Renderer.js`): bloom = 6 levels from half res, 13-tap down (no Karis), **threshold 1.1**
on the first level (`col *= clamp( ( lum - 1.1 ) / lum, 0, 1 )`, capped at 60), tent up (radius 1), strength 0.06
added before exposure. Grade **after ACES on display-linear values**: saturation 1.08, contrast
`( t - 0.5 ) * 1.06 + 0.5` (pivot 0.5 linear-display, which crushes everything below it), additive warmth
`+( 0.015, 0.00525, -0.015 )` (lifts the blacks), night tint `t * ( 0.86, 0.95, 1.18 )` at 0.6·night, vignette 0.28
`smoothstep( 0.05, 0.6, 1.6·|q|² )`, grain 0.018 additive after sRGB. AA: MSAA ×4 on the HDR target (high/ultra) or
FXAA 3.11-lite on LDR. No sharpen, motion blur, flare or god rays. Gameplay effects (damage, low blood, drunk,
underwater wobble) are ours; keep them.

**Gap.** (1) The grade is display-referred and additive, so ours lifts or crushes blacks where TW's pivots around mid
grey in scene space. (2) Thresholded bloom lacks TW's soft veil. (3) MSAA leaves shader aliasing (sand ripples, grass,
specular) shimmering, and TW's TAA+RCAS gives the stable, crisp, "filmic" image. (4) No flare or god rays.

**Fix (light-post-sky).**
- Move grade, vignette and grain before ACES exactly as TW (numbers above). Drop the additive warmth and the
  0.5-pivot contrast. Keep our gameplay effects after tone mapping.
- Bloom: remove the threshold, add the Karis first level, 5 levels, strength 0.05.
- TAA: port `TemporalUpscale.js` at native scale (drop the upscale part). Without MRT velocity, do what TW does for
  its terrain, water, rocks and whole vegetation group (`useStaticVelocity`): camera-only reprojection from depth
  (`prevViewProj · worldFromDepth`). Moving characters and vehicles rely on the variance clamp; render the view model
  after the resolve (it already has its own pass). Then RCAS 0.45. This replaces MSAA (and frees its bandwidth).
- GTAO (§7), AirHaze (§5), then flare, then motion blur (low priority).

---

## 3. Sky / atmosphere

**Tidewater** (`TW:src/sky/Atmosphere.js`, `TW:src/sky/Sky.js`)
- Hillaire 2020 in km. RG 6360, RT 6460. Rayleigh (5.802, 13.558, 33.1)e-3 /km, H 8 km. Mie scattering 3.996e-3,
  extinction 4.44e-3, H 1.2 km, **g 0.8** (Cornette-Shanks). Ozone (0.650, 1.881, 0.085)e-3, tent at 25 ± 15 km.
  Ground albedo (0.06, 0.08, 0.1). All scales 1.
- LUTs: **transmittance 256×64** (40 steps, Bruneton uv mapping, sub-uv); **multi-scattering 32×32** (8×8 sphere
  directions × 20 steps, isotropic phase, ground bounce, `Lms = Lin / ( 1 - fms )`); **sky-view 192×108** (32 steps
  with quadratic spacing `t = mix( t0², t1², 0.3 )`, azimuth relative to the sun `u = sqrt( 0.5 - 0.5·cos )`,
  horizon-aware v mapping, earth shadow, `S = T·shadow·( rayleigh·phaseR + mie·phaseM ) + ms·scattering`), ×11.
  Rebuilt only when a parameter changes. View height quantised to 2 m below 100 m, then 2 % log steps.
- Irradiance readback every 0.25 s: sky E/π (16×16 cosine-weighted), sun transmittance at sea level, horizon colour
  (16 azimuths at y = 0.03). These give `sunColor`, `skyIrradiance`, `horizonColor`.
- Sun disc: angular radius **0.004675·1.15 = 0.00538 rad**, `smoothstep( 1, 0.9, r )` edge, limb darkening
  `1 - 0.6·( 1 - μ )`, radiance `T · 2500`, faded by `smoothstep( -0.02, 0, dir.y )`.
- Sun path: `sunDirectionFromTime( h, lat 24°, decl 6° )`, default **16.2 h** (sun ≈ 27° high: long warm shadows).
- Main-view background: `skyViewRadiance` = atmosphere + moon + sun disc × `cloudsSunTransmittance` + clouds
  sampled at **full resolution** (temporal reconstruction), plus camera-only velocity for TAA.

**Deadtide** (`DT:src/render/Atmosphere.js`, `DT:src/world/Sky.js`): single scattering with the same coefficients in
metres (Mie g 0.78, haze-scaled Mie density `0.5 + fog·0.22`), 16 view steps × 8 sun steps evaluated per LUT texel
(no transmittance LUT), multi-scattering faked as `( R + M )·0.08·max( 0, s.y + 0.1 )`, sky LUT 256×128 (absolute
azimuth, sqrt elevation), updated every 0.25 s, **sunI 22**, plus bug 1. Night floor (0.0009, 0.0013, 0.0024). Sun
disc `smoothstep( 0.99995, 0.999985, μ )` × sunColor × 60 plus `pow( μ, 900 )·1.6` glow. Horizon band blended to
the fog colour over d.y ∈ [-0.02, 0.06]. Sun path at lat 20.5°, day of year.

**Gap.** No multiple scattering (twilight and the anti-sun sky are wrong), the scale mismatch, the raySphere bug, and a
pale, bright sky. TW's zenith is a deep blue at 0.33 effective exposure.

**Fix (light-post-sky).** Port all three LUT kernels as fragment passes (transmittance 256×64 and multi-scatter 32×32
once at start; sky-view 192×108 when the sun or camera height changes). Port `atmosphereSkyLuminance` into
`COMMON_GLSL`, replacing `skyLutUv`: every consumer of `uSkyLUT` (fog, water, env, clouds) switches to the
sun-relative mapping. Port the irradiance readback on the CPU (read the 192×108 LUT back once a second with
`readRenderTargetPixels`, or evaluate the 16×16 integral in a 1×1 pass and read 3 texels). Keep our real sun path
and the `y·6` real-metre altitude. Weather haze: TW keeps the sky clean (mieScale 1) and puts haze in AirHaze. Map
our `fog` weather value onto `hazeParams.density` (§5) rather than into the LUT's Mie density.

---

## 4. Sun, ambient and environment lighting (colours and intensities over the day)

**Tidewater** (`TW:src/engine/render/wgsl/lighting.js`, `TW:src/sky/Environment.js`, `TW:src/materials/GroundBounce.js`, `TW:src/App.js`)
- BRDF: three's physical model ported: Lambert diffuse, GGX (Smith height-correlated), `F_Schlick` with the
  `exp2( ( -5.55473·VdH - 6.98316 )·VdH )` fit, Karis DFG approximation, Fdez-Agüera multiscatter, **Lagarde
  specular occlusion** `sat( pow( NdV + ao, exp2( -16·rough - 1 ) ) - 1 + ao )`, roughness clamp 0.03..1, optional
  clearcoat and sheen (Charlie + Neubelt).
- Direct light: `sunColor × hookDirectModulation (clouds, caustics, hill shadow) × material sun modulation × sunShadow`.
  Foliage `translucency × lightColor` is added to the direct diffuse.
- **IBL**: sky + clouds (no sun or moon disc) rendered into a 128² cube, mipmapped, GGX-prefiltered into 6 levels
  (roughness 0, 0.2 … 1; 96 Hammersley samples with filtered importance sampling), diffuse = **SH9** of the cube
  (32² source mip, cosine lobe A0 1, A1 2/3, A2 1/4) stored as E/π. Refreshed when the sun moves 0.004 rad or
  every 3 s, **amortised one step per frame** (6 faces, mips, 6 filter levels, SH, swap). `envIntensity 1`. The
  lower hemisphere is the atmosphere's dark planet (albedo ≈ 0.06–0.1), not a painted ground.
- **Ground bounce** (`GroundBounce.js`): a 512² map (4 m texels) of `albedo · max( N·L, 0 ) · hill shadow − 0.08·L.y`
  (the env map's own ground, subtracted), where albedo = land-cover mix (sand (0.86, 0.79, 0.66) sRGB darker when
  damp, meadow (0.3, 0.36, 0.16) to jungle (0.12, 0.17, 0.07), rock 0.08, sea = seabed through the column).
  Blurred with a 5×5 binomial kernel. Shading: `E = map · sunColor · cloud · view · fade · selfShade · 0.6`, where
  `view = sat( -N.y·0.5 + 0.5 )`, `fade = smoothstep( -0.3, 0.3, above )·mix( 0.4, 1, smoothstep( 30, 4, above ) )`,
  and `selfShade = 1 - sat( -N.xz·Lh )·sat( 1 - L.y )·0.6`, added as indirect diffuse ×INV_PI. Rebaked when the
  sun moves. This lights the undersides of palm fronds, eaves and the pier from the sand.
- Colours over the day: the table in §0 (sun (10.3, 9.3, 8.1) at 60° down to (2.5, 0.43, 0.01) at 1°; sky E/π
  (0.10, 0.21, 0.46) to (0.04, 0.04, 0.055)). Night: key light = moon `(0.6, 0.7, 1.0)·0.12·night`, sky irradiance
  `+ 0.012·night·(0.6, 0.7, 1.0)`, and `night = smoothstep( -sunY, 0.02, 0.18 )`. The key light switches to the moon
  below sunY −0.07.

**Deadtide** (`DT:src/world/Sky.js`, `DT:src/game/World.js`): three `MeshStandardMaterial` (the same physical BRDF,
no specular occlusion without an aoMap). One `DirectionalLight` (intensity 1, colour = sunColor or moonColor).
`HemisphereLight` at intensity 0. IBL = PMREM of a sphere painted with the sky LUT (no clouds) plus a warm ground
`sunColor·sunY·( 0.16, 0.15, 0.12 ) + sky·0.25` below the horizon, greyed by cloud cover. Regenerated every 4 s or
0.02 of sun movement, **all at once** (a hitch). `environmentIntensity 0.85·( 1 - cover·0.2 )`. No ground bounce.

**Gap.** The energy balance (§0). Our env adds a bright warm ground under the horizon, which lights every vertical
surface from below: TW's is dark, and its bounce is explicit, local and shadow-aware. No clouds in the env. The
PMREM regeneration hitches.

**Fix (light-post-sky).** After §1/§3, paint the env sphere with `skyRadianceWithClouds( dir, false )` (the TW
atmosphere below the horizon, no painted ground). Amortise the PMREM (or port TW's cube + GGX + SH9, three's
`PMREMGenerator.fromCubemap` on a `WebGLCubeRenderTarget` updated one face per frame). Port ground bounce as a
camera-centred 512² map (4 m texels, 2 km, snapped to its texels and rebaked on sun move or when the camera
crosses 25 % of it) fed by our heightfield and surface maps. Add the hook to `patchMaterial` as extra indirect diffuse
(`irradiance += bounce(P, N)` in `lights_fragment_maps`). Add TW's specular occlusion to `patchMaterial` using our AO
term.

---

## 5. Fog / aerial perspective / sun shafts

**Tidewater** (`TW:src/post/AirHaze.js`, in post, on everything except the sky)
- Two exponential layers: **marine σ 1.5e-4 /m, H 110 m** and **aerosol σ 3.2e-5 /m, H 1400 m**, × `density` **1.6**
  (≈12 km visibility). Analytic optical depth per layer `σ·exp( -hc/H )·H·( 1 - exp( -vy·d/H ) )/vy`.
- Fog colour = `atmosphereSkyLuminance( normalize( dir.x, max( dir.y, 0.02 ), dir.z ) )` + moonlit sky.
- Sun in-scatter: `Ep = sunColor · hazePhase(cosθ)`, where hazePhase = Cornette-Shanks g **0.62** × 0.7 + isotropic
  0.3/(4π). `fSun = lum(Ep) / ( lum(Ep) + lum(skyIrradiance) ) · min( shafts, 1 )`. Geometry:
  `out = c·T + fog·( 1 - T )·( 1 - fSun·( 1 - h ) )`, `h = smoothstep( 0, 900 m, dist )`.
- **Volumetric shafts**: half-res march, 16 steps with quadratic spacing up to 2500 m, IGN + golden-ratio jitter.
  The shadow test is one hard cascade tap + the terrain hill shadow + the cloud shadow projected along the light.
  Output (lit share, marched/exact ratio, view dist). Temporal accumulation (3×3 clamp, 0.12 blend, disocclusion
  test 5 % + 0.3 m). Depth-aware upsample (weight `1/( rel·10 + 1 )²`). `near = Ep·lit·( 1 - h )·shafts`,
  `deficit = fog·fSun·( all - lit )·h`.
- **Screen-space god rays** (golden hour only, `fade` from the sun's screen position and `1 - smoothstep( 0.3, 0.75, L.y )`):
  a quarter-res sun mask `exp( ( c - 1 )·600 ) + exp( ( c - 1 )·50 )·0.25` × cloud transmittance on sky pixels, then
  3 radial blur passes of 8 taps (span 0.95 / 8^p, decay 0.9 / 0.97 / 1.0), gain **3.5** ×
  `( 1 - exp( -1.5e-4·300·density ) )`.

**Deadtide** (`DT:src/render/Materials.js` `atmosphereFog`, per material): one exponential layer, density
`1/16000 = 6.25e-5 /m` × weather fog (clear 0.8, fair 1.0 … storm 3.2), H = 320 m. Colour = sky LUT at
`max( v.y, 0.035 )` × 0.92 + `sunColor·pow( max( v·s, 0 ), 10 )·0.12`. No shafts or god rays. The sky has its own
horizon blend.

**Gap.** At sea level TW's extinction is 2.9e-4 /m against our 5e-5 (clear) to 6.25e-5 (fair): **4.6–5.8x less haze**.
Far headlands stay crisp and "CG", where TW's fade into a luminous blue haze. Our world is 1:8 horizontally, so
distances are already 8x compressed and we need *at least* TW's density to read as far. There is also no light
through the air (shafts), which is a big part of TW's golden-hour look.

**Fix (light-post-sky).** Replace `atmosphereFog` with TW's two-layer `hazeLayerDepth` + fog colour + `fSun`
partition (per material is fine: it is analytic). Start with density 1.6 and map weather `fog` to `density·fog`.
Port the shaft march + temporal + composite as post passes over `sceneDepth`, reading our sun shadow map, and port
the god rays (4 quarter-res passes, only while `ssFade > 0.001`).

---

## 6. Shadows

**Tidewater** (`TW:src/engine/render/Shadows.js`, `TW:src/engine/render/wgsl/lighting.js`, `TW:src/world/TerrainGPU.js`, `TW:src/sky/SkyProClouds.js`)
- **3 cascades, splits 10 / 60 / 400 m**, 2048² each (depth32float array), standard-Z ortho. Each is fitted to the
  bounding sphere of its frustum slice (radius quantised to 1/16 m), texel-snapped, with lightMargin 200 m (depth
  range = 200 + extent). **Normal bias [0.015, 0.06, 0.3] m**, depth bias 2e-5, rasteriser depthBias 2, slope 1.5.
  Updated every 1 / 2 / 4 frames (all when the sun moves). Seam blend `max( 0.25e², 0.25e )·400` m: 2.5 m at 10 m,
  15 m at 60 m, a 100 m fade-out at 400 m.
- **Cascade 0 PCSS** (contact hardening): sun angular diameter **0.00925**, search radius
  `clamp( 30 m·SD/width, 1.5, 24 texels )`, **8 blocker taps** + the centre texel, penumbra
  `clamp( dz·SD/width, 1.2, 32 texels )`, **12 PCF taps**. Both Vogel discs are rotated by IGN
  `( pixel + frame%64·5.588 )` (TAA resolves the noise). Other cascades: 5-tap Vogel hardware-compare PCF over 1 texel.
- **Heightfield sun shadow** (hills, beyond the maps): 512² at 4 m, march from 24 m in 24 steps (dt 6 m ×1.22 growth,
  ≈3 km), r16f max-mip heights. Soft edge `w = occluderDist·0.012 + 0.35`,
  `smoothstep( -w, w, P.y - shadowTop )`. Rebaked when the sun moves.
- **Cloud shadow**: 256² r32f map over 12 km around the camera (a quarter of the rows per frame), optical depth
  along the key light, **strength 0.85**.
- Water uses the 5-tap PCF only (`sunShadowPCF`). Haze uses a single hard tap.

**Deadtide** (`DT:src/game/World.js`): one `DirectionalLight` map, medium 1024² ±55 m / **high 2048² ±85 m** / ultra
4096² ±120 m, centred 0.45·half ahead of the camera, texel-snapped, near 1 far 1400, bias -0.0004, normalBias
0.04, radius 2. three r186 `PCFShadowMap` is itself 5 Vogel hardware taps rotated by IGN. Terrain nodes ≤512 m cast.
Plants skip the shadow pass beyond 160 m. Cloud shadow = the 2-D sky coverage projected to y 1100 with K 0.5.

**Gap.** Range (120 m ahead vs 400 m + 3 km hill shadow + 12 km cloud shadow), near resolution (8.3 cm vs ~1 cm
texels), no contact hardening (a palm crown 10 m up casts a sharp shadow in ours), no terrain self-shadow at low
sun (TW's long hill shadows at golden hour), and weak cloud shadows.

**Fix.** light-post-sky: port `SunShadows` (fit, snap, periods, seam blend) and the lighting.js filters to GLSL. Render
each cascade with three's own `renderer.shadowMap.render( [ lightI ], scene, camera )` on three hidden
DirectionalLights not added to the scene, so `customDepthMaterial` (terrain skirts, vegetation) keeps working. Sample in
`patchMaterial` by replacing the directional light's shadow factor. WebGL2 can't read one depth texture both raw
and with compare, and PCSS needs raw reads, so use `BasicShadowMap`-style targets (no compare mode) and do the
compares manually as TW's PCSS does. terrain: port the heightfield sun-shadow bake as a camera-centred 512² at 4 m
(or 1024² at 8 m for 8 km; our islands are big), rebaked on sun move or camera recentre, exposed as
`terrainSunShadowAt( P )` in `COMMON_GLSL`. clouds: §13.

---

## 7. Ambient occlusion

**Tidewater**
- **GTAO** (`TW:src/post/GTAO.js`, a port of three's r186 `GTAONode`): half-res depth copy (r16f, negated where water
  covers), **samples 12 → 3 directions × 4 steps**, **radius 2.2 m, thickness 2.0 m, scale (exponent) 1.6**,
  temporal rotations [60, 300, 180, 240, 120, 0]°, spatial offsets [0, 0.5, 0.25, 0.75], 5×5 magic-square noise,
  quadratic step distribution, normals reconstructed from depth. Then a separable 5+5 bilateral blur
  (`w = 1/( rel·40 + 1 )²`, rel = |Δd|/d).
- Composite (`PostFX` beauty pass): a depth-aware 4-tap upsample, **multi-bounce** `max( a, ( ( a·0.382 - 1.036 )·a +
  1.654 )·a )` (Jimenez 2016, albedo ≈ 0.35), applied as `c *= mix( 1, aMB, k )` with
  `k = aoStrength(1)·mix( 0.35, 1, 1 - smoothstep( 0.12, 0.9, lum(c) ) )`. That is full AO where a pixel is lit
  by the sky alone and a third of it on sunlit surfaces. Sky and water-covered pixels are skipped.
- Material AO: baked terrain horizon AO (§8), canopy exposure AO (§12), grass base AO (§11). These feed `s.ao` and
  the specular occlusion.

**Deadtide**: none in post. Vertex AO in the plant geometry (`aMat.y`) only. No terrain AO.

**Gap.** Nothing grounds objects, buildings, rocks or plants. With ambient 5–7x too bright (§0) this is the second
reason everything looks flat.

**Fix (light-post-sky).** Port GTAO + blur as fragment passes on `sceneDepth` (half res). Apply it to `T.scene` colour
**before** the water composite (between steps 1 and 2 in `Renderer.render`): water never gets AO, and the refraction
sees the AO'd seabed, as in TW. Use TW's luminance weighting. The thresholds 0.12 / 0.9 are in TW's pre-exposure units,
which match ours once §1 is done.

---

## 8. Terrain materials

**Tidewater** (`TW:src/world/Terrain.js`, `TW:src/world/terrain/TerrainShading.js`, `DetailTextures.js`, `TerrainBake.js`, `TerrainGPU.js`)
- **No photo textures.** One **512² RGBA8 tileable detail height texture**, generated on the CPU and mipmapped, aniso 4:
  R = rock (warped Voronoi plates, 7 cells, with bevelled facet tilt, chips at 23 cells, grain fbm 16), G = soil
  (leaf blobs 26 cells, clumps fbm 10, stones 12 cells), B = sand (grain noise at 180 + 90, pebbles Worley 18),
  A = fbm (4 base cells, 5 octaves).
- Sampled at **6 scales / rotations**: macroA `rot( xz, 0.7 )/173 m`, macroB `rot( xz, 2.1 )/47 m`, dM
  `rot( xz, 1.3 )/6.7 m`, dN `xz/1.9 m`, dF `rot( xz, 2.4 )/0.63 m`. Rock is triplanar at 27 / 6.1 / 1.3 m
  (`w = a⁴`, normalised), with vertical stretched lookups for fall-line streaks (`p.z/9.3, h/37`).
- **Normals = surface-gradient bump** (Mikkelsen) from a scalar relief height `hd` (m), built per material:
  sand `grain·0.004 + grainF·0.003 + pebbles·0.004 + wind ripples 0.005 + wave ripples 0.012 + megaripples 0.035`,
  meadow `dN.y·0.05 + dF.y·0.012 + dM.y·0.045 + clump·0.12 + comb·0.03`, rock `R.hd·2.2 + R.height·0.6`. The tilt
  is clamped to ~55° and faded where the screen frame degenerates.
- Macro data: normal texture (xz, **rock mask**, **baked AO**) and splat (sand, paths, gullies/seagrass, rubble/scarp),
  mipmapped. **Baked AO**: horizon-based on a 4 m grid, **8 directions × steps [4, 8, 13, 19, 27, 38, 52, 72, 100] m**,
  `vis = mean( 1/( 1 + tan²θ ) )`, × a cavity term `1 - max( 0, cav - 0.5 )·0.7` from the height Laplacian over a
  2 m baseline. Written to `s.ao` together with detail AO (jungle `dN.y·0.5 + 0.7`, meadow clump
  `smoothstep( 0.2, 0.7, clump )·0.35 + 0.65`, canopy).
- Land cover: jungle weight from height 9–24 m, slope 0.18–0.36, and gullies. Rock where the mask, slope, convexity
  (AO) and streaks agree (`rv` score, `smoothstep( 0.5, 0.68 )`), with a **scree band** `smoothstep( 0.28, 0.52 )` of
  dark humus and moss, laterite landslide scars, worn paths.
- **Rock** (`terrainRockSurface`): palette rockDark (0.15, 0.145, 0.135), rockMid (0.3, 0.285, 0.265), rockLight
  (0.48, 0.455, 0.42) sRGB, then × (0.36, 0.34, 0.31) for inland basalt. Lava-flow bedding strata on steep faces, rain
  streaks, lichens (pale (0.7, 0.7, 0.64), orange (0.78, 0.5, 0.2)), moss on ledges, splash-zone black band, barnacles,
  algae, coralline below the water, wet darkening ×0.55 below the swash line. Roughness 0.8–0.88, wet 0.45.
- **Meadow** (`terrainMeadowTone`, shared with the grass so the blades fade into the ground): lush (0.13, 0.2, 0.05),
  green (0.25, 0.32, 0.1), olive (0.36, 0.37, 0.14), yellow (0.5, 0.46, 0.2), straw (0.62, 0.54, 0.33), soil (0.17,
  0.13, 0.08) sRGB, mixed by macro noise + slope + south exposure. Clump contrast grows with distance
  (`mix( 0.34, 0.95, smoothstep( 40, 140, d ) )`), wind comb streaks (`xz·wind/7.5, xz·perp/0.9`), a travelling gust
  sheen `×( 1.25, 1.22, 1.06 ) + 0.01`, soil gaps seen from above, and more saturation at grazing angles.
- Jungle floor (0.1, 0.16, 0.05) and litter, and a **far canopy** carpet of lumpy crowns (61 m and 13 m fbm)
  beyond 25–70 m on forested ground (0.05, 0.08, 0.025)–(0.22, 0.27, 0.09) sRGB, with bump 2.5·canopyH.
- `materialSunModulation`: heightfield sun shadow × tall-meadow self-shading `mix( 1, smoothstep( -0.05, 0.45, sunY )
  ·0.35 + 0.62, meadowW )`.
- Mesh: CDLOD gridSize 40, leafSize 8, 9 levels, rangeFactor 2.0, **0.2 m vertices at the camera**.

**Deadtide** (`DT:src/world/Terrain.js`, `DT:src/workers/world.worker.js`): quadtree of 32×32 nodes, **LEAF 64 m → 2 m
spacing**, geomorph, skirts. Per-vertex surface (moisture, lava, red soil, field) and masks (city, road, pasture,
shore) from the worker. Fragment: **512² photo JPGs** (grass 3.2 m, dry 3.4, forest 4.1, dirt 4.0, red 4.3,
farm 3.0, lava 5.0, rock triplanar 6.0, cliff 24, sand 3.6, snow 5.0), renormalised by their own luminance and
repainted with linear palette constants (green (0.1, 0.175, 0.032), lush (0.05, 0.11, 0.02), olive (0.15, 0.17, 0.05),
straw (0.27, 0.235, 0.14)). Value-noise blends at 41 / 13 / 97 / 5.3 / 260 m, macro `×( 0.84 + macro·0.32 )`.
Normal = 3 normal maps with an approximate tangent frame, faded 60–220 m. Roughness 0.92. No AO, no hill shadow, no
bump from detail heights.

Measured albedo means (linear): **our grass (0.133, 0.171, 0.014)** vs TW meadow green (0.051, 0.084, 0.010), 2x
brighter and yellower. Our forest ≈ (0.04, 0.09, 0.016)·tex vs TW jungle floor (0.010, 0.022, 0.004) and canopy
(0.017, 0.036, 0.005), 3x brighter. Our steep-face rock (`rock_d.jpg`, mean 0.012) is about half TW's inland basalt
(rock mid 0.066 × (0.36, 0.34, 0.31) ≈ 0.023, before moss). TW's coastal boulders use the full palette (0.066). Our
cliff top texture is 0.12.

**Gap.** Photo tiles at 3–6 m repeat and smear at distance, and their fixed tangent-frame normal maps give weak relief.
TW's look comes from the multi-scale procedural relief (ripples, grain, clumps, plates) lit by a strong sun with
bump normals, plus the baked AO. Our vegetation-ground palette is too bright and yellow, which kills the contrast
against the beach. The 2 m mesh can't show dunes, berms or scarps.

**Fix (terrain).** Adopt `DetailTextures.js` verbatim (CPU generation, ~0.3 s; or bake once to a PNG) plus
`TerrainShading.js` (`terrainPerturbNormal`, `terrainTriplanar`, `terrainRockSurface`, `terrainMeadowTone`) into
GLSL. Rewrite `TERRAIN_ALBEDO/NORMAL` on TW's structure while keeping our land-use inputs (moisture, lava, red soil,
fields, city, roads) as weights. The TW palette becomes the base colours (our lava, cinder and snow keep their own
look). Bake **horizon AO + cavity** per vertex in the worker (TW's steps scaled to our 8 m grid; send it as the
`nor.w` byte that is free today) and multiply `material.aoMap`-style into `ambientOcclusion`. LEAF 16 m (0.5 m)
within ~150 m. Add `materialSunModulation` (heightfield shadow).

---

## 9. Sand, beach and wet sand

**Tidewater** (`TW:src/world/Terrain.js` sand block, `TW:src/ocean/ShoreSim.js`, `TW:src/world/debris/*`)
- Dry sand (0.83, 0.75, 0.6) → (0.9, 0.84, 0.72) sRGB by macro + height; warm coarse drifts (0.84, 0.72, 0.55)·0.45;
  ×`( dM.w - 0.5 )·0.16 + 1`, ×`( grain - 0.45 )·0.3 + 0.97`; trodden patches −7 %; **wrack band** at h 1.15–2.1 m with
  pebbles and shells (0.86, 0.82, 0.74)/(0.78, 0.64, 0.6)/(0.36, 0.33, 0.3) and dried seaweed (0.24, 0.18, 0.11);
  pebbles fade 12–35 m.
- **Wind ripples**: phase `dot( xz, windDir )·2π/0.105 m` + fbm warps (24·dM.w + 7·dN.w + 30·macroB), shape
  `pow( sin·0.5 + 0.5, 1.6 )`, albedo ±6 % and bump 5 mm, anti-aliased by `1 - smoothstep( 0.6, 2.2, fwidth( ph ) )`,
  only above h 1.5–2.2 m and off paths.
- **Wet sand**: `albedo·wetDarken (0.58)`, saturation 1.15, tint (0.97, 0.98, 1.0); roughness `mix( 0.42, 0.16, wet )`
  (a glossy fresh film); damp band `smoothstep( 1.7, 0.5, h )` × 0.22–0.5 mottle; drying edge mottled; backwash
  **rills** (`dot( xz, slopeDir )/3.2, perp/0.3`); **swash marks** (wavy grit lines every 0.13 m of height between
  0.2 and 1.6 m); **foam residue** lace (0.88, 0.9, 0.9) from ShoreSim, roughness 0.7.
- Swash simulation (ShoreSim): r foam, g wetness (dries ~30 s), b stranded foam, a flow speed.
- Clutter: PebbleField (4 m cells, R_FAR 25 m, 150 small + 44 chips + 18 cobbles per cell), Debris (driftwood
  photoscans, coconuts, shells, coral, fronds, rope, nets).

**Deadtide**: sand texture desaturated 45 % × (1.62, 1.52, 1.34), giving a measured **albedo (0.33, 0.27, 0.19)**, half of
TW's (0.66, 0.52, 0.32)–(0.79, 0.67, 0.48). Beach mask from `shore` + height. Wet: ×(0.62, 0.6, 0.56) below 0.7 m,
roughness −0.25. No ripples, marks, wrack, residue or clutter.

**Gap.** Our beaches read grey-brown and dull. TW's white coral sand with 10 cm ripples in raking light and a glossy
wet band is its signature shot.

**Fix.** terrain: port the sand block wholesale (ripples, grain, wrack, wet film, rills, swash lines; the wetness
source can be our tide/wave state instead of ShoreSim at first, TW's fallback `smoothstep( 0.5, 0, h )`). water: the
swash/wetness coupling. other (items or world clutter owner): pebble field and wrack debris.

---

## 10. Water

**Tidewater** (`TW:src/ocean/*`)
- **FFT** (`OceanFFT.js`): Tessendorf, JONSWAP/Horvath, **4 cascades 733 / 157 / 33.3 / 7.1 m**, 256² each. Local sea
  (wind 7 m/s, dir 25°, fetch 120 km, spread 0.85, swell 0.05) + swell system (scale 0.48, 6 m/s, dir 5°, fetch
  1200 km, spread 1, swell 0.9, short-wave fade 0.1). **Choppiness 0.9**, depth 500. Foam from the Jacobian:
  bias 0.58, gain 3.0, decay 0.35, add 2.5. Output displacement (Dx, Dy, Dz, foam) + derivatives, mipmapped.
- Surface (`WaterSurface.js`): CDLOD grid 32, leaf 8, 12 levels. Shallow attenuation per cascade
  `d0 = min( 40, size·0.08 )`, floors [0, 0.05, 0.25, 0.5]. Foam coverage weights [0.35, 0.45, 0.5, 0.25],
  sharpness 2.2, foam texture scale 0.09 /m (procedural `FoamTexture`: density, bubbles, mottling, streaks).
  **SeaDetail**: world-space gusts (cat's paws), slicks, windrows.
- **Shading** (`WaterMaterial.js`): exact dielectric Fresnel, IOR 1.333. Roughness α² = `0.035² + mss·2·unresolved·rough²
  + foam·0.2 + aeration·0.03`, with Cox–Munk `mss = 0.003 + 0.00512·U`. Reflection = `skyReflectionRadiance`
  (atmosphere + cloud panorama + trace of stars), tilted up by the unresolved slope `σ·1.3`; below-horizon
  reflections fade to `horizonColor·0.35` (`smoothstep( -0.12, 0.08, R.y )`). **SSR**: 11 geometric steps
  (×1.7) + 3 bisections, to 260 m, rays with R.y < 0.45 only. Sun: GGX with `Fs`, clamped 400, × PCF shadow × cloud
  shadow × hill shadow.
- **Water column**: absorption **σa = (0.42, 0.075, 0.035) /m**, scattering **σs = (0.012, 0.018, 0.024) /m**,
  backscatter 0.035, HG g **0.86** (0.7 HG + 0.3 iso), Gordon multiple-scatter albedo `bb·1.32/( σa + bb )`. The
  view ray is **refracted (Snell) and traced to the terrain** (2 refinements, ≤400 m) instead of the straight screen
  ray. Analytic in-scatter of the sun (refracted, `1 - F`) and the sky along it. Refraction image = **RefractionPass**
  (the scene below sea level + 0.4 m only, half res, guard band L/R 0.15, bottom 0.6). Crest translucency
  `sunLight·( 0.12, 0.55, 0.45 )·0.06·back^2.5·crest`.
- Shore: `ShoreWaves` (travel-time field, Green's-law shoaling, plunging crest geometry, bores, swash run-up with
  beach slope 0.066), `Breakers` (thrown lip ribbon + spray), `SurfFoam` (lace texture, 3.5 m tile), `ShoreSim`,
  caustics (photon splatting, 2 focal planes), underwater lighting, wake, whale water.

**Deadtide** (`DT:src/world/Ocean.js`): camera-centred polar grid (224 segments, 0.5 m first ring, ×1.045 growth);
**8 Gerstner waves** (L 46…2.9 m, a = L/(95 + 6i), Q ≤ 0.55/(k·a·8)); a sine "surf" bump on the depth contours;
Jacobian foam `( 0.55 - jac )·1.8`. Two scrolling ripple normal layers (9 m, 3.1 m). Refraction = screen offset
`N.xz·0.04`. Water column thickness = the **straight** view ray `sceneDist - dist` (≈10x too long at grazing
angles). Absorption **(0.46, 0.085, 0.062)·1.6 = (0.74, 0.14, 0.10) /m** (1.75x/1.8x/2.8x TW's), plus a painted
scatter colour mix (shallow (0.05, 0.28, 0.28), deep (0.004, 0.035, 0.085), scaled by daylight). Reflection = sky
LUT at `R.y = abs( R.y )` (downward reflections mirror into the bright sky), `×( 1 - cover·0.35 )`, no clouds, no
SSR. Schlick F0 0.02. Spec = `a²/( π·dd² )·0.25·F`, no visibility term. Foam from value noise. Alpha fade over
6 cm at the shore. Per-pixel atmosphereFog.

**Gap.** Everything: wave spectrum and detail (FFT + cascades vs 8 sines), physical colour (our turquoise shallows
come from the absorption, the straight-ray path and the painted mix, all too dark and too blue at grazing angles),
reflection (`abs( R.y )` makes the back faces of waves glow), no SSR (no reflected headlands or piers), no shore
breaking or swash.

**Fix (water).** Phase 1 (shading only, big win): port `WaterMaterial` shading with TW's σa/σs/backscatter/HG, exact
Fresnel, Snell-traced column to our bathymetry texture (`uBathy`), Cox–Munk roughness, `skyReflectionRadiance`
(needs §3 + §13 panorama), horizon occlusion instead of `abs( R.y )`, SSR on `sceneDepth`, TW foam lighting.
Phase 2: FFT in WebGL2 fragment passes. There is a precedent in `three/examples/jsm/misc/Ocean.js`, but port TW's
spectrum, 4 cascades 256², Jacobian foam and constants. Phase 3: SeaDetail, foam texture, shore waves / swash
(big), caustics.

---

## 11. Grass field

**Tidewater** (`TW:src/world/vegetation/GrassField.js`): camera-following cells **CELL 8 m**, **384 clump slots per cell
(6 /m²) × 7 blades = 42 blades/m²** (Mitchell blue noise). Three LODs share the blades: **near < 18 m** (3 segments, all
tiers), **mid < 46 m** (2 segments, tiers 0–1), **far < 88 m** (1 triangle, tier 0). Tiers `[0, 0, 1, 1, 2, 2, 2]`
thin out with distance while the survivors widen (constant coverage), then hand over to the terrain meadow tone.
Kinds: meadow grass (knee to waist), dune grass, sea oats (12/cell), creeper vines (28/cell), flowers. Placement
from an RGBA density mask. Shading: base `mix( tone·0.5, soil, 0.3 )` → tip `tone·( 1.25, 1.25, 1.05 )` toward
straw by dryness. Dead blades share `mt.dry·0.3 + 0.07`. Pale midrib `pow( 1 - |across|, 6 )·0.18`. **AO
`mix( 0.32, 1, smoothstep( 0, 0.75, hf ) )`**, roughness 0.8, specularIntensity 0.4, normal `normalize( N + V·0.4 )`,
**translucency `albedo·( 1.1, 1.3, 0.6 )·pow( sat( -V·L ), 4 )·0.3·smoothstep( 0.2, 1, hf )`**. Wind: shared gust
field (detail fbm at 140 m / 61 m, offset integrated at `0.7·wind + 1.5` m/s), bend `w·( g·0.55 + 0.22 ) +
sin·w·0.1`, flutter, and **gust sheen** `×( 1.3, 1.28, 1.1 ) + ( 0.03, 0.03, 0.015 )`.

**Deadtide** (`DT:src/world/Vegetation.js`, `scatter.js`, `PlantGeometry.buildGrassClump`): clumps on a 0.95 m lattice
(≈1.1 /m²) × 11 blades (0.28–0.62 m) ≈ **12 blades/m²**, out to **45 m** (high; 60 ultra), thinned from 35 %, no
shadows, tinted per clump; plus TALLGRASS plants.

**Gap.** 3.5x fewer blades, half the range, and no shared ground tone, so the grass reads as sparse tufts on a
texture. TW's reads as a sward that melts into the terrain.

**Fix (vegetation, with terrain supplying `terrainMeadowTone`).** Port GrassField's cell/tier/LOD scheme and shading
(constants above) as an InstancedBufferGeometry with the density from our worker masks.

---

## 12. Vegetation shading (translucency, AO, wind, LOD / impostors)

**Tidewater** (`TW:src/world/vegetation/VegNodes.js`, `VegMaterials.js`, `Impostors.js`, `InstanceLOD.js`)
- **Canopy leaves**: albedo = species palette × leaf-atlas brightness ×1.4; outer leaves `×( 1.16, 1.22, 0.92 )` by
  `smoothstep( 0.62, 1, ao )·0.7`; interior `× mix( 0.55, 1, ao )`; **`s.ao = mix( 0.35, 1, ao )`** (indirect only);
  roughness 0.82 / 0.65 by species; **specularIntensity 0.15**; normal `normalize( geoN + V·0.7 )` (spherical canopy
  normal, not flipped); translucency `vegTranslucency( albedo, geoN, 0.5 )·( ao·0.6 + 0.4 )`, where
  `vegTranslucency = ( albedo·( 1.25, 1.45, 0.55 ) + ( 0.012, 0.018, 0 ) )·sat( -N·L )·( pow( sat( -V·L ), 3 )·0.7 + 0.3 )
  ·strength·( 1 - night )`, multiplied by the *shadowed* light colour. Cards seen edge-on get thinned
  (`( 1 - smoothstep( 0.08, 0.35, facing ) )·0.45` added to the coverage threshold).
- Palms, bananas, ferns: roughness 0.62–0.7, specularIntensity 0.4 (bark 0.3, broadleaf 0.42), translucency 0.3
  (broadleaf 0.2), normal `+ V·0.15`. Procedural palm bark (leaf-scar rings, fissures, lichen, boot fibres).
- Bark: `s.ao = smoothstep( 0, 0.75, hf )·0.45 + 0.4` (dark under the crown), roughness 0.92.
- Wind: `vegPlantDeform` (stem sway `w²·0.014·( g·0.9 + 0.3 )`, frond bend `s²·sc·4.5·( … )`, bounce, flutter,
  length-preserving rotation about the crown) with the gust field from the detail texture.
- LOD: **octahedral impostors 6×6 frames of 128 px** (albedo+coverage / normal+exposure atlases), a 3-frame
  barycentric blend within 100 m, forest thinned 50 % over 140–320 m, shrubs dropped beyond 180 m. Near → impostor at
  **75 m (trees) / 45 m (shrubs)**. Bayer 4×4 screen-door cross-fade band 12 %, re-shuffled every frame for the TAA.

**Deadtide** (`DT:src/world/vegetation/VegMaterial.js`, `Impostors.js`): already modelled on TW: same palm deformation
maths (constants within ~10 %), Bayer fades, impostors, rank thinning, canopy normal bend 0.45, translucency
`diffuse·( 1.05, 1.25, 0.5 )·back·( pow4·0.6 + 0.4 )·0.5`, albedo `× mix( 0.42, 1.05, ao )`, roughness 0.68–0.72
(bark 0.92). **`MeshStandardMaterial` specular F0 0.04** (TW 0.15 × 0.04 = 0.006). The AO goes only into the
albedo, with no separate indirect-only term, and there is no ground bounce under the crowns.

**Gap.** Leaves get 6.7x TW's specular: a grey sheen under the bright sky. TW darkens the albedo
(`mix( 0.55, 1, ao )`) *and* the indirect light (`mix( 0.35, 1, ao )`), so crown interiors get ≈3x less ambient than
ours at the same ao. With our flat lighting (§0) the crowns lack the dark interiors and backlit glow of TW's.

**Fix (vegetation).** Use `MeshPhysicalMaterial` (or patch `specularIntensity` into the standard shader: `material.specularIntensity`
exists on Physical) with 0.15 (leaves), 0.4 (palms, grass), 0.3 (bark). Feed `ao` into `ambientOcclusion` (the
`aomap_fragment` path) instead of the albedo for the indirect part (keep `mix( 0.55, 1, ao )` on the albedo as TW
does). Adopt TW's translucency formula (pow 3, 0.7/0.3, tint + offset, × (1 − night)). Everything else follows once
§1–§7 land.

---

## 13. Clouds

**Tidewater** (`TW:src/sky/SkyProClouds.js`, port of sky-pro-webgpu "Partly cloudy", default; `?oldClouds` →
`Clouds.js`)
- Shell **altitude 4000 m, thickness 5200 m**, density 0.019, **coverage 0.49** (+0.12 toward the horizon over
  20–65 km), edge softness 0.095. Weather map 1024² procedural fbm (main mass (4, 5, 0, 1.32), detail (6, 6, 1, 0.13)),
  weatherScale 29 km, **64³ Perlin–Worley base noise** (`public/clouds/baseShape64.bin`) at 7.5 km, erosion ×0.13
  scale, strength 0.24 → 2.15 with height, base weather 0.54 up to 0.13.
- Lighting: cone-traced light march **6 taps**, **3 scattering octaves** `energy = e^(-τ) + 0.5·e^(-τ/2) +
  0.25·e^(-τ/4)` against phases HG (0.8, 0.4, 0.2) 80 % + (−0.2, −0.1, −0.05) 20 %, powder 0.7 (away from the sun),
  base darkening 0.88 up to 0.13, ambient 0.7 × (1 + 0.99 multi-scatter) from TW's sky (zenith / horizon, sky
  visibility), ground bounce albedo (0.009, 0.015, 0.019). Direct = the LUT transmittance at cloud altitude × 11.
  Aerial perspective over 30 km, horizon melt 25–45 km.
- Quality: half res, **lattice 4 (1/16 of the pixels traced per frame)**, max 256 steps, 25 m base step, history
  weight 0.9, temporal reconstruction. Panorama 512×160 (1/16 per frame) for reflections and IBL. Shadow map 256² /
  12 km, strength 0.85. Cirrus veil at 9000 m, amount 0.5. Wind 12 m/s, skew 1750.

**Deadtide** (`DT:src/world/Sky.js`): slab **900–1900 m**, 2-D value-noise fbm coverage (2600 m cells), a profile and
3 value-noise detail octaves, density ×0.045, 36 steps (18 low), 4 light taps (k² × 32 m), Beer + powder, HG blend
`mix( hg( 0.6 ), hg( -0.25 ), 0.3 )·2.2 + 0.08`, ambient painted top/bottom colours; **quarter res, jittered per frame,
no temporal accumulation**; fades with `exp( -t0/42000 )`; weather coverage 0.18–0.96.

**Gap.** Ours are soft blobs with no 3-D structure, no silver lining or dark bases, noisy, and absent from
reflections and IBL.

**Fix (light-post-sky).** Port SkyProClouds' march (density, erosion, light march, octaves, powder, ambient) +
lattice/temporal reconstruction as fragment passes. Generate the 64³ noise ourselves: `baseShape64.bin` comes from
sky-pro, whose licence is not stated. Build a standard Perlin–Worley 3-D texture (Schneider 2015) as a
`Data3DTexture`. Map weather cover → coverage. Altitude: 4000 m sits above our highest summit (≈720 m game units),
so keep TW's numbers. Add the panorama (for water and env) and the 256² shadow map (replaces `cloudCoverage`).

---

## 14. Night

**Tidewater** (`TW:src/App.js` `updateSun` / `applyAtmosphereReadback`, `TW:src/sky/Sky.js`, `TW:src/materials/LocalLights.js`)
- `night = smoothstep( -sunY, 0.02, 0.18 )`, moon dir `normalize( -sun.x, |sun.y|·0.8 + 0.25, -sun.z )`. The key
  light switches below sunY −0.07. Moon light `(0.6, 0.7, 1.0)·0.12·night`. Sky irradiance `+ 0.012·night·(0.6,
  0.7, 1)`. Shadows stay on.
- Sky: the atmosphere (real twilight via multi-scatter), moonlit sky `(0.005, 0.0068, 0.0105)·( mix( 1.7, 1,
  sat( y·3 ) ) + e^(-14a)·2.4 + e^(-2.5a)·0.9 )·night`, moon disc r 0.0048 rad, colour (0.9, 0.92, 1)·3. Stars: one
  candidate per cube-face cell (160 cells per half face), probability `band·0.035 + 0.025` with a Milky Way band
  (pole (0.3, 0.2, 1)), magnitude `log2( u )·0.602 + 6.5`, limiting magnitude `dark·7.5 − 1`
  (dark = `1 - smoothstep( -0.28, -0.1, sunY )`), flux `u^-0.8`, PSF σ 0.1 cell growing with flux, twinkle,
  ×0.0075, Milky Way glow (0.55, 0.6, 0.75)·band·0.0035.
- Exposure: auto exposure capped at 2 at night (dark scenes stay dark).
- Local lights: nearest 8 packed per frame, inverse-square with window `( 1 - ( d/r )⁴ )²`, GGX (Lambert on terrain,
  rocks and foliage), lanterns `(1, 0.72, 0.42)·7.5`, range 11, flicker 0.08; flashlight 55, range 30.

**Deadtide**: `night = 1 - smoothstep( sunY, -0.2, 0.02 )`, moon colour `(0.55, 0.65, 0.9)·0.12·moonUp·( 0.3 +
0.7·phase )·night·nightBrightness` (a real moon phase: keep it), exposure `1 + 1.4·night` (2.4), a grade tint
(0.86, 0.95, 1.18)·0.6. Stars: hashed 3-D grid (180 / 420), threshold 0.985, ×0.004, no magnitude distribution or
Milky Way. The moon is 7x too big (bug 2). LUT floor (0.0009, 0.0013, 0.0024).

**Fix (light-post-sky).** TW's star field, moonlit sky and moon disc verbatim. The night ambient terms. The auto
exposure cap replaces the fixed 2.4 and the grade tint (the atmosphere and moonlight carry the colour).
Local lights: whoever owns city lamps should mirror TW's packing and falloff (forOtherModules).

---

## A. WGSL → GLSL cheat sheet (for everyone porting)

| WGSL | GLSL ES 3.0 |
|---|---|
| `let x = …;` / `var x = …;` | `float/vec3 x = …;` (type explicitly) |
| `vec3f( … )`, `vec2i`, `mat3x3f( a, b, c )` | `vec3( … )`, `ivec2`, `mat3( a, b, c )` (both column-major) |
| **`select( f, t, cond )`** | **`cond ? t : f`** (note the argument order!) |
| `sat( x )` (TW common) | `clamp( x, 0.0, 1.0 )` |
| `textureSampleLevel( t, s, uv, l )` | `textureLod( t, uv, l )` |
| `textureSampleGrad( t, s, uv, gx, gy )` | `textureGrad( t, uv, gx, gy )` |
| `textureLoad( t, p, 0 )` | `texelFetch( t, p, 0 )` |
| `textureSampleCompareLevel` | `texture( sampler2DShadow, vec3( uv, z ) )` |
| `dpdx`, `dpdy`, `fwidth` | `dFdx`, `dFdy`, `fwidth` |
| `atan2( y, x )` | `atan( y, x )` |
| `fract`, `mix`, `smoothstep`, `step`, `pow`, `exp2` | same |
| `bitcast<u32>( f )` | `floatBitsToUint( f )` |
| `u32` hashes (`pcg`, `mxHash`) | `uint`, same operators (WebGL2 has 32-bit uint) |
| `frame.sunDir`, `frame.sunColor`, `frame.skyIrradiance`, `frame.horizonColor`, `frame.time`, `frame.night`, `frame.windDir/windSpeed` | add to `G` in `DT:src/render/Materials.js` (`uSunDir`, `uSunColor`, `uSkyIrr`, `uHorizon`, `uTime`, `uNight`, `uWind`, `uWindSpeed`) |
| `frame.frameIndex` (for IGN / Bayer rotation) | add `uFrame` to `G` |
| reversed-Z depth, `viewDepth( d )`, `worldFromDepth( uv, d )` | ours is reversed-Z too (`renderer.reversed`); port `common.js` helpers with our `uInvProj` / camera matrices |
| compute kernel writing a storage texture | full-screen `ShaderMaterial` pass into a float `WebGLRenderTarget` (one draw per kernel; loops stay) |
| storage-buffer readback | `readRenderTargetPixels` on a tiny RT (async if possible) |
| `#if DEFINE` in TW snippets | `#if DEFINE` / `defines: {}` |

Header rule: every ported file starts with `// Ported from Tidewater <path> (MIT, see LICENSE-Tidewater.txt)`.

## B. For other modules (not owned by this workflow)

- **Vegetation** (`src/world/Vegetation.js`, `vegetation/*`, `scatter.js`):
  1. Port `TW:src/world/vegetation/GrassField.js`: CELL 8, 384 clumps/cell × 7 blades, R_NEAR 18 / R_MID 46 / R_FAR 88,
     tiers [0, 0, 1, 1, 2, 2, 2] with width compensation, AO `mix( 0.32, 1, smoothstep( 0, 0.75, hf ) )`,
     translucency `albedo·( 1.1, 1.3, 0.6 )·pow( sat( -V·L ), 4 )·0.3·smoothstep( 0.2, 1, hf )`, roughness 0.8,
     specularIntensity 0.4, normal `+ V·0.4`, gust sheen `×( 1.3, 1.28, 1.1 ) + ( 0.03, 0.03, 0.015 )` by `gust·0.6`,
     dry blades `mt.dry·0.3 + 0.07`. Blade base colour from `terrainMeadowTone` (terrain will expose it in
     `COMMON_GLSL`; palette in §8) so the grass fades into the ground.
  2. Leaf/palm/grass specular: specularIntensity 0.15 (canopy), 0.4 (palm fronds, grass), 0.3 (bark), 0.42
     (broadleaf) through `MeshPhysicalMaterial.specularIntensity`.
  3. AO into `ambientOcclusion` (canopy `mix( 0.35, 1, ao )`, bark `smoothstep( 0, 0.75, hf )·0.45 + 0.4`), albedo
     `× mix( 0.55, 1, ao )`, outer leaves `×( 1.16, 1.22, 0.92 )` by `smoothstep( 0.62, 1, ao )·0.7`.
  4. Translucency: TW `vegTranslucency` (tint `albedo·( 1.25, 1.45, 0.55 ) + ( 0.012, 0.018, 0 )`, `pow( -V·L, 3 )·0.7
     + 0.3`, strengths 0.5 canopy × `( ao·0.6 + 0.4 )`, 0.3 palms, 0.2 broadleaf, 0.35 impostors, × `( 1 - night )`).
  5. Canopy normal `normalize( geoN + V·0.7 )` (ours 0.45) and the edge-on card thinning.
  6. Gust field: TW samples the detail texture's fbm (A channel) at 140 m and 61 m with a CPU-integrated offset
     (`0.7·wind + 1.5` m/s). Once terrain ships `DetailTextures`, use the same texture so grass, trees and the
     terrain wind sheen move together.
  7. Impostors: TW 6×6 frames of 128 px, 3-frame blend < 100 m, thinning 50 % over 140–320 m, shrubs dropped > 180 m.
- **City** (`src/city/*`): (1) night lamps and windows: mirror `TW:src/materials/LocalLights.js` (nearest 8, packed
  uniforms, `( 1 - ( d/r )⁴ )²` window on inverse square, spot profile `max( m², smoothstep( cosO - 0.55, cosO, cd )·0.05 )`,
  lantern colour (1.0, 0.72, 0.42), on from dusk). (2) Building materials should go through `patchMaterial` so they
  get the new haze, AO, specular occlusion and bounce. (3) Recheck albedos once exposure changes. TW's village
  (`TW:src/world/village/VillageMaterials.js`) keeps painted and galvanised surfaces at ≈0.3–0.6 *linear* (galvanised
  (0.34, 0.35, 0.35), chalk paint `tint·0.64 + 0.27`) and dark wood, algae and rust at 0.03–0.12.
- **Items / world clutter** (`src/game/items/*` or whoever owns props): TW's beach clutter is a large part of "detail":
  `TW:src/world/debris/PebbleField.js` (PCELL 4 m, R_FAR 25, 150 small + 44 chips + 18 cobbles per cell, fades
  8–15 / 15–24 m, no shadows) and `Debris.js` wrack (driftwood, coconuts, shells, coral, fronds). CC0 Poly Haven
  scans are in `TW:public/models/debris`.
- **UI**: an exposure/EV slider should drive `settings.exposure` (TW default 0.55), not a grade gain.
- **Weapons / view model**: render the view model after the TAA resolve (or write a mask) once TAA lands; its
  materials should skip the haze.

## C. Suggested order for this workflow

1. Bugs 1–4 (an hour).
2. §1 + §3 + §4: one SUN_ILLUMINANCE, Hillaire LUTs, exposure 0.55 + auto exposure, env without the painted ground.
   Biggest single jump.
3. §2 grade in scene space + untresholded bloom + dither. §7 GTAO.
4. §5 haze (two layers, density 1.6) + shafts + god rays.
5. §6 cascades + PCSS; terrain hill shadow.
6. §8/§9 terrain (DetailTextures, sand, meadow palette, baked AO). Water phase 1 in parallel.
7. §13 clouds, TAA + RCAS, water FFT, lens flare, motion blur.

Default screenshot time: TW's hero shots are at 16:00–17:30 with the sun 15–30° high. Compare at `hour=16.2`.

How this was verified: source reading of both repos, plus a numeric JS port of both atmospheres (scratch
`skyratio.mjs`, §0) and albedo means measured from our JPGs (§8/§9). A headless capture of Waikiki at 16:10
(`test/preview/session.mjs`) timed out on every screenshot (150 s) at load average 25–29, so no new Deadtide
screenshots are attached. Reference images: `TW:docs/screenshot.jpg`, `TW:docs/screenshot-beach.jpg`.
