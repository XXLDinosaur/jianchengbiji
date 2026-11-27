const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zoteroSource, localPdf, encodePdfPath } = require('./research-source.cjs');

async function openZoteroSource(href) {
  const source = zoteroSource(href);
  if (!source) throw Error('不支持此 Zotero 来源链接');
  const {app, shell} = require('electron');
  if (!app.getApplicationNameForProtocol(source)) throw Error('此电脑尚未配置 Zotero 链接。请安装并启动 Zotero，再双击此出处。');
  try { await shell.openExternal(source); }
  catch { throw Error('无法打开 Zotero。请确认本机已安装并能打开 zotero:// 链接。'); }
  return true;
}

async function vaultNote(vaults, notePath) {
  if (!vaults.root || !notePath) throw Error('请先将笔记保存在当前仓库内，再关联本地 PDF');
  try { return await vaults.resolve(path.relative(vaults.root, notePath)); }
  catch { throw Error('当前笔记必须位于已打开的仓库内，才能关联本地 PDF'); }
}

async function resolveResearchPdf({href, vaults, notePath}) {
  const note = await vaultNote(vaults, notePath);
  const local = localPdf(href);
  if (!local) throw Error('请选择当前仓库中的 PDF 文件');
  const relative = path.relative(vaults.root, path.resolve(path.dirname(note),local.path));
  try {
    const file = await vaults.resolve(relative);
    if (!(await fs.stat(file)).isFile()) throw Error('请选择 PDF 文件');
    return pathToFileURL(file).href + (local.page ? '#page=' + local.page : '');
  } catch (error) {
    if (['ENOENT','ENOTDIR'].includes(error.code)) throw Error('找不到来源 PDF，请检查它与笔记的相对位置');
    throw error;
  }
}

async function handleResearchPdf({action, href, vaults, notePath, win}) {
  const {BrowserWindow, dialog} = require('electron');
  if (action === 'research-pdf-pick') {
    const note = await vaultNote(vaults, notePath);
    const picked = await dialog.showOpenDialog(win, {title:'选择当前仓库中的 PDF', defaultPath:vaults.root,
      filters:[{name:'PDF 文献', extensions:['pdf']}], properties:['openFile']});
    if (picked.canceled) return null;
    href = encodePdfPath(path.relative(path.dirname(note), picked.filePaths[0]));
    await resolveResearchPdf({href, vaults, notePath});
    return href;
  }
  const url = await resolveResearchPdf({href, vaults, notePath});
  if (action === 'research-pdf-validate') return true;
  if (action !== 'research-pdf-open') throw Error('未知 PDF 操作');
  const reader = new BrowserWindow({parent:win, width:1024, height:800, title:'PDF 原文', autoHideMenuBar:true,
    webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false, plugins:true}});
  reader.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  reader.webContents.on('will-navigate', (event, target) => {
    if (target.split('#')[0] !== url.split('#')[0]) event.preventDefault();
  });
  try { await reader.loadURL(url); }
  catch { reader.destroy(); throw Error('PDF 无法打开，请检查文件是否完好'); }
  return true;
}

module.exports = { zoteroSource, openZoteroSource, resolveResearchPdf, handleResearchPdf };
