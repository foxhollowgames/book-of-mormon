// Builds dist/data/content.json from scripts/geography.mjs and the scripture file.
// Run after prepare-scripture.mjs: node scripts/build-content.mjs
import { smoothCourse } from './organic-shapes.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import * as geo from './geography.mjs';

const scripture = JSON.parse(await readFile(new URL('../dist/data/scripture.json', import.meta.url)));
const chapterIds = scripture.books.flatMap(b => b.chapters);
const chapterCopy = new Map((await readFile(new URL('./chapter-copy.tsv', import.meta.url), 'utf8'))
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const [chapter, title, summary] = line.split('|');
    if (!title || !summary) throw new Error(`Incomplete chapter copy: ${chapter}`);
    return [chapter, { title, summary, sourceIds: ['bom-text'] }];
  }));
if (chapterCopy.size !== chapterIds.length || chapterIds.some(id => !chapterCopy.has(id))) {
  throw new Error('Every chapter needs one original summary.');
}
const contextNotes = {
  'alma-22': { verse: 27, title: 'Why Mormon pauses to describe the land',
    text: 'The king sends his message throughout his lands (verse 27). Mormon then explains their borders. The wilderness separates Nephi from Zarahemla. Bountiful guards the route north (verses 33–34). This geography explains the Nephites’ place of refuge.' },
  'alma-50': { verse: 34, title: 'Why the narrow pass matters',
    text: 'Morianton plans to take his followers north (verse 29). Moroni fears that Bountiful will join them (verse 32). Teancum reaches the pass before they can leave. The pass limits their escape, so both armies meet there.' },
  'alma-51': { verse: 26, title: 'Division opens the eastern front',
    text: 'The king-men refuse to help defend the country (verse 13). Moroni must oppose them while Amalickiah advances. Cities along the east seashore fall before Teancum stops the army. The chapter joins internal division with danger at the borders.' },
  'alma-52': { verse: 27, title: 'Leaving the city removes its protection',
    text: 'The Lamanites refuse to fight outside Mulek (verse 20). Teancum draws them toward Bountiful with a smaller force. Moroni takes the city while they pursue him. Their chase leaves them trapped between Nephite armies (verses 31–32).' },
  'helaman-4': { verse: 7, title: 'A smaller country to defend',
    text: 'The Nephites lose Zarahemla and retreat to Bountiful (verses 5–6). They fortify a line to defend their north country. Mormon connects their losses to injustice and pride (verses 11–12). Their later strength depends on repentance as well as defenses.' },
  '3-nephi-3': { verse: 23, title: 'Gathering changes the defense',
    text: 'Lachoneus refuses the robbers’ demand and gathers his people. They bring food and flocks into one defended area (verses 13–14). Gidgiddoni rejects an attack in the wilderness (verse 21). The people prepare to wait for the robbers instead.' },
  'mormon-2': { verse: 29, title: 'A border after repeated retreats',
    text: 'The army loses cities before reaching Jashon and Shem (verses 16–21). Mormon strengthens the people enough to recover land. A treaty then divides the country at the narrow passage. The agreed border ends this chapter’s fighting but leaves the peoples apart.' },
  'ether-9': { verse: 3, title: 'Omer leaves the struggle for power',
    text: 'The Lord warns Omer to leave his land (verse 3). His journey passes Shim and Cumorah before reaching Ablom. He takes his family away from the plot against him. Akish’s household later destroys itself through rivalry (verses 7–12).' }
};

const sources = [
  { id: geo.SOR, title: 'Mormon’s Map', author: 'John L. Sorenson', year: 2000, type: 'Scholarly book',
    publisher: 'Foundation for Ancient Research and Mormon Studies (FARMS), Brigham Young University',
    url: 'https://archive.bookofmormoncentral.org/sites/default/files/archive-files/pdf/sorenson/2024-04-18/john_l._sorenson_mormons_map_2000.pdf',
    altUrl: 'https://scripturecentral.org/archive/books/book/mormons-map-0',
    summary: 'Sorenson builds a relative map from statements in the Book of Mormon. He reads “up” and “down” as elevation. He turns travel days into rough miles. He later compares the model with real lands.',
    limitations: 'Sorenson calls his map simplified and partial. His figures do not all share one scale. His mile figures are estimates that may be off by about a quarter. Chapter 6 links the shape to Middle America; this app leaves that step out.',
    license: 'Copyrighted book. This app gives page references and short summaries only. Read the full text at the source link.' },
  { id: 'bom-text', title: 'The Book of Mormon (bcbooks/scriptures-json, bom-4)', author: 'Benjamin Crowder, editor of the data file', year: 2016, type: 'Scripture text',
    url: 'https://github.com/bcbooks/scriptures-json',
    summary: 'The reading text comes from a public-domain data file. It follows the 1981 edition with the 2013 corrections. Chapter summaries and footnotes are not included.',
    limitations: 'Small caps appear as capital letters. Italics are not marked.',
    license: 'The data file is in the public domain.' },
  { id: 'leaflet', title: 'Leaflet', author: 'Volodymyr Agafonkin and contributors', year: 2023, type: 'Map software',
    url: 'https://leafletjs.com/', summary: 'Leaflet draws the map. This app uses a flat grid of miles, not a globe.',
    limitations: 'The software does not add facts to the map.', license: 'BSD 2-Clause license. See dist/vendor/leaflet-LICENSE.txt.' }
];

