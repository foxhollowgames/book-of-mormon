// Book of Mormon directory, built on the Bible Wayfinder directory.
import { initMenu, readPreferences, savePreferences } from './settings-menu.js?v=20261016.2';

// The menu sets how each book opens. The reader uses the same choices.
const menu = document.querySelector('#settingsMenu');
const preferences = { studyMode: 'read', ...readPreferences() };
function showPreferences() {
  for (const button of menu.querySelectorAll('[data-study-mode]')) {
    const active = button.dataset.studyMode === preferences.studyMode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }
}
initMenu(menu);
menu.addEventListener('click', event => {
  const mode = event.target.closest('[data-study-mode]');
  if (mode) { preferences.studyMode = mode.dataset.studyMode; savePreferences(preferences); showPreferences(); }
});
showPreferences();
addEventListener('pageshow', () => { Object.assign(preferences, readPreferences()); showPreferences(); });

// The record's own divisions: Nephi's small plates, Mormon's abridgment, and Moroni's additions.
const groupsOf = [
  ['The small plates', ['1 Nephi', '2 Nephi', 'Jacob', 'Enos', 'Jarom', 'Omni']],
  ['Mormon’s abridgment', ['Words of Mormon', 'Mosiah', 'Alma', 'Helaman', '3 Nephi', '4 Nephi', 'Mormon']],
  ['Moroni’s additions', ['Ether', 'Moroni']]
];
const groups = document.querySelector('#bookGroups'), status = document.querySelector('#directoryStatus');
try {
  const [scripture, content, relief, reliefOld] = await Promise.all(['data/scripture.json', 'data/content.json', 'data/relief.json', 'data/relief-old.json']
    .map(path => fetch(`${path}?v=20261013.4`).then(r => { if (!r.ok) throw new Error(path); return r.json(); })));
  const places = new Map(content.places.map(p => [p.id, p]));
  for (const [title, names] of groupsOf) {
    const section = document.createElement('section'), heading = document.createElement('h2'), grid = document.createElement('div');
    heading.textContent = title; grid.className = 'book-grid'; section.append(heading, grid);
    for (const name of names) {
      const book = scripture.books.find(b => b.book === name);
      if (!book) continue;
      const maps = content.chapterMaps.filter(c => book.chapters.includes(c.chapter));
      const ids = new Set(maps.flatMap(c => c.focusPlaceIds));
      // 1 Nephi happens mostly in the Old World, so its card shows that relief.
      const found = [...ids].map(id => places.get(id)).filter(Boolean);
      const old = found.filter(p => p.stage === 'old').length > found.length / 2;
      const points = found.filter(p => (p.stage === 'old') === old).map(p => p.at);
      const [[y0, x0], [y1, x1]] = (old ? reliefOld : relief).bounds;
      const card = document.createElement('a');
      if (old) card.style.setProperty('--map-image', `url("${reliefOld.image}?v=20261013.4")`);
      card.className = 'book-card ready has-map';
      card.href = `book.html#chapter=${book.chapters[0]}&verse=1`;
      // Each card shows the part of the relief map where its book's places sit.
      const cx = points.length ? points.reduce((n, p) => n + p[0], 0) / points.length : -40;
      const cy = points.length ? points.reduce((n, p) => n + p[1], 0) / points.length : 50;
      card.style.setProperty('--map-x', `${((cx - x0) / (x1 - x0) * 100).toFixed(1)}%`);
      card.style.setProperty('--map-y', `${((y1 - cy) / (y1 - y0) * 100).toFixed(1)}%`);
      card.style.setProperty('--map-size', old ? '260%' : points.length ? '420%' : '190%');
      const label = document.createElement('p');
      label.textContent = `${book.chapters.length} ${book.chapters.length === 1 ? 'chapter' : 'chapters'} · ${ids.size ? `${ids.size} ${ids.size === 1 ? 'place' : 'places'} on the map` : 'No places on the map'}`;
      const h3 = document.createElement('h3'); h3.textContent = name;
      card.append(h3, label);
      grid.append(card);
    }
    groups.append(section);
  }
} catch {
  status.hidden = false;
  status.textContent = 'The book list did not load. Start the local server and reload this page.';
}
