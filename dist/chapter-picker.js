export function initChapterPicker(root, chapter, chapters, onSelect) {
  const trigger = root.querySelector('.chapter-picker-trigger');
  const menu = root.querySelector('.chapter-picker-menu');
  const options = [...menu.querySelectorAll('[role="option"]')];
  let search = '', searchTimer;

  function focusOption(index) {
    options.forEach((option, i) => { option.tabIndex = i === index ? 0 : -1; });
    options[index].focus({ preventScroll: true });
    options[index].scrollIntoView({ block: 'nearest' });
  }
  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const openBelow = below >= Math.min(320, above);
    menu.style.width = `${Math.min(rect.width, innerWidth - 24)}px`;
    menu.style.maxHeight = `${Math.max(44, Math.min(320, openBelow ? below : above))}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - rect.width - 12))}px`;
    menu.style.top = openBelow ? `${rect.bottom + 6}px` : 'auto';
    menu.style.bottom = openBelow ? 'auto' : `${innerHeight - rect.top + 6}px`;
  }
  trigger.setAttribute('popovertarget', menu.id);
  menu.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') positionMenu();
  });
  trigger.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    positionMenu();
    menu.showPopover();
  });
  menu.addEventListener('toggle', () => {
    const open = menu.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      const index = chapters.indexOf(chapter);
      focusOption(index);
      menu.scrollTop = options[index].offsetTop - (menu.clientHeight - options[index].offsetHeight) / 2;
    }
    else { clearTimeout(searchTimer); search = ''; }
  });
  menu.addEventListener('click', event => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    menu.hidePopover();
    onSelect(Number(option.dataset.value));
    document.querySelector('.chapter-picker-trigger')?.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', event => {
    const index = options.indexOf(document.activeElement);
    const target = { ArrowDown: Math.min(index + 1, options.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: options.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); focusOption(target); }
    else if (event.key === 'Escape') { event.preventDefault(); menu.hidePopover(); trigger.focus(); }
    else if (event.key === 'Tab') { menu.hidePopover(); trigger.focus(); }
    else if (/^\d$/.test(event.key)) {
      event.preventDefault();
      clearTimeout(searchTimer);
      search += event.key;
      const match = chapters.findIndex(value => String(value).startsWith(search));
      if (match !== -1) focusOption(match);
      searchTimer = setTimeout(() => { search = ''; }, 700);
    }
  });
}
