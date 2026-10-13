// Keep each floating panel inside its viewport or map area.
export function initModalDragging() {
  for (const panel of document.querySelectorAll('dialog, #contextCard, #tourDrawer')) {
    let drag;
    const visible = () => panel.getClientRects().length > 0;
    function move(dx, dy) {
      if (!visible()) return;
      const rect = panel.getBoundingClientRect();
      const parent = panel.tagName === 'DIALOG' ? null : panel.offsetParent;
      const bounds = parent?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const left = Math.max(0, bounds.left) + 8;
      const top = Math.max(0, bounds.top) + 8;
      const right = Math.min(innerWidth, bounds.right) - 8;
      const bottom = Math.min(innerHeight, bounds.bottom) - 8;
      const x = Math.max(left, Math.min(rect.left + dx, Math.max(left, right - rect.width)));
      const y = Math.max(top, Math.min(rect.top + dy, Math.max(top, bottom - rect.height)));
      const [offsetX = 0, offsetY = 0] = (panel.style.translate || '0 0').split(' ').map(parseFloat);
      panel.style.translate = `${offsetX + x - rect.left}px ${offsetY + y - rect.top}px`;
    }
    function addHandle() {
      if (panel.querySelector(':scope > .modal-drag-handle')) return;
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'modal-drag-handle';
      handle.setAttribute('aria-label', 'Move panel. Drag or use arrow keys.');
      handle.title = 'Drag to move. Use arrow keys when focused.';
      panel.prepend(handle);
      handle.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        handle.focus({ preventScroll: true });
        panel.dataset.pinned = 'true';
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        handle.setPointerCapture(event.pointerId);
        handle.classList.add('dragging');
      });
      handle.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        move(event.clientX - drag.x, event.clientY - drag.y);
        drag.x = event.clientX;
        drag.y = event.clientY;
      });
      const stop = event => {
        if (drag?.id !== event.pointerId) return;
        drag = null;
        handle.classList.remove('dragging');
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, stop);
      handle.addEventListener('keydown', event => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        panel.dataset.pinned = 'true';
        const step = event.shiftKey ? 40 : 10;
        move(direction[0] * step, direction[1] * step);
      });
    }
    addHandle();
    // Detail cards and guide steps replace their content when opened.
    new MutationObserver(addHandle).observe(panel, { childList: true });
    const constrain = () => { if (panel.style.translate) move(0, 0); };
    window.addEventListener('resize', constrain);
    const observer = new ResizeObserver(constrain);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
  }
}
