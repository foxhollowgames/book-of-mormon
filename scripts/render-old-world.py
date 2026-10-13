"""Render the Old World relief for 1 Nephi 1-17 (Jerusalem to the coast of Oman).

Unlike render-relief.py, this uses measured elevation, as Bible Wayfinder does.
Elevation: Mapzen terrarium tiles (run scripts/fetch-old-world-terrain.mjs first).
Coast, lakes, and rivers: Natural Earth files clipped from Bible Wayfinder, in scripts/source/.
The shading matches render-relief.py, so both stages of the map look alike.
Needs NumPy, SciPy, and Pillow. Run: python scripts/render-old-world.py
"""
from pathlib import Path
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

root = Path(__file__).resolve().parent.parent
content = json.loads((root / 'dist/data/content.json').read_text(encoding='utf-8'))
stage = content['stages']['old']
(Y0, X0), (Y1, X1) = stage['bounds']               # miles on the app's flat grid
OX = stage['origin'][0]
LAT0, LNG0, MLAT, MLNG = stage['lat0'], stage['lng0'], stage['milesPerLat'], stage['milesPerLng']

PX = 4                                   # pixels per mile at the closest native zoom (a power of 2)
BASE = 1                                 # pixels per mile of the one-file image for the book card
TILE = 512
SEA = (10, 47, 79)                       # the app's sea fill, #0a2f4f
ZOOM = 8                                 # zoom of the downloaded elevation tiles
W, H = (X1 - X0) * PX, (Y1 - Y0) * PX
rng = np.random.default_rng(600)

# ----- Elevation mosaic (Web Mercator) -----
folder = root / 'scripts/terrain-old-world'
names = [p.stem.split('-') for p in folder.glob('*.png')]
if not names: raise SystemExit('No elevation tiles. Run: node scripts/fetch-old-world-terrain.mjs')
tx0, tx1 = min(int(a) for a, _ in names), max(int(a) for a, _ in names)
ty0, ty1 = min(int(b) for _, b in names), max(int(b) for _, b in names)
rows = []
for ty in range(ty0, ty1 + 1):
    row = []
    for tx in range(tx0, tx1 + 1):
        a = np.asarray(Image.open(folder / f'{tx}-{ty}.png').convert('RGB'), dtype=np.float32)
        row.append(a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768)   # terrarium height in meters
    rows.append(np.concatenate(row, axis=1))
mosaic = np.concatenate(rows, axis=0)
world = 256 * 2 ** ZOOM

# ----- Resample to the app's flat grid of miles -----
lng = LNG0 + (X0 - OX + (np.arange(W) + .5) / PX) / MLNG
lat = LAT0 + (Y1 - (np.arange(H) + .5) / PX) / MLAT
sx = (lng + 180) / 360 * world - tx0 * 256 - .5
sy = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * world - ty0 * 256 - .5
if sx.min() < 0 or sy.min() < 0 or sx.max() > mosaic.shape[1] - 1 or sy.max() > mosaic.shape[0] - 1:
    raise SystemExit('The elevation tiles do not cover the map bounds.')
z = ndi.map_coordinates(mosaic, np.meshgrid(sy, sx, indexing='ij'), order=3, mode='nearest').astype(np.float32)
del mosaic

def to_px(point):
    return ((OX + (point[0] - LNG0) * MLNG - X0) * PX, (Y1 - (point[1] - LAT0) * MLAT) * PX)
def features(name):
    return json.loads((root / f'scripts/source/{name}.geojson').read_text(encoding='utf-8'))['features']
def polygons(geometry):
    return geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
def lines(geometry):
    return geometry['coordinates'] if geometry['type'] == 'MultiLineString' else [geometry['coordinates']]
