"""Render a shaded-relief base image for Mormon's map.

This is a cartographic illustration, not real elevation data. Bible Wayfinder
shades real elevation data. This map has no real land, so the script grows a
height field instead: the terrain shapes in scripts/geography.mjs (via
dist/data/content.json) set where the ground rises, and a small river-erosion
model cuts valleys and ridges into it. The result is shaded like the Bible
Wayfinder relief. Needs NumPy, SciPy, and Pillow.
Run: python scripts/render-relief.py
"""
from pathlib import Path
import heapq
import json
import math
import os
import shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import spsolve_triangular

root = Path(__file__).resolve().parent.parent
geo = json.loads((root / 'dist/data/content.json').read_text(encoding='utf-8'))['geography']

PX = 8                                   # pixels per mile at the closest zoom (a power of 2)
BASE = 4                                 # pixels per mile of the one-file image for the book cards
TILE = 512                               # map tile size in pixels
SEA = (10, 47, 79)                       # the app's sea fill, #0a2f4f
SIM = int(os.environ.get('RELIEF_SIM', 1))  # erosion cells per mile. One cell per mile gives broad, clean ridges.
FINE = int(os.environ.get('RELIEF_FINE', 2))               # cells per mile for the second, short erosion pass
FINE_STEPS = int(os.environ.get('RELIEF_FINE_STEPS', 40))
FINE_CREEP = float(os.environ.get('RELIEF_FINE_CREEP', .1))
X0, X1, Y0, Y1 = -420, 260, -330, 420    # map extent in miles (matches the app's bounds)
W, H = (X1 - X0) * PX, (Y1 - Y0) * PX
rng = np.random.default_rng(1830)