// ---------- Chapter mentions ----------
const bookOf = id => scripture.chapters[id].book;
function eligible(item, chapter) {
  if (item.chapters && !item.chapters.includes(chapter)) return false;
  if (item.books && !item.books.includes(bookOf(chapter))) return false;
  if (item.notBooks && item.notBooks.includes(bookOf(chapter))) return false;
  return true;
}
function mentions(item, chapter) {
  if (!item.match?.length || !eligible(item, chapter)) return [];
  const patterns = item.match.map(source => new RegExp(source));
  return scripture.chapters[chapter].verses.filter(v => patterns.some(p => p.test(v.text))).map(v => v.verse);
}

const refChapter = ref => {
  const m = ref.match(/^(.+?) (\d+):/);
  return m ? `${m[1].toLowerCase().replace(/\s+/g, '-')}-${m[2]}` : null;
};

const chapterMaps = chapterIds.map(chapter => {
  const placeMentions = {}, areaMentions = {};
  for (const place of geo.places) { const v = mentions(place, chapter); if (v.length) placeMentions[place.id] = v; }
  for (const area of geo.areas) { const v = mentions(area, chapter); if (v.length) areaMentions[area.id] = v; }
  const routes = geo.routes.filter(r => r.chapters.includes(chapter)).map(r => r.id);
  const impacts = geo.impacts[chapter] || [];
  // Route endpoints join the chapter focus even when the chapter does not name them.
  const routePlaces = geo.routes.filter(r => routes.includes(r.id)).flatMap(r => r.points.filter(p => typeof p === 'string'));
  const focus = [...new Set([...Object.keys(placeMentions), ...routePlaces, ...impacts.map(i => i.place)])];
  const book = bookOf(chapter);
  const oldWorld = book === '1 Nephi' && Number(scripture.chapters[chapter].chapter) <= 17;
  return { chapter, ...chapterCopy.get(chapter), contextNote: contextNotes[chapter] || null,
    placeMentions, areaMentions, routes, impacts, focusPlaceIds: focus, oldWorld,
    figures: geo.figures.filter(f => f.chapter === chapter).map(f => f.n) };
});

// ---------- Guides ----------
const guides = [
  { id: 'sorenson-maps', title: 'Sorenson’s 17 maps', description: 'Step through each numbered map in Mormon’s Map. Each step opens the chapter he uses.',
    steps: geo.figures.map(f => ({ title: `Map ${f.n}. ${f.title}`, text: f.text, chapter: f.chapter, verse: f.verse,
      placeIds: f.places, routeIds: f.routes, distanceIds: f.distances, page: f.page, sourceIds: [geo.SOR] })) },
  { id: 'mormon-summary', title: 'Mormon’s own summary', description: 'Read Alma 22:27–34 one part at a time. Mormon wrote this short aside about the land.',
    steps: [
      { title: 'The Lamanite king’s land', chapter: 'alma-22', verse: 27, placeIds: ['nephi', 'zarahemla', 'sidon-head', 'manti'], routeIds: [], distanceIds: [],
        text: 'The king ruled from sea to sea. A narrow strip of wilderness divided his land from Zarahemla. It ran by the head of Sidon.' },
      { title: 'Lamanites along both coasts', chapter: 'alma-22', verse: 28, placeIds: ['first-inheritance', 'nephi', 'bountiful', 'jershon'], routeIds: [], distanceIds: [],
        text: 'Lamanites also lived in the west wilderness and by the east seashore. So the Nephites were nearly surrounded.' },
      { title: 'Bountiful and Desolation', chapter: 'alma-22', verse: 30, placeIds: ['bountiful', 'desolation', 'narrow-neck', 'cumorah'], routeIds: ['mulekites-up'], distanceIds: [],
        text: 'Bountiful bordered Desolation. Desolation held the bones of a destroyed people. The people of Zarahemla first landed there.' },
      { title: 'A day and a half across', chapter: 'alma-22', verse: 32, placeIds: ['narrow-neck', 'narrow-pass', 'bountiful', 'desolation'], routeIds: [], distanceIds: ['d-neck-width'],
        text: 'A Nephite could cross this line in a day and a half. Water nearly surrounded Nephi and Zarahemla.' },
      { title: 'Why hold the north', chapter: 'alma-22', verse: 34, placeIds: ['bountiful', 'zarahemla', 'narrow-pass'], routeIds: [], distanceIds: ['d-zarahemla-neck'],
        text: 'The Nephites hemmed the Lamanites in on the south. They kept a country to flee to in the north.' }
    ].map(s => ({ ...s, sourceIds: ['bom-text', geo.SOR] })) }
];

const content = {
  sources, chapterMaps, guides,
  geography: { land: geo.land, terrain: geo.terrain, waters: geo.waters, sidon: smoothCourse(geo.sidonCourse), labels: geo.labels },
  places: geo.places.map(({ chapters, books, notBooks, ...rest }) => rest),
  areas: geo.areas.map(({ chapters, books, notBooks, ...rest }) => rest),
  routes: geo.routes, distances: geo.distances, figures: geo.figures
};
await writeFile(new URL('../dist/data/content.json', import.meta.url), JSON.stringify(content));
const mapped = chapterMaps.filter(c => c.focusPlaceIds.length).length;
console.log(`Wrote ${content.places.length} places, ${content.routes.length} paths, ${content.distances.length} distance notes, ${geo.figures.length} figures. ${mapped} of ${chapterMaps.length} chapters have map places.`);
export { refChapter };