def raster(shapes):
    # Antialiased mask of polygon rings.
    ss = 2
    img = Image.new('L', (W * ss, H * ss), 0)
    draw = ImageDraw.Draw(img)
    for polygon in shapes:
        for i, ring in enumerate(polygon):
            draw.polygon([(x * ss, y * ss) for x, y in map(to_px, ring)], fill=255 if i == 0 else 0)
    return np.asarray(img.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255

land_hi = raster([p for f in features('old-world-land') for p in polygons(f['geometry'])])
# Only the Dead Sea and the Sea of Galilee. The other lakes in the file are modern reservoirs or far from the trail.
levant = lambda ring: all(34.8 < x < 36.2 and 30.8 < y < 33.2 for x, y in ring)
lakes = raster([p for f in features('old-world-lakes') for p in polygons(f['geometry']) if levant(p[0])])
land = land_hi > .5

# ----- Shading (the same recipe as render-relief.py) -----
def noise(shape, miles):
    step = max(1, int(miles * PX / 3))
    small = (-(-shape[0] // step) + 2, -(-shape[1] // step) + 2)
    n = ndi.gaussian_filter(rng.standard_normal(small).astype(np.float32), miles * PX / step, mode='wrap')
    if step > 1: n = ndi.zoom(n, step, order=3, mode='nearest')
    n = n[:shape[0], :shape[1]]
    lo, hi = np.percentile(n, [1, 99])
    return np.clip((n - lo) / (hi - lo), 0, 1)
def smoothstep(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)
def hillshade(height, exaggeration):
    # Light from the northwest, 45 degrees above the horizon. Flat ground is 1.
    dy, dx = np.gradient(height * exaggeration, 1609 / PX)
    return (.5 * dx + .5 * dy + .7071) / np.sqrt(dx * dx + dy * dy + 1) / .7071
def ramp(value, stops, colors):
    colors = np.array(colors, np.float32)
    return np.stack([np.interp(value, stops, colors[:, c]).astype(np.float32) for c in range(3)], axis=2)

# The light uses the land's true shape, also below sea level in the Dead Sea rift.
lit = ndi.gaussian_filter(np.where(land, z, 0), .6)
LIGHT = 5
light = .72 * hillshade(lit, LIGHT * 1.15) + .28 * hillshade(ndi.gaussian_filter(lit, 1.7 * PX), LIGHT * 1.3)
gy, gx = np.gradient(lit, 1609 / PX)
light = 1 + (light - 1) * (.7 + .3 * smoothstep(.015, .06, np.hypot(gx, gy)))
tintz = ndi.gaussian_filter(np.clip(lit, 0, None), 2.2 * PX)
landrgb = ramp(tintz, [0, 150, 280, 480, 800, 1200, 1650, 2050],
               [[120, 140, 94], [130, 144, 96], [153, 153, 101], [186, 170, 114],
                [194, 174, 120], [193, 174, 123], [194, 177, 128], [200, 186, 146]])
landrgb = landrgb * .94 + ((noise((H, W), 9) - .5) * 14)[:, :, None]
shadow = np.clip(1 - light, 0, 1)[:, :, None]
sunlit = np.clip(light - 1, 0, .42)[:, :, None]
shadow = np.clip(shadow * 1.25, 0, .7)
landrgb = landrgb * (1 - shadow) + np.array([112, 90, 52], np.float32) * shadow
landrgb += (np.array([240, 226, 176], np.float32) - landrgb) * sunlit * 1.9

# Sea floor from measured depth.
depth = ndi.gaussian_filter(np.clip(-z, 5, None), 1.5 * PX)
seargb = ramp(depth, [0, 110, 500, 1500, 2600, 3600],
              [[34, 120, 158], [29, 112, 152], [23, 96, 138], [16, 70, 110], [12, 54, 94], [9, 44, 80]])
seargb *= (1 + .3 * np.clip(hillshade(-depth, 7) - 1, -.5, .42))[:, :, None]

a = land_hi[:, :, None]
rgb = landrgb * a + seargb * (1 - a)
m = lakes[:, :, None]
rgb = rgb * (1 - m) + np.array([30, 96, 140], np.float32) * m

# ----- Rivers for the app to draw (the great rivers only) -----
def to_miles(point):
    return [round(OX + (point[0] - LNG0) * MLNG, 1), round((point[1] - LAT0) * MLAT, 1)]
KEEP = {'Nile': 2, 'Rosetta Branch': 1, 'Damietta Branch': 1, 'Jordan': 1, 'Euphrates': 2, 'Al Furat': 2, 'Tigris': 2, 'Shatt al Arab': 2}
rivers = []
for f in features('old-world-rivers'):
    size = KEEP.get(f['properties'].get('name'))
    if not size: continue
    for line in lines(f['geometry']):
        pts = [to_miles(p) for p in line]
        pts = [p for i, p in enumerate(pts) if i % 2 == 0 or i == len(pts) - 1]
        if len(pts) > 1: rivers.append({'size': size, 'points': pts})

dest = root / 'dist/assets'
out = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
out.resize((W * BASE // PX, H * BASE // PX), Image.LANCZOS).save(dest / 'relief-old.jpg', quality=88, optimize=True, progressive=True)

# Map tiles. Zoom n has 2**n pixels per mile. The relief fades into the sea fill at the edges.
fx = np.clip(np.minimum(np.arange(W), W - 1 - np.arange(W)) / (.05 * W), 0, 1).astype(np.float32)
fy = np.clip(np.minimum(np.arange(H), H - 1 - np.arange(H)) / (.05 * H), 0, 1).astype(np.float32)
fade = (fy[:, None] * fx[None, :])[:, :, None]
rgb = rgb * fade + np.array(SEA, np.float32) * (1 - fade)
out = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
tiles = dest / 'relief-old'
shutil.rmtree(tiles, ignore_errors=True)
top = round(math.log2(PX))
count = 0
for zoom in range(top + 1):
    s = 2 ** zoom
    level = out if s == PX else out.resize(((X1 - X0) * s, (Y1 - Y0) * s), Image.LANCZOS)
    (tiles / str(zoom)).mkdir(parents=True)
    for ty in range(math.floor(-Y1 * s / TILE), math.ceil(-Y0 * s / TILE)):
        for tx in range(math.floor(X0 * s / TILE), math.ceil(X1 * s / TILE)):
            tile = Image.new('RGB', (TILE, TILE), SEA)
            x, y = tx * TILE - X0 * s, ty * TILE + Y1 * s
            tile.paste(level.crop((max(x, 0), max(y, 0), min(x + TILE, level.width), min(y + TILE, level.height))), (max(-x, 0), max(-y, 0)))
            tile.save(tiles / str(zoom) / f'{tx}_{ty}.jpg', quality=88, optimize=True)
            count += 1
(root / 'dist/data/relief-old.json').write_text(json.dumps({
    'image': 'assets/relief-old.jpg', 'bounds': [[Y0, X0], [Y1, X1]], 'pxPerMile': BASE,
    'tiles': {'url': 'assets/relief-old/{z}/{x}_{y}.jpg', 'size': TILE, 'minZoom': 0, 'maxZoom': top},
    'attribution': 'Terrain: Mapzen / USGS / NOAA · Coasts: Natural Earth',
    'note': 'Measured modern elevation, shaded for study. Not a reconstruction of the ancient land.',
    'rivers': rivers
}, separators=(',', ':')))
old = [p for p in content['places'] if p.get('stage') == 'old']
wet = [p['id'] for p in old if land_hi[int((Y1 - p['at'][1]) * PX), int((p['at'][0] - X0) * PX)] < .5]
if wet: raise SystemExit('Old World places fall in water on the relief: ' + ', '.join(wet))
g = np.asarray(out.convert('L'), dtype=np.float32)
gyy, gxx = np.gradient(g)
print(f'Rendered {W}x{H} Old World relief ({count} tiles), {len(rivers)} river lines. '
      f'Land brightness mean {g[land].mean():.0f}, sd {g[land].std():.0f}, gradient {np.hypot(gxx, gyy)[land].mean():.1f}.')
