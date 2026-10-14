// Validates references, IDs, positions, and prose rules. Run: node scripts/check.mjs
import { readFile } from 'node:fs/promises';
import * as newWorld from './geography.mjs';
import * as oldWorld from './old-world.mjs';

const geo = { ...newWorld, places: [...oldWorld.places, ...newWorld.places], routes: [...oldWorld.routes, ...newWorld.routes] };

const scripture = JSON.parse(await readFile(new URL('../dist/data/scripture.json', import.meta.url)));
const content = JSON.parse(await readFile(new URL('../dist/data/content.json', import.meta.url)));
const errors = [], warnings = [];
const placeIds = new Set(geo.places.map(p => p.id));

function verses(ref) {
  // Accepts "Alma 8:3", "Alma 8:3–6", "Alma 15:1, 18" and "A; B" lists.
  return ref.split(/;\s*/).flatMap(part => {
    const m = part.match(/^(.+?) (\d+):(.+)$/);
    if (!m) { errors.push(`Bad reference: ${part}`); return []; }
    const id = `${m[1].toLowerCase().replace(/\s+/g, '-')}-${m[2]}`;
    const chapter = scripture.chapters[id];
    if (!chapter) { errors.push(`Missing chapter: ${part}`); return []; }
    return m[3].split(/,\s*/).flatMap(range => {
      const [a, b = a] = range.split(/[–-]/).map(Number);
      const found = chapter.verses.filter(v => v.verse >= a && v.verse <= b);
      if (found.length !== b - a + 1) errors.push(`Missing verse: ${part}`);
      return found.map(v => ({ id, ...v }));
    });
  });
}

// Each key statement must exist. Warn when its verse does not name the place.
for (const place of geo.places) {
  for (const { ref } of place.refs) {
    const found = verses(ref);
    const words = place.name.replace(/\(.*?\)|^(?:Hill|Land of|Waters of|Wilderness of|Valley of) /g, '').split(/\s+/).filter(w => w.length > 3);
    const patterns = (place.match || []).map(s => new RegExp(s, 'i'));
    const named = found.some(v => patterns.some(p => p.test(v.text)) || words.some(w => v.text.toLowerCase().includes(w.toLowerCase())));
    if (!named) warnings.push(`${place.id}: ${ref} does not repeat the place name`);
  }
}
for (const route of geo.routes) {
  verses(route.refs);
  for (const point of route.points) if (typeof point === 'string' && !placeIds.has(point)) errors.push(`${route.id}: unknown place ${point}`);
  for (const chapter of route.chapters) if (!scripture.chapters[chapter]) errors.push(`${route.id}: unknown chapter ${chapter}`);
}
for (const t of geo.terrain) for (const ref of t.refs) verses(ref);
for (const [chapter, list] of Object.entries(geo.impacts)) for (const item of list) {
  if (!placeIds.has(item.place)) errors.push(`impact ${chapter}: unknown place ${item.place}`);
  if (!verses(item.ref).some(v => v.id === chapter)) errors.push(`impact ${item.ref} is outside ${chapter}`);
}
for (const d of geo.distances) for (const end of [d.from, d.to]) if (typeof end === 'string' && !placeIds.has(end)) errors.push(`${d.id}: unknown place ${end}`);
const distanceIds = new Set(geo.distances.map(d => d.id)), routeIds = new Set(geo.routes.map(r => r.id));
for (const guide of content.guides) for (const step of guide.steps) {
  if (!scripture.chapters[step.chapter]?.verses.some(v => v.verse === step.verse)) errors.push(`${guide.id}: missing ${step.chapter}:${step.verse}`);
  for (const id of step.placeIds) if (!placeIds.has(id)) errors.push(`${guide.id}: unknown place ${id}`);
  for (const id of step.routeIds) if (!routeIds.has(id)) errors.push(`${guide.id}: unknown path ${id}`);
  for (const id of step.distanceIds) if (!distanceIds.has(id)) errors.push(`${guide.id}: unknown distance ${id}`);
}

