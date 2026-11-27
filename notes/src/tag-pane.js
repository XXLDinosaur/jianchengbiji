export function installTagPane(panel, {scan, root, open}) {
  const pane = document.createElement('section');
  pane.id = 'tagPane';
  pane.hidden = true;
  panel.insertBefore(pane, panel.querySelector('.vault-footer'));
  let selected = '', lastRoot, generation = 0;
  function button(label, action) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.onclick = action;
    return item;
  }
  async function refresh() {
    const ticket = ++generation;
    if (pane.hidden) return;
    const currentRoot = root();
    if (currentRoot !== lastRoot) selected = '';
    lastRoot = currentRoot;
    if (!currentRoot) { pane.textContent = '先从左下角打开仓库，即可查看标签。'; return; }
    try {
      const {groups, skipped} = await scan();
      if (ticket !== generation || currentRoot !== root()) return;
      function render() {
        pane.replaceChildren(button('刷新标签', refresh));
        const group = groups.find(([tag]) => tag === selected);
        if (group) {
          pane.append(button('‹ 全部标签', () => {selected = ''; render();}));
          const title = document.createElement('strong');
          title.textContent = '#' + selected + '（' + group[1].length + '）';
          pane.append(title);
          for (const file of group[1]) {
            const result = button(file, () => open(file));
            result.className = 'tag-document';
            pane.append(result);
          }
        } else {
          for (const [tag, files] of groups) pane.append(button('#' + tag + '（' + files.length + '）', () => {selected = tag; render();}));
          if (!groups.length) pane.append('在笔记正文中输入 #论文 这样的标签，保存后就会显示在这里。');
        }
        if (skipped) pane.append('有 ' + skipped + ' 个文件未能读取。');
      }
      render();
    } catch (err) { if (ticket === generation) pane.replaceChildren(err.message, button('重试',refresh)); }
  }
  document.addEventListener('note-saved',refresh);
  return {refresh, show(visible){pane.hidden = !visible; refresh();}};
}

