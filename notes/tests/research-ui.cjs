const {_electron: electron} = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cj-reading-ui-'));
  const root = path.resolve(__dirname, '..');
  const profile = path.join(temp, 'profile');
  const vault = path.join(temp, '仓库');
  const folder = path.join(vault, '项目');
  const pdf = path.join(vault, '资料', '报告 (定稿).pdf');
  const note = path.join(folder, '文献阅读实验.md');
  const annotation = 'zotero://open-pdf/library/items/83HFMJ3S?page=18&annotation=PK292D2C';
  let app, page;
  async function start(file) {
    const env = {...process.env, MOYE_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    const args = process.env.EDITOR_TEST_EXECUTABLE ? [] : [root];
    if (file) args.push(file);
    app = await electron.launch({executablePath:process.env.EDITOR_TEST_EXECUTABLE || require('electron'), args, env});
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await page.locator('.tiptap').waitFor({state:'attached'});
    if (await page.locator('#guideClose').isVisible()) await page.locator('#guideClose').click();
  }
  async function stop() {
    if (!app) return;
    await app.evaluate(({app}) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {}); app = null;
  }
  async function command(id) {
    await page.locator('#noteToolsBtn').click();
    await page.locator('#' + id).click();
  }
  const form = () => page.locator('#researchDialog[open]');
  const field = key => form().locator('[name="' + key + '"]');
  const commit = () => form().locator('button[type="submit"]').click();
  try {
    await fs.mkdir(profile, {recursive:true});
    await fs.mkdir(folder, {recursive:true});
    await fs.mkdir(path.dirname(pdf), {recursive:true});
    await fs.writeFile(path.join(profile,'vaults.json'),JSON.stringify({root:vault,recent:[vault]}));
    await start();
    await page.locator('#filesPaneTab').click();
    await page.getByRole('treeitem',{name:'项目',exact:true}).click();
    await command('newReadingNote');
    await field('title').fill('文献阅读实验'); await field('author').fill('Chen'); await field('year').fill('2021');
    await field('venue').fill('实验期刊'); await field('question').fill('不同研究如何控制偏差？');
    await commit();
    await page.locator('.tiptap h1').filter({hasText:'文献阅读实验'}).waitFor();
    assert.match(await fs.readFile(note,'utf8'), /## 研究方法/);

    const pdfBytes = await app.evaluate(async ({BrowserWindow}) => {
      const print = new BrowserWindow({show:false});
      try {
        await print.loadURL('data:text/html,' + encodeURIComponent('<p>Page one</p><p style="break-before:page">Page two</p>'));
        return Array.from(await print.webContents.printToPDF({}));
      } finally { print.destroy(); }
    });
    await fs.writeFile(pdf,Buffer.from(pdfBytes));
    await app.evaluate(({dialog},file) => {dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]});},pdf);
    await command('addResearchExcerpt');
    assert.equal(await field('author').inputValue(),'Chen');
    await field('quote').fill('图二的估计区间重叠。'); await field('interpretation').fill('还要比较基线。');
    await field('page').fill('2'); await form().getByRole('button',{name:'选择仓库内的 PDF…'}).click();
    await page.waitForFunction(() => document.querySelector('#research-source').value.endsWith('.pdf'));
    await commit();
    await page.locator('.tiptap blockquote').filter({hasText:'图二的估计区间重叠。'}).waitFor();

    await page.locator('.tiptap').evaluate(node => {
      const clipboardData = new DataTransfer();
      const annotationData = encodeURIComponent(JSON.stringify({attachmentURI:'http://zotero.org/groups/123/items/B8FQ37ME',
        position:{pageIndex:4},pageLabel:'iii',annotationKey:'PK292D2C'}));
      clipboardData.setData('text/html','<p><span class="highlight" data-annotation="' + annotationData + '">“图例见附录。”</span> <span class="citation">(Zhao, 2020)</span> 与正文对照。</p>');
      node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
    });
    assert.equal(await field('quote').inputValue(),'图例见附录。');
    assert.equal(await field('page').inputValue(),'iii');
    assert.equal(await field('source').inputValue(),'zotero://open-pdf/groups/123/items/B8FQ37ME?page=5&annotation=PK292D2C');
    await form().getByRole('button',{name:'取消'}).click();

    await page.locator('.tiptap').evaluate((node,href) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain','“匹配后差异缩小。” ([Lin, 2024, p. 13](zotero://select/library/items/WS7M8D6T)) ([pdf](' + href + '))');
      node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
    },annotation);
    assert.equal(await field('quote').inputValue(),'匹配后差异缩小。');
    assert.equal(await field('title').inputValue(),'','a pasted source must not inherit the current reading note title');
    assert.equal(await field('page').inputValue(),'13'); assert.equal(await field('author').inputValue(),'Lin');
    await field('interpretation').fill('可与图二交叉验证。'); await commit();
    await page.locator('.tiptap a[href^="zotero:"]').waitFor();

    await page.locator('.tiptap h2').last().click();
    await command('compareResearchSources');
    await field('question').fill('如何控制偏差？'); await commit();
    const cell = page.locator('.tiptap table tr').nth(1).locator('td').first();
    await cell.click(); await page.keyboard.insertText('Chen，2021');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => document.querySelector('#saveState').textContent === '已保存');
    const markdown = await fs.readFile(note,'utf8');
    assert.match(markdown,/> 图二的估计区间重叠。/); assert.match(markdown,/还要比较基线/);
    assert.ok(markdown.includes(annotation)); assert.match(markdown, /#page=2/);
    assert.match(markdown,/可与图二交叉验证/); assert.match(markdown,/Chen，2021/);
    assert.ok(!markdown.includes('file:') && !markdown.includes(temp));
    await stop();

    await start(note);
    const source = page.locator('.tiptap a[href$="#page=2"]');
    await source.waitFor();
    assert.equal(await page.locator('.tiptap blockquote').count(),2);
    assert.equal(await page.locator('.tiptap a[href^="zotero:"]').getAttribute('href'),annotation);
    assert.match(await page.locator('.tiptap table').innerText(), /Chen，2021/);
    const nextWindow = app.waitForEvent('window');
    await source.dblclick();
    const viewer = await nextWindow;
    await viewer.waitForURL(pathToFileURL(pdf).href + '#page=2');
    const pdfHost = viewer.frames().find(frame => frame.url().startsWith('chrome-extension:')) || await viewer.waitForEvent('framenavigated', {predicate:frame=>frame.url().startsWith('chrome-extension:'),timeout:10000});
    await pdfHost.waitForFunction(() => {
      const ui = document.querySelector('pdf-viewer')?.shadowRoot;
      const toolbar = ui?.querySelector('viewer-toolbar')?.shadowRoot;
      return toolbar?.querySelector('viewer-page-selector')?.shadowRoot?.querySelector('input')?.value === '2';
    }, null, {timeout:12000});
    await viewer.close();
    // Keep external handlers local to this test so it never starts system Zotero.
    await app.evaluate(({app,shell}) => {
      app.getApplicationNameForProtocol = () => 'Zotero';
      shell.openExternal = async href => {global.researchTestOpened = href;};
    });
    await page.locator('.tiptap a[href^="zotero:"]').dblclick();
    assert.equal(await app.evaluate(() => global.researchTestOpened),annotation);
    await app.evaluate(({app,shell}) => {
      app.getApplicationNameForProtocol = () => '';
      shell.openExternal = async () => { throw Error('must not launch'); };
    });
    await page.locator('.tiptap a[href^="zotero:"]').dblclick();
    await page.locator('#toast').filter({hasText:'此电脑尚未配置 Zotero 链接'}).waitFor();
    console.log('PASS reading note, manual and pasted excerpts, editable comparison, PDF page, Zotero absence, save and reopen');
  } catch (error) {
    if (page && !page.isClosed()) {
      console.error('Vault state:',await page.evaluate(async () => ({ state:await window.desktop.vault({action:'state'}), tree:document.querySelector('#vaultTree')?.innerText, classes:document.body.className, selected:document.querySelector('#vaultPanel [aria-selected=true]')?.textContent })).catch(()=>null));
      console.error('Research dialog:',await page.locator('#researchDialog .research-error').textContent({timeout:500}).catch(()=>''));
      console.error('Latest toast:',await page.locator('#toast').textContent({timeout:500}).catch(()=>''));
    }
    throw error;
  } finally {
    await stop(); await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250});
  }
})().catch(error => {console.error(error);process.exitCode=1;});
