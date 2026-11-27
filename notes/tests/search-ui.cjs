const {_electron} = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'chengjian-search-ui-'));
  let app;
  try {
    const vault = path.join(temp,'笔记'), sub = path.join(vault,'专题'), profile = path.join(temp,'profile');
    await fs.mkdir(sub, {recursive:true});
    await fs.mkdir(profile);
    await fs.writeFile(path.join(profile,'vaults.json'), JSON.stringify({root:vault,recent:[vault]}));
    await fs.writeFile(path.join(vault,'无标签.md'), '另一个关键词');
    const target = path.join(sub,'有标签.md');
    await fs.writeFile(target, '# 会议\n\n重复关键词。\n\n重复关键**词**。\n\n#会议');
    const env = {...process.env, MOYE_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    const exe = process.env.EDITOR_TEST_EXECUTABLE;
    app = await _electron.launch({executablePath:exe || require('electron'),args:exe ? [] : [process.cwd()],env});
    const page = await app.firstWindow();
    page.setDefaultTimeout(14000);
    await page.locator('#vaultSearchTab').waitFor();
    await page.keyboard.press('Control+Shift+f');
    const query = page.locator('#vaultSearchQuery'), hits = page.locator('.vault-search-hit');
    await query.waitFor();
    assert(await query.evaluate(el => document.activeElement === el));
    await query.fill('关键词');
    await page.waitForFunction(() => document.querySelectorAll('.vault-search-hit').length === 3);
    await page.locator('#vaultSearchFolder').fill('专题');
    await page.locator('#vaultSearchTag').fill('#会议');
    await page.waitForFunction(() => document.querySelectorAll('.vault-search-hit').length === 2);
    assert.deepEqual(await hits.locator('mark').allTextContents(), ['关键词', '关键词']);
    await hits.nth(1).click();
    await page.waitForFunction(() => {
      const selection = window.getSelection();
      return selection.toString() === '关键词' &&
        selection.anchorNode?.parentElement?.closest('p') === document.querySelectorAll('.tiptap p')[1];
    });
    assert.equal(await page.locator('#fileName').textContent(), '有标签');
    await hits.nth(0).click();
    await page.waitForFunction(() => window.getSelection().anchorNode?.parentElement?.closest('p') === document.querySelector('.tiptap p'));
    await query.fill('未匹配文本');
    await page.locator('.vault-search-status').filter({hasText:'未找到匹配的正文'}).waitFor();
    await page.locator('#filesPaneTab').click();
    await page.keyboard.press('Control+Shift+f');
    assert.equal(await query.inputValue(), '未匹配文本');
    console.log('PASS Electron search: shortcut, worker IPC, folder/tag filters, rich-text context, duplicate locations across marks and sidebar state');
  } finally {
    if (app) {
      await app.evaluate(({app}) => setTimeout(() => app.exit(0), 50)).catch(() => {});
      await app.close().catch(() => {});
    }
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('chengjian-search-ui-'))
      throw Error('Unexpected test path');
    await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
