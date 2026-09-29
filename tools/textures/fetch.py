"""Fetch the CC0 Poly Haven textures the game uses (diffuse + OpenGL normal), downsized to 512 px JPEG.
   python3 tools/textures/fetch.py [out_dir]"""
import json, sys, io, os, urllib.request, concurrent.futures
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/textures'
# game name -> (poly haven asset, size)
TEX = {
    'sand': ('coast_sand_01', 512), 'grass': ('leafy_grass', 512), 'drygrass': ('sparse_grass', 512),
    'forest': ('forest_leaves_02', 512), 'reddirt': ('red_laterite_soil_stones', 512), 'dirt': ('dry_ground_01', 512),
    'rock': ('dark_rock', 512), 'cliff': ('aerial_rocks_02', 512), 'lava': ('dark_rock_02', 512), 'snow': ('snow_02', 512),
    'farm': ('farm_soil', 512), 'asphalt': ('asphalt_02', 512), 'sidewalk': ('concrete_pavement', 512),
    'stucco': ('white_stucco', 512), 'plaster': ('painted_plaster_wall', 512), 'beige': ('beige_wall_001', 512),
    'bluewall': ('blue_plaster_wall', 512), 'panels': ('concrete_panels', 512), 'planks': ('white_planks_clean', 512),
    'oldplanks': ('weathered_brown_planks', 512), 'brick': ('brick_wall_02', 512), 'tinroof': ('corrugated_iron', 512),
    'roof': ('clay_roof_tiles', 512), 'greyroof': ('grey_roof_tiles', 512), 'bitumen': ('bitumen', 512),
    'woodfloor': ('wood_floor', 512), 'tiles': ('floor_tiles_06', 512), 'carpet': ('dirty_carpet', 512),
    'concrete': ('concrete_floor_02', 512), 'metal': ('metal_plate', 512), 'rust': ('rusty_metal_02', 512),
    'palmbark': ('palm_tree_bark', 512), 'bark': ('bark_brown_02', 512), 'fabric': ('rough_linen', 256),
}

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'deadtide-texture-fetch'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def one(item):
    name, (asset, size) = item
    files = json.loads(fetch(f'https://api.polyhaven.com/files/{asset}'))
    for key, suffix in (('Diffuse', 'd'), ('nor_gl', 'n')):
        entry = files.get(key)
        if not entry:
            return f'{name}: no {key}'
        src = entry['1k']['jpg']['url']
        im = Image.open(io.BytesIO(fetch(src))).convert('RGB').resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}_{suffix}.jpg'), quality=86 if suffix == 'd' else 90, optimize=True)
    return f'{name} <- {asset}'

os.makedirs(OUT, exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(8) as ex:
    for r in ex.map(one, TEX.items()):
        print(r)
