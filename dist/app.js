// Book of Mormon Wayfinder. Built on the Isaiah Study Guide app shell.
// The map uses Leaflet's flat CRS. One map unit is one of Sorenson's estimated miles.
// 1 Nephi 1–17 uses a second stage on the same grid: real land from Jerusalem to Arabia, far east of Mormon's map.
import { initModalDragging } from './modal-drag.js?v=20261013.4';
import { initChapterPicker } from './chapter-picker.js?v=20261013.4';
import { initMenu, readPreferences, savePreferences } from './settings-menu.js?v=20261016.1';
import { initBookCrumb } from './breadcrumbs.js?v=20261013.1';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const releaseVersion = '20261014.1';
const storeKey = 'bom-wayfinder-state';
const defaults = { chapter: 'alma-22', verse: 27, studyMode: 'read', layers: { places: true, zones: false, paths: true, distances: false, guesses: true }, map: null };
let saved = readSaved();
// Study mode is shared with the book directory, like Bible Wayfinder's menu.
let state = { ...defaults, ...saved, ...readPreferences(), layers: { ...defaults.layers, ...(saved.layers || {}) } };
let data = { sources: [], chapterMaps: [], guides: [], places: [], areas: [], people: [], routes: [], distances: [], figures: [], geography: {} };
let scripture = { books: [], chapters: {} };
let map, chapterIds = [], toastTimer, guideState = null, guideOverlay = null, mapHome = null, stageId = 'new';

const kindLabels = { city: 'City', land: 'Land', hill: 'Hill', water: 'Water', wilderness: 'Wilderness', pass: 'Pass', feature: 'Feature', place: 'Place', region: 'Area' };
const confidence = {
  text: { label: 'Text gives its relations', note: 'The text links this place to others. Sorenson’s figures set the spot.' },
  inferred: { label: 'Sorenson’s inference', note: 'The text gives hints. Sorenson works out the spot from them.' },
  guess: { label: 'Rough guess', note: 'The text gives almost no position. This spot is only a placeholder.' },
  known: { label: 'Known place', note: 'This place is known today. The map shows its real position.' },
  proposed: { label: 'Proposed site', note: 'The text gives direction and travel time. Researchers propose this site.' }
};
const movementStyles = {
  military: { label: 'Army', color: '#e0503f', dash: '9 5' },
  flight: { label: 'Escape or retreat', color: '#f0a020', dash: '3 6' },
  journey: { label: 'Journey or mission', color: '#4cb3f0', dash: '12 5' },
  migration: { label: 'Group moves to settle', color: '#3fc7a8', dash: '8 5' },
  exploration: { label: 'Search party', color: '#b98cf0', dash: '10 4 2 4' },
  voyage: { label: 'Sea voyage', color: '#9be7ff', dash: '2 7' },
  gathering: { label: 'Gathering', color: '#f3d36b', dash: '6 4' }
};
const styleFor = route => movementStyles[route.kind] || movementStyles.journey;

