// The last crumb names the open book. It opens a list of the other books.
// A volume with one book has no book crumb. The volume crumb is then the last one.
// Each book is {name, url}. `current` is the open book.
export function initBookCrumb(crumb, books, current) {
  if (books.length < 2) return;
  const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  crumb.innerHTML = `<button type="button" class="crumb-trigger" aria-haspopup="true" aria-expanded="false" popovertarget="bookMenu" aria-label="${escape(current.name)}. Choose another book.">${escape(current.name)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></button><ul class="crumb-menu" id="bookMenu" popover>${books.map(book => `<li><a href="${escape(book.url)}"${book === current ? ' aria-current="page"' : ''}>${escape(book.name)}</a></li>`).join('')}</ul>`;
  crumb.hidden = false;
  const trigger = crumb.querySelector('.crumb-trigger'), menu = crumb.querySelector('.crumb-menu');
  const links = [...menu.querySelectorAll('a')];

  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    menu.style.maxHeight = `${Math.max(120, innerHeight - rect.bottom - 22)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - menu.offsetWidth - 12))}px`;
  }
  menu.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(open));
    if (!open) return;
    positionMenu();
    const active = menu.querySelector('[aria-current]');
    active.focus({ preventScroll: true });
    menu.scrollTop = active.offsetTop - (menu.clientHeight - active.offsetHeight) / 2;
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.hidePopover(); });
  menu.addEventListener('keydown', event => {
    const index = links.indexOf(document.activeElement);
    const target = { ArrowDown: Math.min(index + 1, links.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: links.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); links[target].focus(); }
    else if (event.key === 'Tab') { menu.hidePopover(); trigger.focus(); }
  });
}
// The menu position is set when the menu opens. Close the menu when the window size changes.
addEventListener('resize', () => document.querySelector('.crumb-menu:popover-open')?.hidePopover());
