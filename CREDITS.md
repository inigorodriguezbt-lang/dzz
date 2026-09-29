# Credits

Code: MIT (see `LICENSE`). Third-party data and assets keep their own licences.

## Terrain and bathymetry: `public/data/`

Baked by `tools/bake/` from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) open dataset on AWS
(Mapzen / Linux Foundation), which combines: USGS 3DEP (formerly NED, public domain), SRTM (NASA, public domain),
ETOPO1 (NOAA, public domain) and GMRT (Lamont-Doherty, CC BY 4.0: Ryan, W. B. F. et al., 2009, Global Multi-Resolution
Topography synthesis, Geochem. Geophys. Geosyst., 10, Q03014). Place names and town / highway locations are real;
street grids, buildings and interiors are procedural.

## Look, UI and sound

- The visual style and the UI design follow [Tidewater](https://github.com/dgreenheck/tidewater) by DRG Software
  Solutions LLC (MIT, `LICENSE-Tidewater.txt`).
- Field recordings in `public/audio/` are CC0 from [Freesound](https://freesound.org), collected by Tidewater;
  every file's author and source is listed in `public/audio/CREDITS.md`.
- All other sounds (guns, the infected, impacts, vehicles, rain, thunder…) are synthesised in `src/audio/Synth.js`.

## Textures: `public/textures/`

CC0 PBR textures from [Poly Haven](https://polyhaven.com) (diffuse + OpenGL normal, downsized by
`tools/textures/fetch.py`): coast sand, leafy grass, sparse grass, forest leaves, red laterite soil, dry ground, dark
rock, aerial rocks, snow, farm soil, asphalt, concrete pavement, white stucco, painted plaster, beige wall, blue
plaster, concrete panels, white planks, weathered brown planks, brick wall, corrugated iron, clay roof tiles, grey
roof tiles, bitumen, wood floor, floor tiles, dirty carpet, concrete floor, metal plate, rusty metal, palm tree bark,
brown bark, rough linen.

## Characters

Where human models are used they come from the [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox)
(© Microsoft Corporation, MIT; licence in `public/models/characters/`), animated procedurally in code.

## Libraries and fonts

[three.js](https://threejs.org) (MIT), [Vite](https://vite.dev) (MIT). Fonts Inter and JetBrains Mono (SIL OFL 1.1),
loaded from Google Fonts.
