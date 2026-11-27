function locateMatch(editor, hit, query) {
  if (!editor || editor.isDestroyed) return false;
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(literal, 'giu');
  let occurrence = 0, best = null;
  editor.state.doc.descendants((node, pos) => {
    if (best?.distance === 0 && best.score === hit.before.length + hit.after.length) return false;
    if (!node.isTextblock) return;
    const block = node.textBetween(0, node.content.size, '', '\uFFFC');
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(block))) {
      const start = match.index, end = start + match[0].length;
      // A tab can hold unsaved edits. Prefer matching surroundings, using the
      // occurrence number to distinguish repeated sentences with equal context.
      let left = 0, right = 0;
      while (left < hit.before.length && block[start - left - 1] === hit.before[hit.before.length - left - 1]) left++;
      while (right < hit.after.length && block[end + right] === hit.after[right]) right++;
      const score = left + right;
      const distance = Math.abs(occurrence++ - hit.occurrence);
      if (!best || score > best.score || (score === best.score && distance < best.distance))
        best = {score, distance, from:pos + 1 + start, to:pos + 1 + end};
      if (distance === 0 && score === hit.before.length + hit.after.length) break;
    }
    return false;
  });
  if (!best || (best.score === 0 && (hit.before.trim() || hit.after.trim()))) return false;
  return editor.chain().focus().setTextSelection({from:best.from, to:best.to}).scrollIntoView().run();
}

export function installSearchPane(panel, {call, open, root, getEditor, showSearch}) {
  const pane = document.createElement('section');
  pane.id = 'vaultSearchPane';
  pane.setAttribute('aria-label', '仓库全文搜索');
  pane.hidden = true;
  pane.innerHTML = `<form class="vault-search-form" role="search">
    <input id="vaultSearchQuery" type="search" aria-label="搜索仓库正文" placeholder="搜索仓库正文" maxlength="2048" autocomplete="off">
    <label>文件夹<input id="vaultSearchFolder" type="text" list="vaultSearchFolders" placeholder="全部文件夹" maxlength="2048" autocomplete="off"></label>
    <datalist id="vaultSearchFolders"></datalist>
    <label>标签<input id="vaultSearchTag" type="text" placeholder="全部标签" maxlength="2048" autocomplete="off"></label>
  </form>
  <p class="vault-search-status" role="status" aria-live="polite"></p>
  <div class="vault-search-results" aria-label="全文搜索结果"></div>`;
  panel.insertBefore(pane, panel.querySelector('.vault-footer'));
  const input = pane.querySelector('#vaultSearchQuery'), folder = pane.querySelector('#vaultSearchFolder');
  const tag = pane.querySelector('#vaultSearchTag'), folders = pane.querySelector('datalist');
  const status = pane.querySelector('[role=status]'), results = pane.querySelector('.vault-search-results');
  let version = 0, lastRoot = root(), timer, inFlight = false, composing = false, opening = false;
  let folderVersion = 0;

  async function suggestFolders() {
    const ticket = ++folderVersion, active = root();
    const value = folder.value.replaceAll('\\', '/'), cut = value.lastIndexOf('/');
    const parent = cut < 0 ? '' : value.slice(0, cut);
    const prefix = value.slice(cut + 1).toLowerCase();
    folders.replaceChildren();
    if (!active || parent.split('/').some(part => part.startsWith('.'))) return;
    try {
      const entries = await call('list', {path:parent, expectedRoot:active});
      if (ticket !== folderVersion || active !== root() || pane.hidden) return;
      const options = entries.filter(entry => entry.folder && !entry.name.toLowerCase().endsWith('.assets')
        && entry.name.toLowerCase() !== 'node_modules' && entry.name.toLowerCase().startsWith(prefix)).slice(0, 100);
      for (const entry of options) {
        const option = document.createElement('option');
        option.value = entry.path.replaceAll('\\', '/');
        folders.append(option);
      }
    } catch { /* A partially typed folder need not exist yet. */ }
  }

  function render(result, query, active, ticket) {
    const count = result.hits.length;
    let message = count ? '找到 ' + count + ' 处匹配' : '未找到匹配的正文';
    if (result.truncated) message = '已显示前 ' + count + ' 处匹配，可缩小搜索范围';
    if (result.skipped) message += ' · ' + result.skipped + ' 个项目未能读取';
    status.textContent = message;
    const fragment = document.createDocumentFragment();
    for (const hit of result.hits) {
      const button = document.createElement('button'), file = document.createElement('span');
      const context = document.createElement('span'), mark = document.createElement('mark');
      button.type = 'button';
      button.className = 'vault-search-hit';
      button.dataset.path = hit.path;
      button.dataset.occurrence = String(hit.occurrence);
      button.title = hit.path;
      file.className = 'vault-search-path';
      file.textContent = hit.path.replaceAll('\\', '/');
      context.className = 'vault-search-context';
      mark.textContent = hit.match;
      context.append((hit.moreBefore ? '…' : '') + hit.before.replaceAll('\uFFFC',' '), mark,
        hit.after.replaceAll('\uFFFC',' ') + (hit.moreAfter ? '…' : ''));
      button.append(file, context);
      button.onclick = async () => {
        if (opening || active !== root() || ticket !== version) return;
        opening = true;
        try {
          if (await open(hit.path) === false || active !== root() || pane.hidden) return;
          if (!locateMatch(getEditor(), hit, query)) status.textContent = '笔记内容已更新，当前位置已无此处匹配';
        } catch (error) { status.textContent = error.message; }
        finally { opening = false; }
      };
      fragment.append(button);
    }
    results.replaceChildren(fragment);
  }

  function refresh(delay = 0) {
    clearTimeout(timer);
    const ticket = ++version, active = root();
    results.replaceChildren();
    if (lastRoot !== active) {
      folder.value = ''; tag.value = ''; folders.replaceChildren(); folderVersion++;
      lastRoot = active;
    }
    const query = input.value.trim();
    if (pane.hidden || !active || !query) {
      if (inFlight) { inFlight = false; call('search', {query:''}).catch(() => {}); }
      status.textContent = active ? '输入关键词搜索笔记正文' : '请先从左下角打开仓库';
      return;
    }
    status.textContent = '正在搜索…';
    timer = setTimeout(async () => {
      inFlight = true;
      try {
        const result = await call('search', {query, folder:folder.value, tag:tag.value, expectedRoot:active});
        if (ticket === version && root() === active) render(result, query, active, ticket);
      } catch (error) {
        if (ticket === version) status.textContent = error.message;
      } finally { if (ticket === version) inFlight = false; }
    }, delay);
  }
  const form = pane.querySelector('form');
  form.onsubmit = event => { event.preventDefault(); refresh(); };
  form.oncompositionstart = () => { composing = true; };
  form.oncompositionend = () => { composing = false; refresh(280); };
  form.oninput = event => {
    if (!composing && !event.isComposing) refresh(280);
    if (event.target === folder && !composing) suggestFolders();
  };
  folder.onfocus = suggestFolders;
  document.addEventListener('note-saved', () => { if (!pane.hidden) refresh(150); });
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.isComposing ||
        event.key.toLowerCase() !== 'f' || document.querySelector('dialog[open]') || document.body.classList.contains('floating')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showSearch();
    input.focus(); input.select();
  }, true);
  return {
    refresh:() => refresh(),
    show(visible) {
      const entering = visible && pane.hidden;
      if (pane.hidden === !visible) return;
      pane.hidden = !visible;
      refresh();
      if (entering) input.focus();
    },
  };
}