function readSaved() { try { return JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { return {}; } }
function persist() {
  try {
    const view = map ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() } : state.map;
    localStorage.setItem(storeKey, JSON.stringify({ ...state, map: view }));
  } catch {}
  savePreferences({ studyMode: state.studyMode });
  const p = new URLSearchParams({ chapter: state.chapter, verse: state.verse, study: state.studyMode });
  history.replaceState(null, '', `#${p}`);
}
function parseUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('chapter')) state.chapter = p.get('chapter');
  if (Number(p.get('verse'))) state.verse = Number(p.get('verse'));
  if (['read', 'map'].includes(p.get('study'))) state.studyMode = p.get('study');
  // The directory opens a book with ?book=<id>. Start at its first chapter.
  const bookParam = new URLSearchParams(location.search).get('book');
  if (bookParam && !p.get('chapter')) state.chapter = `${bookParam}-1`;
}
function esc(s = '') { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function showToast(message) { const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 4200); }
const source = id => data.sources.find(s => s.id === id);
const place = id => data.places.find(p => p.id === id);
const person = id => data.people?.find(p => p.id === id);
const chapterInfo = (id = state.chapter) => scripture.chapters[id];
const chapterMap = (id = state.chapter) => data.chapterMaps.find(c => c.chapter === id);
const ll = ([x, y]) => [y, x];
// One style for each place dot. The map markers and the layer panel icons both use it.
const placeDotStyle = (conf, on) => ({ radius: on ? 6.5 : 4, color: on ? '#fff4dc' : '#c9d6cf', weight: on ? 2.5 : 1.25, fillColor: on ? '#0877c4' : '#3b4a3a', fillOpacity: conf === 'guess' ? .35 : 1, dashArray: conf === 'guess' ? '2 3' : null });
function placeDotSvg(conf, on) {
  // Leaflet rounds a circle marker's radius, so the icon does too.
  const s = placeDotStyle(conf, on), r = Math.max(Math.round(s.radius), 1), size = 2 * r + s.weight, c = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><circle cx="${c}" cy="${c}" r="${r}" stroke="${s.color}" stroke-width="${s.weight}" fill="${s.fillColor}" fill-opacity="${s.fillOpacity}"${s.dashArray ? ` stroke-dasharray="${s.dashArray}"` : ''}/></svg>`;
}
const pointOf = p => typeof p === 'string' ? place(p)?.at : p;

function refTarget(ref) {
  const m = ref.match(/^(.+?) (\d+):(\d+)/);
  if (!m) return null;
  return { chapter: `${m[1].toLowerCase().replace(/\s+/g, '-')}-${m[2]}`, verse: Number(m[3]) };
}
function refButton(ref) {
  const t = refTarget(ref);
  return t && scripture.chapters[t.chapter] ? `<button type="button" class="scripture-reference entity-inline-link" data-ref-chapter="${esc(t.chapter)}" data-ref-verse="${t.verse}">${esc(ref)}</button>` : esc(ref);
}
function pagesText(pages) { return pages ? `Mormon’s Map, ${/[–,]/.test(pages) ? 'pp.' : 'p.'} ${pages}` : 'Mormon’s Map'; }
function sorensonCite(pages) {
  const s = source('sorenson-2000');
  return `<a class="source-inline-citation" href="${esc(s.url)}" data-source-id="sorenson-2000" aria-haspopup="dialog">${esc(pagesText(pages))}</a>`;
}

async function load() {
  parseUrl();
  const results = await Promise.allSettled(['data/content.json', 'data/scripture.json', 'data/relief.json', 'data/relief-old.json'].map(p => fetch(`${p}?v=${releaseVersion}`).then(r => { if (!r.ok) throw Error(`${p} (${r.status})`); return r.json(); })));
  if (results[0].status === 'fulfilled') data = { ...data, ...results[0].value };
  if (results[1].status === 'fulfilled') scripture = results[1].value;
  if (results[2].status === 'fulfilled') data.relief = results[2].value;
  if (results[3].status === 'fulfilled') data.reliefOld = results[3].value;
  chapterIds = scripture.books.flatMap(b => b.chapters);
  if (!chapterIds.includes(state.chapter)) state.chapter = defaults.chapter;
  if (!chapterInfo()?.verses.some(v => v.verse === state.verse)) state.verse = 1;
  if (!['read', 'map'].includes(state.studyMode)) state.studyMode = 'read';
  buildStaticUi(); initMap(); renderAll(true);
  if (results.slice(0, 2).some(r => r.status === 'rejected')) showToast('Some study files did not load. Reload the page and try again.');
}

function buildStaticUi() {
  initModalDragging();
  const closeMenu = initMenu($('#settingsMenu'));
  $('#settingsPanel').addEventListener('click', e => { if (e.target.closest('[data-study-mode], #guidesButton, #libraryButton')) closeMenu(true); });
  initScriptureResize();
  $('#timelineRange').addEventListener('input', e => {
    const book = scripture.books.find(b => b.book === chapterInfo().book);
    selectChapter(book.chapters[Number(e.target.value) - 1]);
  });
  $('#scriptureAttribution').textContent = `${scripture.translation || 'The Book of Mormon'} · ${scripture.copyright || 'Public-domain text file'}`;
  // Place layers show the same dots the map draws: large for this chapter, small for other places.
  const placeIcon = conf => `<span class="layer-swatch place-dots">${placeDotSvg(conf, true)}${placeDotSvg(conf, false)}</span>`;
  $('#layerOptions').innerHTML = [['places', 'Places', placeIcon('text')], ['guesses', 'Rough guesses', placeIcon('guess')], ['zones', 'Terrain zones', '<span class="layer-swatch region"></span>'], ['paths', 'Paths', '<span class="layer-swatch route"></span>'], ['distances', 'Sorenson’s distances', '<span class="layer-swatch distance"></span>']]
    .map(([key, label, icon]) => `<label class="layer-option"><input type="checkbox" data-layer="${key}">${icon}<span>${label}</span></label>`).join('');
  // A book in the crumb list opens in this reader.
  $('#bookCrumb').addEventListener('click', e => {
    const link = e.target.closest('.crumb-menu a');
    if (!link) return;
    e.preventDefault();
    selectChapter(new URLSearchParams(link.hash.slice(1)).get('chapter'));
  });
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  $('#libraryDialog .dialog-close').addEventListener('click', () => hideModalPanel($('#libraryDialog')));
  $('#sourceDialog .dialog-close').addEventListener('click', () => hideModalPanel($('#sourceDialog')));
  for (const dialog of $$('dialog')) dialog.addEventListener('cancel', e => { e.preventDefault(); hideModalPanel(dialog); });
  if (matchMedia('(max-width:720px)').matches) { $('#layerOptions').classList.add('hidden'); $('#layerToggle').setAttribute('aria-expanded', 'false'); }
}
function initScriptureResize() {
  const divider = $('#scriptureResize'), panel = $('#scriptureSidebar'), view = $('#mapView');
  const wide = matchMedia('(min-width:1025px)');
  let drag = null, frame = 0;
  const minimum = () => wide.matches ? 280 : 220;
  const maximum = () => wide.matches ? Math.max(280, view.clientWidth - 288) : Math.max(220, view.clientHeight - 180);
  function update(size) {
    if (!view.clientWidth || !view.clientHeight) return;
    const value = Math.round(Math.max(minimum(), Math.min(maximum(), size)));
    panel.style.setProperty(wide.matches ? '--scripture-width' : '--scripture-height', `${value}px`);
    divider.setAttribute('aria-valuenow', String(value));
    return value;
  }
  const sync = () => { divider.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal'); update(wide.matches ? Number(state.scriptureWidth) || (innerWidth <= 1100 ? 365 : 432) : Number(state.scriptureHeight) || Math.round(view.clientHeight * .42)); };
  divider.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const b = panel.getBoundingClientRect(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, w: b.width, h: b.height }; divider.setPointerCapture(e.pointerId); document.body.classList.add('resizing-scripture'); });
  divider.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; if (wide.matches) state.scriptureWidth = update(drag.w + e.clientX - drag.x); else state.scriptureHeight = update(drag.h + drag.y - e.clientY); });
  const finish = () => { if (!drag) return; drag = null; document.body.classList.remove('resizing-scripture'); persist(); };
  divider.addEventListener('pointerup', finish); divider.addEventListener('pointercancel', finish); divider.addEventListener('lostpointercapture', finish);
  divider.addEventListener('keydown', e => {
    const b = panel.getBoundingClientRect();
    const sizes = wide.matches ? { ArrowLeft: b.width - 20, ArrowRight: b.width + 20 } : { ArrowDown: b.height - 20, ArrowUp: b.height + 20 };
    if (!(e.key in sizes)) return; e.preventDefault();
    if (wide.matches) state.scriptureWidth = update(sizes[e.key]); else state.scriptureHeight = update(sizes[e.key]);
    persist();
  });
  new ResizeObserver(sync).observe(view);
  wide.addEventListener('change', sync);
  new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => map?.invalidateSize({ pan: false })); }).observe(panel);
}

function onClick(e) {
  const citation = e.target.closest('[data-source-id]');
  if (citation) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); openSource(citation.dataset.sourceId); return; }
  const ref = e.target.closest('[data-ref-chapter]');
  if (ref) { goToVerse(ref.dataset.refChapter, Number(ref.dataset.refVerse)); return; }
  const mode = e.target.closest('[data-study-mode]');
  if (mode) { selectStudyMode(mode.dataset.studyMode); return; }
  const personLink = e.target.closest('[data-person-id]');
  if (personLink) { const p = person(personLink.dataset.personId); if (p) openFeature(p, 'person', personLink); return; }
  const placeLink = e.target.closest('[data-place-id]');
  if (placeLink) { const p = place(placeLink.dataset.placeId); if (p) { panTo(p.at); openFeature(p, 'place'); } return; }
  const routeLink = e.target.closest('[data-route-id]');
  if (routeLink) { const r = data.routes.find(x => x.id === routeLink.dataset.routeId); if (r) { fitPoints(r.points.map(pointOf)); openFeature(r, 'route'); } return; }
  const figure = e.target.closest('[data-figure]');
  if (figure) { startGuide('sorenson-maps', Number(figure.dataset.figure) - 1); return; }
  const act = e.target.closest('[data-action]');
  if (act) performAction(act.dataset.action, act.dataset.id);
}
function onChange(e) {
  if (e.target.matches('[data-layer]')) { state.layers[e.target.dataset.layer] = e.target.checked; drawOverlays(); persist(); }
}
function performAction(action, id) {
  if (action === 'chapter-prev' || action === 'chapter-next') { const next = chapterStep(action === 'chapter-prev'); if (next) selectChapter(next); }
  if (action === 'focus-chapter') focusChapterMap();
  if (action === 'close-card') closeCard();
  if (action === 'toggle-layers') { const collapsed = $('#layerOptions').classList.toggle('hidden'); $('#layerToggle').setAttribute('aria-expanded', String(!collapsed)); }
  if (action === 'library') openLibrary();
  if (action === 'open-guides') { guideState = null; renderGuides(); }
  if (action === 'guide') startGuide(id, 0);
  if (action === 'guide-list') { guideState = null; clearGuideOverlay(); renderGuides(); }
  if (action === 'close-guides') { hideModalPanel($('#tourDrawer')); clearGuideOverlay(); }
  if (action === 'guide-next' || action === 'guide-prev') moveGuide(action === 'guide-next' ? 1 : -1);
}

function renderAll(first = false) {
  renderView();
  $$('[data-layer]').forEach(i => { i.checked = !!state.layers[i.dataset.layer]; });
  renderScripture();
  drawOverlays();
  if (first) { focusChapterMap(false); setTimeout(() => focusChapterMap(false), 250); }
}
// Previous and Next continue across books: the last chapter of a book leads to chapter 1 of the next book.
function chapterStep(back) { const all = scripture.books.flatMap(b => b.chapters), i = all.indexOf(state.chapter); return all[i + (back ? -1 : 1)]; }
function chapterStepLabel(back) { const next = chapterStep(back), info = next && chapterInfo(next); if (info && info.book !== chapterInfo().book) return `${back ? 'Previous book' : 'Next book'}: ${info.label}`; return back ? 'Previous chapter' : 'Next chapter'; }
function chapterStepButton(back) { const label = esc(chapterStepLabel(back)); return `<button class="sidebar-next" data-action="${back ? 'chapter-prev' : 'chapter-next'}" aria-label="${label}" title="${label}" ${chapterStep(back) ? '' : 'disabled'}>${back ? '‹' : '›'}</button>`; }
function selectChapter(id, verse = 1) {
  if (!scripture.chapters[id]) return;
  const changed = id !== state.chapter;
  state.chapter = id; state.verse = verse;
  renderTimeline();
  renderScripture(); drawOverlays();
  if (changed) { closeCard(); focusChapterMap(); }
  persist();
  if (verse > 1) requestAnimationFrame(() => scrollVerse(verse)); else $('#sidebarContent').scrollTop = 0;
}
function goToVerse(chapter, verse) {
  if (state.studyMode === 'map') selectStudyMode('read');
  if (chapter !== state.chapter) selectChapter(chapter, verse);
  else scrollVerse(verse);
}
function scrollVerse(verse) {
  state.verse = verse;
  $$('#sidebarContent .verse').forEach(el => el.classList.toggle('selected-verse', el.id === `verse-${verse}`));
  $(`#verse-${verse}`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  persist();
}

