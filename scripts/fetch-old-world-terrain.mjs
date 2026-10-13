// Downloads elevation tiles for the Old World map of 1 Nephi (Jerusalem to the coast of Oman).
// Follows Bible Wayfinder's scripts/fetch-terrain.mjs and uses the same open data.
// Source: https://registry.opendata.aws/terrain-tiles/ (Mapzen terrarium PNG tiles).
// The tiles stay in scripts/terrain-old-world/, which git ignores. Run: node scripts/fetch-old-world-terrain.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';

export const ZOOM = 8;
// A little wider than the map, so the renderer has data at every edge.
export const BOUNDS = { south: 10.5, north: 35.5, west: 28, east: 59.5 };
const n = 2 ** ZOOM;
const tileX = lng => Math.floor((lng + 180) / 360 * n);
const tileY = lat => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
export const RANGE = { x0: tileX(BOUNDS.west), x1: tileX(BOUNDS.east), y0: tileY(BOUNDS.north), y1: tileY(BOUNDS.south) };

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const folder = new URL('./terrain-old-world/', import.meta.url);
  await mkdir(folder, { recursive: true });
  const tiles = [];
  for (let x = RANGE.x0; x <= RANGE.x1; x++) for (let y = RANGE.y0; y <= RANGE.y1; y++) tiles.push({ x, y });
  let index = 0, saved = 0;
  async function worker() {
    while (index < tiles.length) {
      const { x, y } = tiles[index++];
      const file = new URL(`${x}-${y}.png`, folder);
      if (await stat(file).then(s => s.size > 0).catch(() => false)) continue;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;
      const r = await fetch(url);
      if (!r.ok) throw Error(`${r.status}: ${url}`);
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
      saved++;
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Old World terrain: ${tiles.length} tiles at zoom ${ZOOM} (x ${RANGE.x0}–${RANGE.x1}, y ${RANGE.y0}–${RANGE.y1}). Downloaded ${saved}.`);
}