// Every marker must sit on land, inside the outline.
function inside([x, y], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// Old World places sit on real land. render-old-world.py checks them against the real coast.
for (const place of newWorld.places) if (!inside(place.at, geo.land)) errors.push(`${place.id} is outside the land outline`);
const [[south, west], [north, east]] = oldWorld.stage.bounds;
for (const place of oldWorld.places) if (place.at[0] <= west || place.at[0] >= east || place.at[1] <= south || place.at[1] >= north) errors.push(`${place.id} is outside the Old World map`);
for (const chapter of content.chapterMaps) {
  const stages = new Set(chapter.focusPlaceIds.map(id => geo.places.find(p => p.id === id)?.stage || 'new'));
  if (stages.size > 1) errors.push(`${chapter.chapter} mixes Old World and New World places`);
  if (chapter.oldWorld && !stages.has('old')) errors.push(`${chapter.chapter} has no Old World place to show`);
}
// Preserve the relations corrected from Alma 43:32 and Alma 50:14.
const manti = geo.places.find(p => p.id === 'manti');
const sidonAtManti = geo.sidonCourse.find(([, y]) => y === manti.at[1]);
if (!sidonAtManti || manti.at[0] >= sidonAtManti[0]) errors.push('Manti must stay west of Sidon');
const nephihah = geo.places.find(p => p.id === 'nephihah');
const aaron = geo.places.find(p => p.id === 'aaron'), moroni = geo.places.find(p => p.id === 'moroni-city');
if (nephihah.at.some((v, i) => v <= Math.min(aaron.at[i], moroni.at[i])
  || v >= Math.max(aaron.at[i], moroni.at[i]))) errors.push('Nephihah must stay between Aaron and Moroni');

// Plain-English rule from the Isaiah writing guide: at most 15 words per sentence.
function prose(text, path) {
  if (!text) return;
  if (!/[.!?”)]$/.test(text)) errors.push(`${path}: prose must end with punctuation`);
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.match(/[A-Za-zÀ-ÿ0-9’'-]+/g) || [];
    if (words.length > 15) errors.push(`${path}: sentence has ${words.length} words`);
  }
}
for (const p of geo.places) { prose(p.summary, `${p.id}.summary`); prose(p.sorenson?.text, `${p.id}.sorenson`); prose(p.research?.text, `${p.id}.research`); p.refs.forEach((r, i) => prose(r.note, `${p.id}.refs[${i}]`)); }
for (const r of geo.routes) { prose(r.text, `${r.id}.text`); prose(r.sorenson?.text, `${r.id}.sorenson`); prose(r.research?.text, `${r.id}.research`); }
for (const t of geo.terrain) { prose(t.summary, `${t.id}.summary`); prose(t.sorenson, `${t.id}.sorenson`); }
for (const d of geo.distances) prose(d.text, `${d.id}.text`);
for (const g of content.guides) { prose(g.description, `${g.id}.description`); g.steps.forEach((s, i) => prose(s.text, `${g.id}.steps[${i}]`)); }
for (const s of content.sources) { prose(s.summary, `${s.id}.summary`); prose(s.limitations, `${s.id}.limitations`); }
for (const chapter of content.chapterMaps) {
  if (!chapter.title || !chapter.summary) errors.push(`${chapter.chapter}: missing chapter introduction`);
  prose(chapter.summary, `${chapter.chapter}.summary`);
  if (chapter.contextNote) {
    prose(chapter.contextNote.text, `${chapter.chapter}.contextNote`);
    if (!scripture.chapters[chapter.chapter]?.verses.some(v => v.verse === chapter.contextNote.verse)) {
      errors.push(`${chapter.chapter}: missing context verse`);
    }
  }
}

// People and terms: references, links, sources, and at least one linked verse.
const personIds = new Set(content.people.map(p => p.id)), sourceIds = new Set(content.sources.map(s => s.id));
for (const p of content.people) {
  for (const r of p.refs || []) { verses(r.ref); prose(r.note, `${p.id}.refs`); }
  prose(p.summary, `${p.id}.summary`); prose(p.detail, `${p.id}.detail`);
  if (!p.summary) errors.push(`${p.id}: missing summary`);
  for (const n of p.scholarship || []) { prose(n.text, `${p.id}.scholarship`); if (!sourceIds.has(n.sourceId)) errors.push(`${p.id}: unknown source ${n.sourceId}`); }
  for (const id of p.related || []) if (!personIds.has(id)) errors.push(`${p.id}: unknown related entry ${id}`);
  if (!content.chapterMaps.some(c => c.personMentions?.[p.id])) errors.push(`${p.id}: the name links in no verse`);
}
// Two entries must not claim the same words in one verse.
for (const c of content.chapterMaps) {
  const verseList = scripture.chapters[c.chapter].verses;
  for (const v of verseList) {
    const hits = Object.entries(c.personMentions || {}).filter(([, vs]) => vs.includes(v.verse)).flatMap(([id]) => {
      const p = content.people.find(x => x.id === id);
      for (const pattern of p.match) { const m = new RegExp(pattern).exec(v.text); if (m) return [{ id, start: m.index, end: m.index + m[0].length }]; }
      return [];
    });
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++)
      if (hits[i].start < hits[j].end && hits[j].start < hits[i].end) errors.push(`${c.chapter}:${v.verse}: ${hits[i].id} and ${hits[j].id} claim the same words`);
  }
}

if (warnings.length) console.log(`Review notes (${warnings.length}):\n  ${warnings.join('\n  ')}`);
if (errors.length) { console.error(`Check failed (${errors.length}):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log(`Check passed: ${geo.places.length} places, ${geo.routes.length} paths, ${content.chapterMaps.length} chapters, ${content.people.length} people and terms, every reference found, every marker on land, sentences within 15 words.`);
