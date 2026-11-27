export function installNoteTools(research, toast) {
  const trigger = document.createElement('button');
  trigger.id = 'noteToolsBtn';
  trigger.textContent = '笔记工具';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  document.getElementById('floatBtn').before(trigger);

  const menu = document.createElement('div');
  menu.id = 'noteToolsMenu';
  menu.className = 'glass-context-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  trigger.setAttribute('aria-controls', menu.id);

  function close() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function entry(id, label, action, needsDocument) {
    const item = document.createElement('button');
    item.id = id;
    item.textContent = label;
    item.dataset.document = String(needsDocument);
    item.setAttribute('role', 'menuitem');
    item.onmousedown = event => event.preventDefault();
    item.onclick = async () => {
      close();
      try { await action(); }
      catch (error) { toast(error.message); }
    };
    menu.append(item);
  }
  entry('newReadingNote', '新建文献阅读笔记…', research.newReading, false);
  entry('addResearchExcerpt', '插入文献摘录…', research.addExcerpt, true);
  entry('compareResearchSources', '插入文献对照表…', research.compareSources, true);
  trigger.onclick = () => {
    if (!menu.hidden) return close();
    for (const item of menu.querySelectorAll('[data-document="true"]')) {
      item.disabled = document.body.classList.contains('workspace-empty');
    }
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = rect.bottom + 5 + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  };
  menu.onkeydown = event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); }
  });
  window.addEventListener('resize', close);
}