def mask(points, scale, closed=True, width=1):
    # Antialiased polygon or line mask at `scale` pixels per mile.
    ss = 3
    size = ((X1 - X0) * scale * ss, (Y1 - Y0) * scale * ss)
    img = Image.new('L', size, 0)
    pts = [((x - X0) * scale * ss, (Y1 - y) * scale * ss) for x, y in points]
    if closed: ImageDraw.Draw(img).polygon(pts, fill=255)
    else: ImageDraw.Draw(img).line(pts, fill=255, width=max(1, round(width * scale * ss)), joint='curve')
    img = img.resize((size[0] // ss, size[1] // ss), Image.LANCZOS)
    return np.asarray(img, dtype=np.float32) / 255

def noise(shape, miles, scale, stretch=1.0, angle=0.0):
    # Smooth noise in 0..1 with features about `miles` wide. `stretch` makes the
    # features that many times longer along `angle` (degrees east of north).
    step = max(1, int(miles * scale / 3))                  # make broad noise small, then enlarge it
    small = (-(-shape[0] // step) + 2, -(-shape[1] // step) + 2)
    n = rng.standard_normal(small).astype(np.float32)
    sigma = miles * scale / step
    if stretch != 1:
        n = ndi.gaussian_filter(n, (sigma * stretch, sigma), mode='wrap')
        n = ndi.rotate(n, -angle, reshape=False, order=1, mode='wrap')
    else:
        n = ndi.gaussian_filter(n, sigma, mode='wrap')
    if step > 1: n = ndi.zoom(n, step, order=3, mode='nearest')
    n = n[:shape[0], :shape[1]]
    lo, hi = np.percentile(n, [1, 99])
    return np.clip((n - lo) / (hi - lo), 0, 1)

def ridged(n):
    # Turn smooth noise into sharp crests.
    return (1 - np.abs(n * 2 - 1)) ** 1.5

def smoothstep(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)

# ----- Where the ground rises (erosion grid) -----
h, w = (Y1 - Y0) * SIM, (X1 - X0) * SIM
land = mask(geo['land'], SIM) > .5
inland = ndi.distance_transform_edt(land) / SIM            # miles from the coast
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
def warp(a, miles):
    # Bend a shape with smooth noise so no zone keeps a straight edge.
    ox = (noise((h, w), 30, SIM) - .5) * 2 * miles * SIM
    oy = (noise((h, w), 30, SIM) - .5) * 2 * miles * SIM
    ox += (noise((h, w), 7, SIM) - .5) * .5 * miles * SIM
    oy += (noise((h, w), 7, SIM) - .5) * .5 * miles * SIM
    return ndi.map_coordinates(a, [yy + oy, xx + ox], order=1, mode='nearest')

def strike(points):
    # Long axis of a zone, in degrees east of north. Its ridges run this way.
    p = np.array(points, np.float32)
    vals, vecs = np.linalg.eigh(np.cov((p - p.mean(0)).T))
    x, y = vecs[:, np.argmax(vals)]
    return float(np.degrees(np.arctan2(x, y)))

# Each zone is a fold belt: long ridges along its axis, with spurs and basins.
uplift = np.zeros((h, w), np.float32)
for t in geo['terrain']:
    high = t['level'] == 'mountain'
    zone = warp(ndi.gaussian_filter(mask(t['points'], SIM), (3 if high else 4.5) * SIM), 30)
    zone = np.clip(zone * (.55 + .9 * noise((h, w), 8, SIM)), 0, 1)   # ragged range fronts
    angle = strike(t['points'])
    belt = .7 * ridged(warp(noise((h, w), 14, SIM, 5, angle), 10))
    belt += .3 * ridged(warp(noise((h, w), 6, SIM, 4, angle), 5))
    uplift = np.maximum(uplift, zone * ((.3 + 1.2 * belt) if high else (.16 + .6 * belt)))
sidon = ndi.gaussian_filter(mask(geo['sidon'], SIM, closed=False, width=5), 7 * SIM)
sidon = np.clip(sidon / sidon.max(), 0, 1)
lakes = np.zeros((h, w), np.float32)
for water in geo['waters']: lakes = np.maximum(lakes, mask(water['points'], SIM))

# Plains keep low swells, scarps, and a few outlier hills, as real plains do.
broad = noise((h, w), 30, SIM)
plains = .025 + .02 * broad + .07 * ridged(noise((h, w), 13, SIM)) ** 2 + .03 * noise((h, w), 5, SIM)   # low swells and scarps
foot = ndi.gaussian_filter(uplift, 12 * SIM)                # foothills continue past each range
plains += .2 * smoothstep(.8, .98, ridged(noise((h, w), 7, SIM, 3, 20))) * np.clip(foot * 9 + .25 * smoothstep(.6, .9, noise((h, w), 35, SIM)), 0, 1)
uplift = np.maximum(uplift, plains) + .5 * np.minimum(uplift, plains)
uplift *= 1 - .7 * sidon                                  # the Sidon valley stays low
# Rock resists erosion unevenly. Cell-size variation stops straight, parallel gullies.
hardness = (.55 + .9 * noise((h, w), 3, SIM)) * (.7 + .6 * noise((h, w), 10, SIM)) * (.85 + .3 * rng.random((h, w)).astype(np.float32))

# ----- River erosion (stream power law) -----
# Each cell drains to its steepest lower neighbor. Rivers cut faster where they
# collect more water, so branching valleys and sharp ridges form by themselves.
offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
dists = np.array([np.hypot(a, b) for a, b in offsets], np.float32)
STEPS, DT, K = 300, 1.0, .15

def erode(z, uplift, hardness, land, steps, creep=.05):
    h, w = z.shape
    index = np.arange(h * w).reshape(h, w)
    cells = np.arange(h * w)
    ones = np.ones(h * w, np.float32)

    def drainage(z):
        pad = np.pad(z, 1, mode='edge')
        best = np.zeros((h, w), np.float32)
        reach = np.ones((h, w), np.float32)
        rcv = index.copy()
        for (dy, dx), d in zip(offsets, dists):
            s = (z - pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]) / d
            s *= .7 + .6 * rng.random((h, w), dtype=np.float32)    # a random lean stops gullies that follow the grid
            better = s > best
            best = np.where(better, s, best)
            reach = np.where(better, d, reach)
            iy = np.clip(np.arange(h)[:, None] + dy, 0, h - 1)
            ix = np.clip(np.arange(w)[None, :] + dx, 0, w - 1)
            rcv = np.where(better, index[iy, ix], rcv)
        # Water collected by each cell: solve (I - P) a = 1 in downhill order.
        order = np.argsort(-z, axis=None, kind='stable')
        rank = np.empty(h * w, np.int64)
        rank[order] = np.arange(h * w)
        rcv = rcv.ravel()
        src = np.flatnonzero(rcv != index.ravel())
        rows = np.concatenate([rank[rcv[src]], cells])
        cols = np.concatenate([rank[src], cells])
        vals = np.concatenate([-np.ones(src.size, np.float32), ones])
        system = csr_matrix((vals, (rows, cols)), shape=(h * w, h * w))
        area = spsolve_triangular(system, ones, lower=True)[rank]
        return rcv, src, rank, area, reach.ravel()

    for step in range(steps):
        rcv, src, rank, area, reach = drainage(z)
        # Implicit step, solved from the sea upward. It stays stable in large rivers:
        # (1 + f) z - f z_outlet = z_old + uplift, with f = K sqrt(area) / distance.
        f = K * DT / hardness.ravel() * np.sqrt(area) / reach
        f[rcv == cells] = 0
        f *= land.ravel()
        up = h * w - 1 - rank                              # position in uphill order
        rows = np.concatenate([up[src], up])
        cols = np.concatenate([up[rcv[src]], up])
        vals = np.concatenate([-f[src], 1 + f])
        system = csr_matrix((vals, (rows, cols)), shape=(h * w, h * w))
        rhs = np.empty(h * w, np.float32)
        rhs[up] = ((z + uplift * DT) * land).ravel()
        z = spsolve_triangular(system, rhs, lower=True)[up].reshape(h, w).astype(np.float32)
        pit = (rcv.reshape(h, w) == index) & land
        z = np.where(pit, ndi.uniform_filter(z, 3) + .01, z)   # fill hollows so water finds a way out
        z += creep * ndi.laplace(z, mode='nearest')            # soil creep rounds the slopes
        z *= land
    return z

def cached(path, make):
    # Optional: reuse a slow erosion result.
    if path and Path(path).exists(): return np.load(path)
    result = make()
    if path: np.save(path, result)
    return result

cache = os.environ.get('RELIEF_CACHE')
z = (uplift * (20 + 40 * noise((h, w), 6, SIM) + 20 * noise((h, w), 1.5, SIM)) + rng.random((h, w)).astype(np.float32)) * land
z = cached(cache, lambda: erode(z, uplift, hardness, land, STEPS))

# ----- Second erosion pass on a finer grid -----
# The first pass sets the broad ranges. This pass cuts small valleys and spurs into
# them, so the relief stays sharp at close zoom.
rng = np.random.default_rng(1832)
if FINE > SIM:
    grow = FINE / SIM
    SIM = FINE
    h, w = (Y1 - Y0) * SIM, (X1 - X0) * SIM
    land = mask(geo['land'], SIM) > .5
    inland = ndi.distance_transform_edt(land) / SIM
    lakes = np.zeros((h, w), np.float32)
    for water in geo['waters']: lakes = np.maximum(lakes, mask(water['points'], SIM))
    uplift = ndi.zoom(uplift, grow, order=1, mode='nearest')[:h, :w]
    hardness = ndi.zoom(hardness, grow, order=1, mode='nearest')[:h, :w] * (.8 + .4 * rng.random((h, w)).astype(np.float32))
    z = np.maximum(ndi.zoom(z, grow, order=3, mode='nearest')[:h, :w], 0)
    z = (z + .5 * rng.random((h, w)).astype(np.float32)) * land
    z = cached(cache and str(Path(cache).with_suffix('.fine.npy')), lambda: erode(z, uplift, hardness, land, FINE_STEPS, FINE_CREEP))

# ----- Rivers -----
# The valleys above already show where water runs. This traces the largest streams,
# so the app can draw them. The text names only the Sidon, so these have no names.
RIVER_AREA, RIVER_MILES = 600 * SIM * SIM, 25              # smallest basin (square miles) and shortest course drawn
def trace_rivers(z):
    flat = lambda a: a.ravel()
    index = np.arange(h * w).reshape(h, w)
    course = np.array(geo['sidon'], np.float64)
    bed = (mask(geo['sidon'], SIM, closed=False, width=2) > .3) & land
    by, bx = np.nonzero(bed)
    near = ((X0 + (bx[:, None] + .5) / SIM - course[None, :, 0]) ** 2 + (Y1 - (by[:, None] + .5) / SIM - course[None, :, 1]) ** 2).argmin(1)
    z = z.astype(np.float64)
    z[by, bx] = -100 - near * 100 / len(course)            # the drawn Sidon falls steadily to its mouth, so streams join it
    z[~land] = -1000
    # Fill hollows from the sea inward, with a slight slope, so every cell drains out.
    done = flat(~land).copy()
    heap = [(-1000.0, int(c)) for c in np.flatnonzero(flat(ndi.binary_dilation(land) & ~land))]
    zr = z.ravel()
    while heap:
        e, c = heapq.heappop(heap)
        cy, cx = divmod(c, w)
        for (dy, dx), d in zip(offsets, dists):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not done[ny * w + nx]:
                n = ny * w + nx
                done[n] = True
                zr[n] = max(zr[n], e + 1e-3 * d)
                heapq.heappush(heap, (zr[n], n))
    pad = np.pad(z, 1, mode='edge')
    best = np.zeros((h, w))
    rcv = index.copy()
    for (dy, dx), d in zip(offsets, dists):
        s = (z - pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]) / d
        better = s > best
        best = np.where(better, s, best)
        rcv = np.where(better, index[np.clip(np.arange(h)[:, None] + dy, 0, h - 1), np.clip(np.arange(w)[None, :] + dx, 0, w - 1)], rcv)
    rcv = rcv.ravel()
    area = flat(land).astype(np.float64)
    cells = np.flatnonzero(area)
    for c in cells[np.argsort(-zr[cells], kind='stable')]:
        if rcv[c] != c: area[rcv[c]] += area[c]
    # A stream stops at the sea, at a lake, or at the Sidon. Below a lake it starts again.
    stop = flat(~land | (lakes > .5) | bed)
    channel = (area >= RIVER_AREA) & ~stop
    fed = np.zeros(h * w, bool)
    fed[rcv[channel]] = True
    paths = []
    for c in np.flatnonzero(channel & ~fed):
        path = [c]
        while not stop[path[-1]]: path.append(rcv[path[-1]])
        paths.append(path)
    seen = np.zeros(h * w, bool)
    rivers = []
    for path in sorted(paths, key=len, reverse=True):      # long streams first. Shorter ones end where they join.
        cut = next((i for i, c in enumerate(path) if seen[c]), None)
        if cut is not None: path = path[:cut + 1]
        seen[path] = True
        if len(path) < RIVER_MILES * SIM: continue
        end = path[-1]
        pts = [[X0 + (c % w + .5) / SIM, Y1 - (c // w + .5) / SIM] for c in path]
        if bed.ravel()[end]: pts[-1] = course[((course - pts[-1]) ** 2).sum(1).argmin()].tolist()
        keep = pts[:-1:3 * SIM] + [pts[-1]]                # one point every 3 miles, then round the corners
        for _ in range(2):
            a, b = np.array(keep[:-1]), np.array(keep[1:])
            keep = [keep[0]] + np.stack([.75 * a + .25 * b, .25 * a + .75 * b], 1).reshape(-1, 2).tolist() + [keep[-1]]
        rivers.append({'size': 2 if area[path[-2]] >= 4 * RIVER_AREA else 1, 'points': [[round(x, 1), round(y, 1)] for x, y in keep]})
    return rivers
rivers = trace_rivers(z)

rng = np.random.default_rng(1831)                          # later noise does not depend on the cache

# ----- Height in meters (illustrative) -----
z = z / np.percentile(z[land], 99.7) * 1700
# Inland plains sit higher than the coast, so their tint shifts from green to tan.
# Plains rise from the coast toward the ranges, so their tint shifts from green to tan.
near = ndi.gaussian_filter(uplift, 22 * SIM)
near = np.clip(near / np.percentile(near[land], 97), 0, 1)
z += land * (10 + 420 * np.clip(.6 * smoothstep(.35, .8, noise((h, w), 70, SIM)) + .65 * near, 0, 1) * smoothstep(0, 4, inland))
basin = np.clip(ndi.gaussian_filter(lakes, 4 * SIM) * 2.5, 0, 1)   # each lake sits in a hollow
z = z * (1 - basin) + ndi.minimum_filter(z, 24 * SIM + 1) * basin
z = ndi.zoom(z, PX / SIM, order=3, mode='nearest')[:H, :W]
land_hi = mask(geo['land'], PX)
z = np.maximum(z, 0)
# Fine ridges below the erosion grid's cell size. Steep ground gets more of them.
gy, gx = np.gradient(ndi.gaussian_filter(z, PX))
steep = np.hypot(gx, gy)
fine = .5 * ridged(noise((H, W), 1.4 / SIM, PX)) + .3 * ridged(noise((H, W), .7 / SIM, PX)) + .2 * ridged(noise((H, W), .35 / SIM, PX))
z += (fine - .45) * .7 * steep
# The ground rises smoothly from the shore. This removes cell-size steps at the coast.
shore = ndi.distance_transform_edt(land_hi > .5) / PX
z = ndi.gaussian_filter(z, 1.2)
lit = z                                                    # shade the ground without the shore ramp, so the coast has no dark rim
z = z * smoothstep(0, 7, shore) * smoothstep(.3, .7, land_hi) + 2

# Sea floor: a narrow shelf of uneven width, a sharp break, then basins and rises
# that do not follow the coast.
offshore = ndi.distance_transform_edt(land_hi < .5) / PX   # miles from the coast
offshore = np.where(offshore > 0, np.maximum(ndi.gaussian_filter(offshore, 6 * PX), offshore * .7), 0)   # no creases
shelf = 1.5 + 55 * smoothstep(.3, .8, noise((H, W), 60, PX)) ** 1.5   # deep water at some coasts, wide shelves at others
basins = .65 * noise((H, W), 90, PX) + .25 * noise((H, W), 30, PX) + .1 * ridged(noise((H, W), 14, PX))
depth = 110 * smoothstep(0, shelf, offshore) + smoothstep(shelf * .5, shelf * 1.5 + 25, offshore) * (500 + 2900 * basins)
depth = ndi.gaussian_filter(np.maximum(depth, 5), 1.5 * PX)
# ----- Shading -----
def hillshade(height, exaggeration):
    # Light from the northwest, 45 degrees above the horizon. Flat ground is 1.
    # Rows run south, so ground that rises to the south or east faces the light.
    dy, dx = np.gradient(height * exaggeration, 1609 / PX)
    return (.5 * dx + .5 * dy + .7071) / np.sqrt(dx * dx + dy * dy + 1) / .7071

def ramp(value, stops, colors):
    colors = np.array(colors, np.float32)
    return np.stack([np.interp(value, stops, colors[:, c]).astype(np.float32) for c in range(3)], axis=2)

LAND_LIGHT = float(os.environ.get('RELIEF_LIGHT', 5))
light = .72 * hillshade(lit, LAND_LIGHT * 1.15) + .28 * hillshade(ndi.gaussian_filter(lit, 1.7 * PX), LAND_LIGHT * 1.3)   # crisp crests on broad faces
# Ground flatter than about 3 degrees stays calm, as plains do on the Bible Wayfinder relief.
gy, gx = np.gradient(lit, 1609 / PX)
light = 1 + (light - 1) * (.7 + .3 * smoothstep(.015, .06, np.hypot(gx, gy)))
# Tints sampled from the Bible Wayfinder relief: green at the coast, tan inland, gray peaks.
tintz = ndi.gaussian_filter(z, 2.2 * PX)   # tints follow broad height, with soft edges
landrgb = ramp(tintz, [0, 150, 280, 480, 800, 1200, 1650, 2050],
               [[120, 140, 94], [130, 144, 96], [153, 153, 101], [186, 170, 114],
                [194, 174, 120], [193, 174, 123], [194, 177, 128], [200, 186, 146]])
landrgb = landrgb * .94 + ((noise((H, W), 9, PX) - .5) * 14)[:, :, None]   # faint mottling
shadow = np.clip(1 - light, 0, 1)[:, :, None]
sunlit = np.clip(light - 1, 0, .42)[:, :, None]
shadow = np.clip(shadow * 1.25, 0, .7)
landrgb = landrgb * (1 - shadow) + np.array([112, 90, 52], np.float32) * shadow   # warm brown shadows
landrgb += (np.array([240, 226, 176], np.float32) - landrgb) * sunlit * 1.9            # cream highlights

seargb = ramp(depth, [0, 110, 500, 1500, 2600, 3600],
              [[34, 120, 158], [29, 112, 152], [23, 96, 138], [16, 70, 110], [12, 54, 94], [9, 44, 80]])
sealight = hillshade(-depth, 7)
seargb *= (1 + .3 * np.clip(sealight - 1, -.5, .42))[:, :, None]

a = land_hi[:, :, None]
rgb = landrgb * a + seargb * (1 - a)

# Lakes and the waters of Ripliancum share the overlay's shapes. The app draws the river Sidon and the other rivers.
for water in geo['waters']:
    m = mask(water['points'], PX)[:, :, None]
    rgb = rgb * (1 - m) + np.array([30, 96, 140], np.float32) * m

dest = root / 'dist/assets'
dest.mkdir(parents=True, exist_ok=True)
# One small image for the book cards, and as a fallback for the map.
out = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
out.resize((W * BASE // PX, H * BASE // PX), Image.LANCZOS).save(dest / 'relief.jpg', quality=90, optimize=True, progressive=True)

# Map tiles. Zoom n has 2**n pixels per mile, as the app's Leaflet map does.
# The relief fades into the sea fill at the edges, so the map has no visible edge.
fx = np.clip(np.minimum(np.arange(W), W - 1 - np.arange(W)) / (.07 * W), 0, 1).astype(np.float32)
fy = np.clip(np.minimum(np.arange(H), H - 1 - np.arange(H)) / (.07 * H), 0, 1).astype(np.float32)
fade = (fy[:, None] * fx[None, :])[:, :, None]
rgb = rgb * fade + np.array(SEA, np.float32) * (1 - fade)
out = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
tiles = dest / 'relief'
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
(root / 'dist/data/relief.json').write_text(json.dumps({
    'image': 'assets/relief.jpg', 'bounds': [[Y0, X0], [Y1, X1]], 'pxPerMile': BASE,
    'tiles': {'url': 'assets/relief/{z}/{x}_{y}.jpg', 'size': TILE, 'minZoom': 0, 'maxZoom': top},
    'note': 'Illustrative shaded relief drawn from the map’s terrain shapes. Not real elevation data.',
    'rivers': rivers
}, separators=(',', ':')))
content = json.loads((root / 'dist/data/content.json').read_text(encoding='utf-8'))
wet = [p['id'] for p in content['places'] if p.get('stage') != 'old' and land_hi[int((Y1 - p['at'][1]) * PX), int((p['at'][0] - X0) * PX)] < .5]
if wet: raise SystemExit('Places fall in water on the relief: ' + ', '.join(wet))
print(f'Rendered {W}x{H} relief ({count} tiles) and {len(rivers)} rivers for x {X0}..{X1}, y {Y0}..{Y1} miles.')