// ---------- Scripture sidebar ----------
function verseHtml(v, cm) {
  const ids = Object.entries(cm?.placeMentions || {}).filter(([, verses]) => verses.includes(v.verse)).map(([id]) => id);
  const people = Object.entries(cm?.personMentions || {}).filter(([, verses]) => verses.includes(v.verse)).map(([id]) => person(id)).filter(Boolean);
  // Find the first match for each name, then build the markup once.
  // A priority entry, such as "people of Zarahemla", claims its words before a place does.
  const spans = [];
  const addPeople = list => {
    for (const p of list) for (const pattern of p.match || []) {
      const m = new RegExp(pattern).exec(v.text);
      if (!m) continue;
      if (!spans.some(s => m.index < s.end && m.index + m[0].length > s.start)) spans.push({ id: p.id, name: p.name, start: m.index, end: m.index + m[0].length, person: true });
      break;
    }
  };
  addPeople(people.filter(p => p.priority));
  for (const id of ids) {
    const p = place(id);
    for (const pattern of p?.match || []) {
      const m = new RegExp(pattern).exec(v.text);
      if (!m) continue;
      if (!spans.some(s => m.index < s.end && m.index + m[0].length > s.start)) spans.push({ id, name: p.name, start: m.index, end: m.index + m[0].length });
      break;
    }
  }
  // Other people and terms link after places, so a place name keeps its map link.
  addPeople(people.filter(p => !p.priority));
  spans.sort((a, b) => a.start - b.start);
  let html = '', cursor = 0;
  for (const s of spans) {
    const link = s.person ? `data-person-id="${esc(s.id)}" aria-haspopup="dialog" aria-label="About ${esc(s.name)}"` : `data-place-id="${esc(s.id)}" aria-label="Show ${esc(s.name)} on the map"`;
    html += esc(v.text.slice(cursor, s.start)) + `<button type="button" class="entity-inline-link${s.person ? ' person-inline-link' : ''}" ${link}>${esc(v.text.slice(s.start, s.end))}</button>`;
    cursor = s.end;
  }
  html += esc(v.text.slice(cursor));
  return `<article class="verse ${v.verse === state.verse ? 'selected-verse' : ''}" id="verse-${v.verse}"><span class="verse-number">${v.verse}</span><span>${html}</span></article>`;
}
function chapterIntroHtml(cm) {
  if (!cm?.summary) return '';
  const note = cm.contextNote;
  const context = note ? `<section class="chapter-context-note"><h3>${esc(note.title)}</h3>${verseQuote(state.chapter, note.verse)}<p>${esc(note.text)}</p></section>` : '';
  const routes = (cm.routes || []).map(id => data.routes.find(r => r.id === id)).filter(Boolean);
  const paths = routes.length ? `<details class="chapter-movements"><summary>Paths and facts · ${routes.length}</summary>${routes.map(r => `<button class="story-route" data-route-id="${esc(r.id)}"><i style="background:${styleFor(r).color}"></i><span>${esc(r.title)}<small>${esc(styleFor(r).label)} · ${esc(r.refs)}</small></span></button>`).join('')}</details>` : '';
  return `<section class="passage-context chapter-introduction" aria-label="Chapter introduction"><h2>${esc(cm.title)}</h2><div class="passage-prose"><p>${esc(cm.summary)}${chapterCitationHtml()}</p>${context}</div>${paths}</section>`;
}
function chapterCitationHtml() {
  const text = source('bom-text');
  return text ? `<sup class="source-footnote"><a href="${esc(text.url)}" data-source-id="bom-text" aria-haspopup="dialog" aria-label="Source: ${esc(text.title)}">1</a></sup>` : '';
}
function mapContextHtml(cm) {
  const named = Object.keys(cm?.placeMentions || {}).map(place).filter(Boolean);
  const areas = Object.keys(cm?.areaMentions || {}).map(id => data.areas.find(a => a.id === id)).filter(Boolean);
  const empty = !cm?.focusPlaceIds.length ? '<p>This chapter has no mapped places.</p>' : '';
  const scope = cm?.oldWorld ? 'This map shows real land. Jerusalem is a known place. The camps after it are proposed sites.' : 'The map shows relative positions. The text does not give exact locations.';
  const chips = named.length ? `<p class="place-chips">${named.map(p => `<button type="button" class="place-chip conf-${p.conf}" data-place-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</p>` : '';
  return `${empty}<details><summary>Map context</summary><p>${scope}</p>${chips}${areas.length ? `<p>${areas.map(a => esc(a.name)).join(' · ')}</p>` : ''}</details>`;
}
function chapterDateHtml(cm) {
  return cm?.dateLabel ? `<p class="chapter-date" aria-label="Approximate date: ${esc(cm.dateLabel)}">${esc(cm.dateLabel)}</p>` : '';
}
function renderScripture() {
  const info = chapterInfo(), cm = chapterMap();
  const book = scripture.books.find(b => b.book === info.book);
  const nums = book.chapters.map(id => scripture.chapters[id].chapter), n = info.chapter, many = nums.length > 1;
  const heading = `<div class="scripture-heading">${chapterStepButton(true)}<div class="chapter-picker-block"><h1 class="chapter-picker"><button type="button" class="chapter-picker-trigger" aria-label="${many ? `Choose ${esc(info.book)} chapter, current chapter ${n}` : `${esc(info.book)} ${n}, the only chapter`}" aria-haspopup="listbox" aria-expanded="false" aria-controls="chapterPickerMenu" ${many ? '' : 'disabled'}>${esc(info.label)}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></button></h1>${chapterDateHtml(cm)}</div><div id="chapterPickerMenu" class="chapter-picker-menu" popover="auto" role="listbox" aria-label="Choose ${esc(info.book)} chapter">${nums.map(c => `<button type="button" role="option" aria-label="${esc(info.book)} chapter ${c}" aria-selected="${c === n}" tabindex="-1" data-value="${c}"><span>${c}</span><span class="chapter-picker-check" aria-hidden="true">${c === n ? '✓' : ''}</span></button>`).join('')}</div>${chapterStepButton(false)}</div>`;
  $('#sidebarContent').innerHTML = heading + chapterIntroHtml(cm) + info.verses.map(v => verseHtml(v, cm)).join('');
  if (many) initChapterPicker($('#sidebarContent'), n, nums, c => selectChapter(book.chapters[nums.indexOf(c)]));
  // The last crumb names the open book and lists the other books.
  const crumb = $('#bookCrumb');
  if (crumb.dataset.book !== info.book) {
    const books = scripture.books.map(b => ({ name: b.book, url: `#chapter=${b.chapters[0]}&verse=1` }));
    initBookCrumb(crumb, books, books.find(b => b.name === info.book));
    crumb.dataset.book = info.book;
  }
  document.title = `${info.label} · Book of Mormon Wayfinder`;
}
function selectStudyMode(mode) {
  if (!['read', 'map'].includes(mode) || mode === state.studyMode) return;
  const atHome = $('#recenterMap').hidden;
  state.studyMode = mode;
  closeCard(); renderView(); persist();
  // Keep the chapter view when the reader has not moved the map.
  if (atHome) setTimeout(() => { map?.invalidateSize({ pan: false }); focusChapterMap(false); }, 80);
}
// Read shows the scripture beside the map. Map gives the whole screen to the map.
function renderView() {
  const mapMode = state.studyMode === 'map';
  $('#mapView').classList.toggle('map-mode', mapMode);
  $('#scriptureSidebar').hidden = mapMode;
  $('.timeline').hidden = !mapMode;
  renderTimeline();
  $$('[data-study-mode]').forEach(b => { const on = b.dataset.studyMode === state.studyMode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
}
function renderTimeline() {
  const info = chapterInfo(), book = scripture.books.find(b => b.book === info.book);
  const range = $('#timelineRange');
  range.max = book.chapters.length;
  range.value = info.chapter;
  range.setAttribute('aria-valuetext', info.label);
  $('#timelineChapter').textContent = 'Chapter order';
  $('#dateLabel').textContent = info.label;
}

// ---------- Cards ----------
const modalAnimations = new WeakMap(), modalKeys = new WeakMap();
function showModalPanel(panel, key) {
  const isDialog = panel.tagName === 'DIALOG';
  const wasClosed = isDialog ? !panel.open : panel.classList.contains('hidden');
  const changed = key !== undefined && modalKeys.get(panel) !== key;
  modalKeys.set(panel, key);
  if (!wasClosed && !changed) return;
  if (wasClosed) { if (isDialog) panel.showModal(); else panel.classList.remove('hidden'); }
  modalAnimations.get(panel)?.cancel();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  modalAnimations.set(panel, panel.animate([{ opacity: 0, scale: '.94' }, { opacity: 1, scale: '1' }], { duration: 180, easing: 'ease-in-out' }));
}
function hideModalPanel(panel) { modalAnimations.get(panel)?.cancel(); if (panel.tagName === 'DIALOG') panel.close(); else panel.classList.add('hidden'); }
function openStudyModal(id, key) {
  for (const modal of $$('#contextCard, #tourDrawer, dialog')) if (modal.id !== id && !(id === 'contextCard' && modal.id === 'tourDrawer')) hideModalPanel(modal);
  const modal = $('#' + id);
  if (id === 'contextCard') modal.style.translate = '';
  showModalPanel(modal, key);
}
function refsHtml(refs) {
  return refs.map(r => `<p>${esc(r.note)} ${refButton(r.ref)}</p>`).join('');
}
function sourcesHtml(ids = ['bom-text']) {
  return `<div class="word-section"><h3>Sources</h3><ul class="study-source-links">${[...new Set(ids)].map(source).filter(Boolean).map(s => `<li><a href="${esc(s.url)}" data-source-id="${esc(s.id)}" aria-haspopup="dialog">${esc(s.title)}</a></li>`).join('')}</ul></div>`;
}
function verseQuote(chapter, verse) {
  const v = scripture.chapters[chapter]?.verses.find(x => x.verse === verse);
  if (!v) return '';
  return `<figure class="study-quotation scripture-excerpt"><blockquote>${esc(v.text)}</blockquote><figcaption>${refButton(`${scripture.chapters[chapter].label}:${verse}`)} · The Book of Mormon</figcaption></figure>`;
}
function sorensonHtml(s) {
  if (!s) return '';
  return `<div class="word-section"><h3>Sorenson’s reading</h3><p>${esc(s.text)} ${sorensonCite(s.pages)}</p></div>`;
}
// Old World places and paths cite the researcher who proposed them.
function researchHtml(r, title) {
  if (!r) return '';
  const s = source(r.sourceId);
  const cite = s ? ` <a class="source-inline-citation" href="${esc(s.url)}" data-source-id="${esc(s.id)}" aria-haspopup="dialog">${esc(s.author)}, ${s.year}</a>` : '';
  return `<div class="word-section"><h3>${title}</h3><p>${esc(r.text)}${cite}</p></div>`;
}
const cardSources = item => item.stage === 'old' ? ['bom-text', item.research?.sourceId].filter(Boolean) : ['bom-text', 'sorenson-2000'];
function placeCardHtml(p) {
  const cm = chapterMap();
  const verses = cm?.placeMentions?.[p.id] || [];
  const impact = cm?.impacts?.find(i => i.place === p.id);
  const conf = confidence[p.conf];
  const here = verses.length ? `<div class="word-section"><h3>In ${esc(chapterInfo().label)}</h3>${verseQuote(state.chapter, verses[0])}${verses.length > 1 ? `<p class="muted">Also in verses ${verses.slice(1).map(v => refButton(`${chapterInfo().label}:${v}`)).join(', ')}.</p>` : ''}</div>` : '';
  const loss = impact ? `<div class="word-section impact-section"><h3>Destruction</h3><p>${esc(impact.text)} ${refButton(impact.ref)}</p></div>` : '';
  return `<span class="eyebrow">${esc(kindLabels[p.kind] || 'Place')}</span><h2>${esc(p.name)}</h2><span class="badge conf-badge conf-${p.conf}" title="${esc(conf.note)}">${esc(conf.label)}</span><div class="feature-prose"><p>${esc(p.summary)}</p></div>${loss}${here}<div class="feature-prose">${refsHtml(p.refs)}</div>${sorensonHtml(p.sorenson)}${researchHtml(p.research, 'Proposed site')}${sourcesHtml(cardSources(p))}<p class="card-footnote">${esc(conf.note)}</p>`;
}
function routeCardHtml(r) {
  const stops = r.points.filter(x => typeof x === 'string').map(id => `<button type="button" class="place-chip" data-place-id="${esc(id)}">${esc(place(id)?.name)}</button>`).join('');
  const refs = r.refs.split(/;\s*/).map(refButton).join('; ');
  return `<span class="eyebrow" style="color:${styleFor(r).color}">${esc(styleFor(r).label)}</span><h2>${esc(r.title)}</h2><div class="feature-prose"><p>${esc(r.text)}</p><p>${refs}</p></div><div class="word-section"><h3>Named stops</h3><p>${stops || '<span class="muted">The text names no stops.</span>'}</p></div>${sorensonHtml(r.sorenson)}${researchHtml(r.research, 'Proposed route')}${sourcesHtml(cardSources(r))}<p class="card-footnote">Bends between stops are drawn for reading only. The text gives the stops, not the road.</p>`;
}
function distanceCardHtml(d) {
  return `<span class="eyebrow">Sorenson’s distance</span><h2>${esc(d.label)}</h2><div class="feature-prose"><p>${esc(d.text)} ${sorensonCite(d.pages)}</p></div>${sourcesHtml(['sorenson-2000'])}<p class="card-footnote">Sorenson says his miles could be off by about a quarter.</p>`;
}
function terrainCardHtml(t) {
  return `<span class="eyebrow">${t.level === 'mountain' ? 'Mountains or rugged wilderness' : 'Higher land'}</span><h2>${esc(t.name)}</h2><div class="feature-prose"><p>${esc(t.summary)}</p><p>${t.refs.map(refButton).join(' · ')}</p></div><div class="word-section sorenson-section"><h3>Sorenson’s reading</h3><p>${esc(t.sorenson)} ${sorensonCite(t.pages)}</p></div>${sourcesHtml(['bom-text', 'sorenson-2000'])}<p class="card-footnote">The text says “up” and “down.” It never gives heights.</p>`;
}
function impactCardHtml(p) {
  return `<span class="eyebrow">Destruction / distress</span><h2>${esc(p.name)}</h2><div class="feature-prose"><p>${esc(p.impact.text)} ${refButton(p.impact.ref)}</p>${verseQuote(state.chapter, refTarget(p.impact.ref).verse)}</div>${sourcesHtml(['bom-text'])}`;
}
const personKinds = { person: 'Person', group: 'People', object: 'Object', term: 'Term', title: 'Title' };
function personCardHtml(p) {
  const verses = chapterMap()?.personMentions?.[p.id] || [];
  const here = verses.length ? `<div class="word-section"><h3>In ${esc(chapterInfo().label)}</h3>${verseQuote(state.chapter, verses[0])}${verses.length > 1 ? `<p class="muted">Also in verses ${verses.slice(1).map(v => refButton(`${chapterInfo().label}:${v}`)).join(', ')}.</p>` : ''}</div>` : '';
  const related = (p.related || []).map(person).filter(Boolean);
  const links = related.length ? `<div class="word-section"><h3>Related</h3><p class="place-chips">${related.map(r => `<button type="button" class="place-chip" data-person-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</p></div>` : '';
  const scholarship = (p.scholarship || []).map(n => {
    const s = source(n.sourceId);
    const cite = s ? ` <a class="source-inline-citation" href="${esc(s.url)}" data-source-id="${esc(s.id)}" aria-haspopup="dialog">${esc(s.author)}, ${esc(s.year)}</a>` : '';
    return `<p>${esc(n.text)}${cite}</p>`;
  }).join('');
  const ids = ['bom-text', ...(p.scholarship || []).map(n => n.sourceId)];
  return `<span class="eyebrow">${esc(personKinds[p.kind] || 'Person')}</span><h2>${esc(p.name)}</h2>${p.role ? `<span class="badge">${esc(p.role)}</span>` : ''}${p.era ? ` <span class="badge">${esc(p.era)}</span>` : ''}<div class="feature-prose"><p>${esc(p.summary)}</p>${p.detail ? `<p>${esc(p.detail)}</p>` : ''}</div>${here}<div class="feature-prose">${refsHtml(p.refs || [])}</div>${scholarship ? `<div class="word-section"><h3>Scholarship</h3>${scholarship}</div>` : ''}${links}${sourcesHtml(ids)}`;
}
function openFeature(item, type, origin) {
  const card = $('#contextCard');
  card.dataset.feature = `${type}:${item.id}`;
  card.dataset.pinned = 'true';
  card._origin = origin?.getElement?.() || origin || card._origin;
  const body = type === 'person' ? personCardHtml(item) : type === 'impact' ? impactCardHtml(item) : type === 'place' ? placeCardHtml(item) : type === 'route' ? routeCardHtml(item) : type === 'distance' ? distanceCardHtml(item) : terrainCardHtml(item);
  card.innerHTML = `<button class="dialog-close" data-action="close-card" aria-label="Close details">×</button>${body}`;
  openStudyModal('contextCard', card.dataset.feature);
  card.scrollTop = 0;
  const stage = $('.map-stage');
  const point = origin?.getLatLng?.() || origin?.getCenter?.();
  const at = point && map ? map.latLngToContainerPoint(point) : { x: stage.clientWidth / 2, y: 70 };
  card.style.left = `${Math.max(12, Math.min(at.x + 18, stage.clientWidth - card.offsetWidth - 12))}px`;
  card.style.top = `${Math.max(12, Math.min(at.y - 40, stage.clientHeight - card.offsetHeight - 12))}px`;
  syncSelection();
}
function closeCard() { const card = $('#contextCard'); if (card.classList.contains('hidden')) return; hideModalPanel(card); card.dataset.feature = ''; syncSelection(); card._origin?.focus?.({ preventScroll: true }); }

// ---------- Map ----------
const layers = {};
function initMap() {
  if (!window.L) { showToast('The map did not load. Reload the page to try again.'); return; }
  map = L.map('map', { crs: L.CRS.Simple, zoomControl: false, attributionControl: true, minZoom: -1.5, maxZoom: 3, zoomSnap: .25, maxBounds: [[-330, -420], [420, 260]], maxBoundsViscosity: .8 });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Relative map after J. L. Sorenson, <i>Mormon’s Map</i> (2000) · <a href="https://leafletjs.com">Leaflet</a>');
  if (data.reliefOld?.attribution) map.attributionControl.addAttribution(`<span class="old-world-credit">${esc(data.reliefOld.attribution)}</span>`);
  for (const [name, z] of [['sea', 150], ['land', 200], ['terrain', 230], ['water', 260], ['grid', 270], ['labels', 280], ['distances', 395], ['routes', 410], ['places', 420], ['impacts', 430]]) {
    map.createPane(name); map.getPane(name).style.zIndex = z;
    map.getPane(name).classList.add('wayfinder-pane');
  }
  for (const name of ['sea', 'land', 'water', 'grid', 'labels']) map.getPane(name).style.pointerEvents = 'none';
  new (L.Control.extend({ options: { position: 'bottomleft' }, onAdd() { const el = L.DomUtil.create('div', 'mile-scale'); this._el = el; map.on('zoomend moveend', () => this.update()); this.update(); return el; }, update() { const pxPerMile = Math.pow(2, map.getZoom()); const miles = [10, 25, 50, 100, 250, 500].find(m => m * pxPerMile >= 70) || 500; this._el.innerHTML = `<span style="width:${Math.round(miles * pxPerMile)}px"></span>${miles} miles${stageId === 'old' ? '' : ' · Sorenson’s estimate'}`; } }))().addTo(map);
  map.setView([30, -20], 0, { animate: false });
  drawBase();
  const zoomClass = () => map.getContainer().classList.toggle('zoomed-out', map.getZoom() < 0);
  map.on('zoomend', zoomClass); zoomClass();
  map.on('resize', () => { if (mapHome && $('#recenterMap').hidden) focusChapterMap(false); }).on('moveend zoomend', () => updateRecenter()).on('moveend', persist).on('zoomend moveend', layoutLabels).on('zoomend', () => { drawArrows(); drawAreaLabels(); });
}
function drawBase() {
  const g = data.geography;
  // Shaded relief rendered by scripts/render-relief.py from the terrain shapes.
  L.rectangle([[-400, -500], [500, 300]], { pane: 'sea', stroke: false, fillColor: '#0a2f4f', fillOpacity: 1, interactive: false }).addTo(map);
  // Tiles keep the relief sharp at close zoom. The one-file image is the fallback.
  if (data.relief?.tiles) L.tileLayer(`${data.relief.tiles.url}?v=${releaseVersion}`, { pane: 'land', className: 'relief-tiles', tileSize: data.relief.tiles.size, minNativeZoom: data.relief.tiles.minZoom, maxNativeZoom: data.relief.tiles.maxZoom, minZoom: -2, maxZoom: 3, bounds: data.relief.bounds, keepBuffer: 3 }).addTo(map);
  else if (data.relief) L.imageOverlay(`${data.relief.image}?v=${releaseVersion}`, data.relief.bounds, { pane: 'land', interactive: false, className: 'relief-image' }).addTo(map);
  else L.polygon(g.land.map(ll), { pane: 'land', color: '#d8c79a', weight: 1.6, fillColor: '#8f9a6a', fillOpacity: 1, interactive: false }).addTo(map);
  L.polygon(g.land.map(ll), { pane: 'land', color: '#81bbca', weight: .7, opacity: .35, fill: false, interactive: false }).addTo(map);
  for (const water of g.waters) L.polygon(water.points.map(ll), { pane: 'water', color: '#81bbca', weight: .7, fillColor: '#1c688a', fillOpacity: .2, interactive: false }).addTo(map);
  // The relief already shows high ground. This layer outlines the text-based zones and makes them clickable.
  layers.terrain = L.layerGroup();
  for (const t of g.terrain) {
    const mountain = t.level === 'mountain';
    const shape = L.polygon(t.points.map(ll), { pane: 'terrain', color: mountain ? '#3b2a17' : '#fff1c9', weight: 1.5, opacity: .75, dashArray: '5 6', fillColor: mountain ? '#3b2a17' : '#fff1c9', fillOpacity: .08, smoothFactor: 2, className: 'terrain-shape' }).addTo(layers.terrain);
    bind(shape, t, 'terrain');
  }
  // The Old World stage for 1 Nephi 1–17: measured relief rendered by scripts/render-old-world.py.
  if (data.reliefOld?.tiles) {
    const [[south, west], [north, east]] = data.reliefOld.bounds;
    L.rectangle([[south - 400, west - 400], [north + 400, east + 400]], { pane: 'sea', stroke: false, fillColor: '#0a2f4f', fillOpacity: 1, interactive: false }).addTo(map);
    L.tileLayer(`${data.reliefOld.tiles.url}?v=${releaseVersion}`, { pane: 'land', className: 'relief-tiles', tileSize: data.reliefOld.tiles.size, minNativeZoom: data.reliefOld.tiles.minZoom, maxNativeZoom: data.reliefOld.tiles.maxZoom, minZoom: -3, maxZoom: 3, bounds: data.reliefOld.bounds, keepBuffer: 3 }).addTo(map);
    for (const river of data.reliefOld.rivers || []) L.polyline(river.points.map(ll), { pane: 'water', color: '#4b9fbd', weight: river.size > 1 ? 2.2 : 1.4, opacity: .85, smoothFactor: 1, interactive: false }).addTo(map);
  }
  // Unnamed rivers traced from the relief's valleys by scripts/render-relief.py. The text names only the Sidon.
  for (const river of data.relief?.rivers || []) L.polyline(river.points.map(ll), { pane: 'water', color: '#4b9fbd', weight: river.size > 1 ? 2.2 : 1.4, opacity: .85, smoothFactor: 1, interactive: false }).addTo(map);
  const sidon = L.polyline(g.sidon.map(ll), { pane: 'water', color: '#4b9fbd', weight: 4, opacity: 1, smoothFactor: 1.5, interactive: false }).addTo(map);
  sidon.bindTooltip('River Sidon', { sticky: true, className: 'map-tooltip' });
  layers.grid = L.layerGroup().addTo(map);
  for (let x = -400; x <= 250; x += 50) L.polyline([[-320, x], [400, x]], { pane: 'grid', color: '#ffffff', weight: .5, opacity: .05, interactive: false }).addTo(layers.grid);
  for (let y = -300; y <= 400; y += 50) L.polyline([[y, -420], [y, 260]], { pane: 'grid', color: '#ffffff', weight: .5, opacity: .05, interactive: false }).addTo(layers.grid);
  for (const label of g.labels) L.marker(ll(label.at), { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: `geo-label geo-${label.kind}`, html: `<span>${esc(label.text)}</span>`, iconSize: [0, 0] }) }).addTo(map);
  L.marker(ll([-2, 30]), { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'geo-label geo-river', html: '<span>river Sidon</span>', iconSize: [0, 0] }) }).addTo(map);
}
function bind(layer, item, type) {
  layer.on('click', e => openFeature(item, type, e.target));
  // Terrain groups can be bound before they enter the map.
  const prepare = () => {
    const el = layer.getElement?.();
    if (!el || el.dataset.boundFeature) return;
    el.dataset.boundFeature = `${type}:${item.id}`;
    el.classList.add('map-feature');
    el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${item.name || item.title || item.label}`);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); openFeature(item, type, layer);
      }
    });
  };
  layer.on('add', prepare);
  prepare();
}
function activeRoutes() {
  const ids = new Set(chapterMap()?.routes || []);
  if (guideOverlay) guideOverlay.routeIds.forEach(id => ids.add(id));
  return data.routes.filter(r => ids.has(r.id));
}
function activeDistances() {
  if (guideOverlay?.distanceIds.length) return data.distances.filter(d => guideOverlay.distanceIds.includes(d.id) || state.layers.distances);
  return state.layers.distances ? data.distances : [];
}
function focusIds() {
  const ids = new Set(chapterMap()?.focusPlaceIds || []);
  guideOverlay?.placeIds.forEach(id => ids.add(id));
  return ids;
}
const mapFeatures = new Map(), arrowFeatures = new Map(), labelFeatures = new Map(), areaFeatures = new Map();
const reducedMapMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mapTransitionMs = 650;
// Retain each feature by identity. Interrupted fades resume from their current opacity.
function fadeMapFeature(entry, visible, done) {
  const el = entry.layer.getElement();
  const opacity = entry.animation ? getComputedStyle(el).opacity : (entry.visible ? '1' : '0');
  entry.animation?.cancel();
  entry.visible = visible;
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = visible ? '' : 'none';
  if (el.hasAttribute('tabindex')) el.setAttribute('tabindex', visible ? '0' : '-1');
  el.setAttribute('aria-hidden', String(!visible));
  if (reducedMapMotion.matches || !el.animate) { entry.animation = null; done?.(); return; }
  const animation = el.animate([{ opacity }, { opacity: visible ? 1 : 0 }], { duration: visible ? mapTransitionMs : 350, easing: 'ease-in-out' });
  entry.animation = animation;
  animation.onfinish = () => { entry.animation = null; done?.(); };
}
function keepMapFeature(collection, key, create) {
  let entry = collection.get(key);
  if (!entry) {
    entry = { layer: create(), visible: false, animation: null };
    collection.set(key, entry);
  }
  if (!entry.visible) fadeMapFeature(entry, true);
  return entry.layer;
}
function retireMapFeatures(collection, wanted) {
  for (const [key, entry] of collection) {
    if (wanted.has(key) || !entry.visible) continue;
    fadeMapFeature(entry, false, () => { map.removeLayer(entry.layer); collection.delete(key); });
  }
}
reducedMapMotion.addEventListener('change', () => {
  if (!reducedMapMotion.matches) return;
  for (const collection of [mapFeatures, arrowFeatures, labelFeatures, areaFeatures]) {
    for (const entry of collection.values()) entry.animation?.finish();
  }
  $$('.route-arrow svg').forEach(el => el.getAnimations().forEach(animation => animation.finish()));
});
function drawAreaLabels() {
  if (!map) return;
  const wanted = new Set();
  const cm = chapterMap();
  for (const a of data.areas) {
    const named = !!cm?.areaMentions?.[a.id];
    if (!named && map.getZoom() < 1) continue;
    wanted.add(a.id);
    const label = keepMapFeature(areaFeatures, a.id, () => L.marker(ll(a.at), { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'geo-label geo-area', html: `<span>${esc(a.name)}</span>`, iconSize: [0, 0] }) }).addTo(map));
    label.getElement().classList.toggle('named', named);
  }
  retireMapFeatures(areaFeatures, wanted);
}
function drawOverlays() {
  if (!map) return;
  const wanted = new Set();
  const feature = (key, create, item, type) => {
    wanted.add(key);
    return keepMapFeature(mapFeatures, key, () => {
      const layer = create().addTo(map);
      if (item) bind(layer, item, type);
      return layer;
    });
  };
  map[state.layers.zones ? 'addLayer' : 'removeLayer'](layers.terrain);
  const focus = focusIds(), cm = chapterMap();
  drawAreaLabels();
  for (const d of activeDistances()) {
    const a = pointOf(d.from), b = pointOf(d.to);
    if (!a || !b) continue;
    feature(`distance:${d.id}`, () => L.polyline([ll(a), ll(b)], { pane: 'distances', color: '#fff3c4', weight: 2, opacity: .85, dashArray: '2 6', className: 'distance-line' }), d, 'distance');
    feature(`distance-label:${d.id}`, () => L.marker(ll([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), { pane: 'distances', interactive: false, keyboard: false, icon: L.divIcon({ className: 'distance-label', html: `<span>${esc(d.label)}</span>`, iconSize: [0, 0] }) }));
  }
  if (state.layers.paths || guideOverlay) for (const r of activeRoutes()) {
    const pts = r.points.map(pointOf).filter(Boolean).map(ll), s = styleFor(r);
    feature(`route-shadow:${r.id}`, () => L.polyline(pts, { pane: 'routes', color: '#071a2a', weight: 7, opacity: .35, interactive: false, smoothFactor: 1 }));
    feature(`route:${r.id}`, () => L.polyline(pts, { pane: 'routes', color: s.color, weight: 4, opacity: 1, dashArray: s.dash, interactive: false, className: 'route-line' }));
    feature(`route-hit:${r.id}`, () => L.polyline(pts, { pane: 'routes', color: s.color, weight: 20, opacity: 0, className: 'route-hit' }), r, 'route');
  }
  for (const i of cm?.impacts || []) {
    const p = place(i.place);
    // The stroke stays above place labels. Its empty center keeps the place clickable.
    feature(`impact:${cm.chapter}:${p.id}`, () => L.circleMarker(ll(p.at), { pane: 'impacts', radius: 13, color: '#e0503f', weight: 3.5, fill: false, className: 'impact-ring' }), { ...p, id: `impact:${p.id}`, impact: i }, 'impact');
  }
  if (state.layers.places) for (const p of data.places) {
    if (p.conf === 'guess' && !state.layers.guesses && !focus.has(p.id)) continue;
    const on = focus.has(p.id);
    const style = placeDotStyle(p.conf, on);
    const marker = feature(`place:${p.id}`, () => L.circleMarker(ll(p.at), { pane: 'places', ...style, className: `place-dot conf-${p.conf}` }), p, 'place');
    marker._placeId = p.id;
    marker.setRadius(style.radius);
    marker.setStyle(style);
  }
  retireMapFeatures(mapFeatures, wanted);
  drawArrows();
  layoutLabels();
  renderLegend();
  syncSelection();
}
function drawArrows() {
  if (!map) return;
  const wanted = new Set();
  if (state.layers.paths || guideOverlay) for (const r of activeRoutes()) {
    const pts = r.points.map(pointOf).filter(Boolean).map(p => map.latLngToLayerPoint(ll(p)));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len < 26) continue;
      const count = Math.max(1, Math.floor(len / 110));
      for (let j = 0; j < count; j++) {
        const t = (j + .6) / count;
        const at = map.layerPointToLatLng([a.x + dx * t, a.y + dy * t]);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const key = `${r.id}:${i}:${j}`;
        wanted.add(key);
        const entering = !arrowFeatures.has(key);
        const arrow = keepMapFeature(arrowFeatures, key, () => L.marker(at, { pane: 'routes', interactive: false, keyboard: false, icon: L.divIcon({ className: 'route-arrow', iconSize: [18, 18], iconAnchor: [9, 9], html: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3 L14 9 L3 15 L6 9 Z" fill="${styleFor(r).color}" stroke="#fff0d5" stroke-width="1.2"/></svg>` }) }).addTo(map));
        arrow.setLatLng(at);
        const svg = arrow.getElement().firstElementChild;
        svg.style.transform = `rotate(${angle}deg)`;
        if (entering && !reducedMapMotion.matches && svg.animate) {
          svg.animate([
            { opacity: 0, transform: `rotate(${angle}deg) translateX(-24px)` },
            { opacity: 1, transform: `rotate(${angle}deg) translateX(0)` }
          ], { duration: 650, delay: 300 * (i - 1 + t) / (pts.length - 1), fill: 'backwards', easing: 'cubic-bezier(.22,.61,.36,1)' });
        }
      }
    }
  }
  retireMapFeatures(arrowFeatures, wanted);
}
function layoutLabels() {
  if (!map) return;
  const wanted = new Set();
  if (!state.layers.places) { retireMapFeatures(labelFeatures, wanted); return; }
  const focus = focusIds(), size = map.getSize(), zoom = map.getZoom();
  const occupied = [];
  const stage = map.getContainer().getBoundingClientRect();
  $$('.layers, .leaflet-control').forEach(el => { const r = el.getBoundingClientRect(); if (r.width) occupied.push({ x: r.left - stage.left - 4, y: r.top - stage.top - 4, w: r.width + 8, h: r.height + 8 }); });
  const items = data.places.filter(p => p.conf !== 'guess' || state.layers.guesses || focus.has(p.id)).map(p => ({ p, pt: map.latLngToContainerPoint(ll(p.at)), on: focus.has(p.id) }));
  items.forEach(({ p, pt }) => occupied.push({ id: p.id, x: pt.x - 6, y: pt.y - 6, w: 12, h: 12 }));
  const hits = (r, id) => occupied.some(b => b.id !== id && r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y);
  const measure = document.createElement('span'); measure.className = 'label-measure'; document.body.append(measure);
  items.sort((a, b) => b.on - a.on || (a.p.conf === 'guess') - (b.p.conf === 'guess'));
  for (const { p, pt, on } of items) {
    if (!on && zoom < 2) continue;
    if (pt.x < 0 || pt.y < 0 || pt.x > size.x || pt.y > size.y) continue;
    measure.textContent = p.name; measure.classList.toggle('on', on);
    const w = measure.offsetWidth, h = measure.offsetHeight;
    const options = [[11, -h / 2], [-w - 11, -h / 2]];
    const target = ([dx, dy]) => ({ x: pt.x + Math.min(-11, dx) - 2, y: pt.y + dy - 2, w: w + 26, h: h + 4 });
    const fit = options.find(offset => { const r = target(offset); return r.x > 2 && r.y > 2 && r.x + r.w < size.x - 2 && r.y + r.h < size.y - 2 && !hits(r, p.id); });
    if (!fit) continue;
    occupied.push(target(fit));
    wanted.add(p.id);
    const label = keepMapFeature(labelFeatures, p.id, () => {
      const layer = L.marker(ll(p.at), { pane: 'places', keyboard: false, icon: L.divIcon({ className: `map-text city-label conf-${p.conf}`, html: `<span>${esc(p.name)}</span>`, iconSize: [0, 0] }) }).addTo(map);
      bind(layer, p, 'place');
      layer._placeId = p.id;
      return layer;
    });
    // A retained label takes its new side and size here.
    const el = label.getElement();
    el.classList.toggle('relevant-label', on);
    el.classList.toggle('context-label', !on);
    el.style.width = `${w + 22}px`;
    el.style.height = `${h}px`;
    el.style.marginLeft = `${-(fit[0] < 0 ? w + 11 : 11)}px`;
    el.style.marginTop = `${-h / 2}px`;
    el.firstElementChild.style.marginLeft = `${fit[0] < 0 ? 0 : 22}px`;
  }
  measure.remove();
  retireMapFeatures(labelFeatures, wanted);
}
function renderLegend() {
  const kinds = [...new Set(activeRoutes().map(r => r.kind))];
  const cm = chapterMap();
  $('.map-note').innerHTML = `<div class="movement-legend">${(state.layers.paths || guideOverlay) ? kinds.map(k => `<span><i style="background:${movementStyles[k].color}"></i>${movementStyles[k].label}</span>`).join('') : ''}${cm?.impacts?.length ? '<span><i class="impact-key"></i>Destroyed city</span>' : ''}</div>${mapContextHtml(cm)}`;
}
function syncSelection() {
  const key = $('#contextCard').classList.contains('hidden') ? '' : $('#contextCard').dataset.feature;
  for (const { layer: l } of [...mapFeatures.values(), ...labelFeatures.values()]) {
    if (!l._placeId) continue;
    const on = key === `place:${l._placeId}`;
    l.getElement()?.classList.toggle('selected-place', on);
    l.getElement()?.setAttribute('aria-pressed', String(on));
  }
}
function boundsFor(points, pad = .18) { return L.latLngBounds(points.map(ll)).pad(pad); }
function fitOptions(animate = true) {
  const size = map.getSize(), panel = $('.layers').getBoundingClientRect();
  const drawer = $('#tourDrawer'), right = !drawer.classList.contains('hidden') && size.x > 760 ? drawer.offsetWidth + 30 : 40;
  if (size.x < 720) return { paddingTopLeft: [24, panel.height + 24], paddingBottomRight: [24, 90], maxZoom: 1.5, animate: animate && !reducedMapMotion.matches, duration: .8 };
  return { paddingTopLeft: [Math.min(panel.width + 30, size.x * .45), 40], paddingBottomRight: [Math.min(right, size.x * .4), 40], maxZoom: 1.5, animate: animate && !reducedMapMotion.matches, duration: .8 };
}
let lastFit = {};
// Each stage has its own bounds. The map jumps between stages without a long pan across empty sea.
const stageOfPoint = at => data.stages?.old && at[0] >= data.stages.old.bounds[0][1] ? 'old' : 'new';
function setStage(id) {
  if (id === stageId || !data.stages?.[id]) return false;
  stageId = id;
  map.setMaxBounds(null);
  map.options.minZoom = id === 'old' ? -2.5 : -1.5;
  map.getContainer().classList.toggle('old-world', id === 'old');
  document.body.classList.toggle('old-world-stage', id === 'old');
  return true;
}
function fitPoints(points, animate = true) { if (!map || !points.length) return; map.invalidateSize({ pan: false }); const moved = setStage(stageOfPoint(points[0])); if (moved) animate = false; const bounds = points.length === 1 ? boundsFor([[points[0][0] - 25, points[0][1] - 25], [points[0][0] + 25, points[0][1] + 25]], 0) : boundsFor(points); lastFit = { bounds, options: fitOptions(animate) }; map.stop(); map.fitBounds(bounds, lastFit.options); if (moved) { map.setMaxBounds(data.stages[stageId].bounds); map.fire('zoomlevelschange'); } }
function fitWholeMap(animate = true) {
  if (chapterMap()?.oldWorld && data.stages?.old) { const [[south, west], [north, east]] = data.stages.old.bounds; return fitPoints([[west + 300, south + 150], [east - 150, north - 50]], animate); }
  fitPoints(data.geography.land.filter(([, y]) => y < 345 && y > -240), animate);
}
function focusChapterMap(animate = true) {
  if (!map) return;
  const cm = chapterMap();
  const points = [...(cm?.focusPlaceIds || []).map(id => place(id)?.at), ...activeRoutes().flatMap(r => r.points.map(pointOf))].filter(Boolean);
  if (points.length) fitPoints(points, animate); else fitWholeMap(animate);
  // Remember the chapter view so Recenter can return to it.
  const target = map._getBoundsCenterZoom?.(lastFit.bounds, lastFit.options);
  mapHome = target && { zoom: target.zoom, center: map._limitCenter(target.center, target.zoom, map.options.maxBounds) };
  updateRecenter();
}
// Recenter shows only after the map leaves the chapter view.
function updateRecenter() {
  const button = $('#recenterMap');
  if (!button) return;
  if (!map || !mapHome) { button.hidden = true; return; }
  const zoom = map.getZoom(), offset = map.project(map.getCenter(), zoom).distanceTo(map.project(mapHome.center, zoom));
  button.hidden = Math.abs(zoom - mapHome.zoom) < .05 && offset < 4;
}
function panTo(at) { if (!map) return; if (!map.getBounds().pad(-.1).contains(ll(at))) map.panTo(ll(at)); }

// ---------- Guides ----------
function renderGuides() {
  const drawer = $('#tourDrawer');
  openStudyModal('tourDrawer');
  if (guideState) return renderGuideStep();
  drawer.innerHTML = `<button class="dialog-close" data-action="close-guides" aria-label="Close guides">×</button><span class="eyebrow">Study guides</span><h2>Choose a study guide</h2>${data.guides.map(g => `<button class="tour-choice" data-action="guide" data-id="${esc(g.id)}"><b>${esc(g.title)}</b><span>${esc(g.description)}</span></button>`).join('')}`;
  drawer.scrollTop = 0;
}
function startGuide(id, index = 0) { guideState = { id, index }; openStudyModal('tourDrawer'); applyGuideStep(); }
function clearGuideOverlay() { if (!guideOverlay) return; guideOverlay = null; drawOverlays(); }
function applyGuideStep() {
  const guide = data.guides.find(g => g.id === guideState?.id), step = guide?.steps[guideState.index];
  if (!step) return;
  guideOverlay = { placeIds: step.placeIds, routeIds: step.routeIds, distanceIds: step.distanceIds };
  closeCard();
  if (step.chapter !== state.chapter) { state.chapter = step.chapter; renderScripture(); renderTimeline(); }
  drawOverlays();
  renderGuideStep();
  const pts = [...step.placeIds.map(id => place(id)?.at), ...data.routes.filter(r => step.routeIds.includes(r.id)).flatMap(r => r.points.map(pointOf))].filter(Boolean);
  fitPoints(pts);
  requestAnimationFrame(() => scrollVerse(step.verse));
}
function renderGuideStep() {
  const guide = data.guides.find(g => g.id === guideState?.id), step = guide?.steps[guideState.index];
  if (!step) { guideState = null; return renderGuides(); }
  const page = step.page ? `<p class="muted">Sorenson’s map ${guideState.index + 1} is on ${sorensonCite(String(step.page))}.</p>` : '';
  const text = `<p>${esc(step.text)}</p>`;
  $('#tourDrawer').innerHTML = `<button class="dialog-close" data-action="close-guides" aria-label="Close guide">×</button><button class="back-button guide-back" data-action="guide-list">← Back to guide list</button><p class="tour-progress">${esc(guide.title)} · Step ${guideState.index + 1} of ${guide.steps.length}</p><h2>${esc(step.title)}</h2>${text}${page}${verseQuote(step.chapter, step.verse)}<p class="place-chips">${step.placeIds.map(id => `<button type="button" class="place-chip" data-place-id="${esc(id)}">${esc(place(id)?.name)}</button>`).join('')}</p><div class="tour-nav"><button data-action="guide-prev" ${guideState.index === 0 ? 'disabled' : ''}>← Previous</button><button data-action="guide-next">${guideState.index === guide.steps.length - 1 ? 'Finish' : 'Next →'}</button></div>`;
  $('#tourDrawer').scrollTop = 0;
}
function moveGuide(dir) {
  const guide = data.guides.find(g => g.id === guideState?.id);
  if (!guide) return;
  const next = guideState.index + dir;
  if (next < 0) return;
  if (next >= guide.steps.length) { showToast(`${guide.title} is complete.`); guideState = null; hideModalPanel($('#tourDrawer')); clearGuideOverlay(); return; }
  guideState.index = next; applyGuideStep();
}

// ---------- Sources ----------
function librarySourceHtml(s) {
  const alt = s.altUrl ? `<p><a target="_blank" rel="noopener" href="${esc(s.altUrl)}">Book page and chapter list ↗</a></p>` : '';
  return `<article class="library-source" id="library-${esc(s.id)}"><a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.title)} ↗</a><p>${esc(s.author || '')}${s.year ? ` · ${esc(s.year)}` : ''} · ${esc(s.type || 'Source')}${s.publisher ? ` · ${esc(s.publisher)}` : ''}</p>${alt}<p><span class="badge">About this source</span> ${esc(s.summary || '')}</p>${s.limitations ? `<p><span class="badge">What this cannot show</span> ${esc(s.limitations)}</p>` : ''}<p class="source-rights">${esc(s.license || '')}</p></article>`;
}
function openSource(id) {
  const s = source(id); if (!s) return;
  $('#sourceContent').innerHTML = `<h2 id="sourceDialogTitle">Source details</h2>${librarySourceHtml(s)}`;
  showModalPanel($('#sourceDialog'), id);
  $('#sourceDialog').scrollTop = 0;
}
function openLibrary() {
  const counts = data.places.reduce((n, p) => (n[p.conf] = (n[p.conf] || 0) + 1, n), {});
  $('#libraryContent').innerHTML = `<h2>Source library</h2><section><h3>How this map is built</h3><p>The map is drawn on a flat grid of miles. It is not tied to any real place on earth.</p><p>Each spot follows Sorenson’s figures and his travel-day estimates. When his figures disagree, his written mile estimates decide.</p><p>${counts.text || 0} places have relations given in the text. ${counts.inferred || 0} follow Sorenson’s reasoning. ${counts.guess || 0} are rough guesses.</p><p>Paths show the stops the text names. Bends between stops only help reading.</p><p>For 1 Nephi 1–17 the map shows real land from Jerusalem to Arabia. Jerusalem is a known place. The camps after it are proposed sites.</p></section>${data.sources.map(librarySourceHtml).join('')}`;
  openStudyModal('libraryDialog');
  $('#libraryDialog').scrollTop = 0;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
$('#layerToggle').dataset.action = 'toggle-layers'; $('#libraryButton').dataset.action = 'library'; $('#guidesButton').dataset.action = 'open-guides';
load();
