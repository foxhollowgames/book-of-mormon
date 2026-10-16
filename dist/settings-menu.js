// Shared Wayfinder viewer file. Edit Wayfinder/viewer/settings-menu.js, then run npm run sync-viewer. Hash a7ea3661a121.
// The book directory and the reader share this menu. Choices apply to every book in every volume.
const preferenceKey = 'bible-wayfinder-preferences';
// The Book of Mormon kept its own choices before the volumes shared this menu. They still apply until a new choice replaces them.
const legacyKeys = ['bom-wayfinder-preferences'];
const choices = { studyMode: ['read', 'map'], perspective: ['historical', 'lds'], portraitMode: ['generated', 'non-generated'] };

export function readPreferences() {
  let saved = {};
  for (const key of [...legacyKeys, preferenceKey]) try { saved = { ...saved, ...JSON.parse(localStorage.getItem(key)) }; } catch {}
  return Object.fromEntries(Object.keys(choices).filter(key => choices[key].includes(saved[key])).map(key => [key, saved[key]]));
}
export function savePreferences(values) {
  const next = { ...readPreferences() };
  for (const key of Object.keys(choices)) if (choices[key].includes(values[key])) next[key] = values[key];
  try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch {}
}
// Open and close the menu. Return the close function.
export function initMenu(menu) {
  const button = menu.querySelector('.settings-button'), panel = menu.querySelector('.settings-panel');
  function close(restoreFocus = false) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open menu');
    if (restoreFocus) button.focus();
  }
  button.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Close menu');
  });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (!menu.contains(event.target)) close(); });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close(true); }
  });
  return close;
}
