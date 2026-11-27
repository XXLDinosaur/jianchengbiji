const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright');
const { build } = require('../package.json');

const project = path.resolve(__dirname, '..');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQmJr/HwAEIQIkrJTXTQAAAABJRU5ErkJggg==', 'base64');

async function createFixtures(dir) {
  const document = path.join(dir, '原始 文档.md');
  const image = path.join(dir, '拖入 图片.png');
  const other = ['另一篇.MARKDOWN', '第三篇.mdown', '纯文本.txt'].map(name => path.join(dir, name));
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'pixel.png'), pixel);
  await fs.writeFile(image, pixel);
  await fs.writeFile(document, '# 原始标题\n\n![相对图片](assets/pixel.png)\n\n保留的正文\n');
  for (const file of other) await fs.writeFile(file, '文件正文 ' + path.basename(file));
  return { document, image, other };
}

async function drop(page, cdp, target, files) {
  const box = await page.locator(target).boundingBox();
  assert.ok(box, '拖入区域应可见：' + target);
  const x = Math.floor(box.x + box.width / 2);
  const y = Math.floor(box.y + Math.min(40, box.height / 2));
  const data = { files, items: [], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
  }
}

async function waitForFile(page, file) {
  try {
    await page.waitForFunction(expected => document.querySelector('#status').title === expected, file);
  } catch (cause) {
    const status = await page.locator('#toast').textContent();
    throw new Error('未打开原文件 ' + file + '。窗口提示：' + status, { cause });
  }
  await page.locator('.tiptap[contenteditable="true"]').waitFor();
}

async function append(page, text) {
  const editor = page.locator('.tiptap');
  await editor.focus();
  await editor.press('Control+End');
  await page.keyboard.insertText(text);
}

async function waitForToast(page, pattern) {
  await page.waitForFunction(source => {
    const toast = document.querySelector('#toast');
    return !toast.hidden && new RegExp(source).test(toast.textContent);
  }, pattern.source);
}

async function saveAndRead(page, file, expectedText) {
  await page.keyboard.press('Control+s');
  for (let i = 0; i < 80; i++) {
    const text = await fs.readFile(file, 'utf8');
    if (text.includes(expectedText)) return text;
    await delay(100);
  }
  assert.fail('修改未写回拖入的原始文件：' + file);
}

async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiancheng-drop-'));
  const env = { ...process.env, MOYE_TEST_PROFILE: path.join(dir, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.EDITOR_TEST_EXECUTABLE || (process.argv.includes('--packaged')
    ? path.join(project, build.directories.output, 'win-unpacked', build.productName + '.exe') : null);
  let app;
  try {
    const files = await createFixtures(dir);
    app = await electron.launch({ executablePath: executable || require('electron'), args: executable ? [] : [project], env });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await page.locator('.welcome-home[open]').waitFor();
    await page.locator('.tiptap').waitFor({ state: 'attached' });
    await drop(page, cdp, '#guideContent', [files.document]);
    await waitForFile(page, files.document);
    await page.locator('.welcome-home').waitFor({ state: 'hidden' });
    const editor = page.locator('.tiptap');
    assert.equal(await editor.locator('h1').innerText(), '原始标题');
    await page.waitForFunction(() => document.querySelector('.tiptap img[alt="相对图片"]')?.naturalWidth === 1);
    await append(page, '写回原文');
    const saved = await saveAndRead(page, files.document, '写回原文');
    assert.match(saved, /assets\/pixel\.png/);

    const before = await editor.innerHTML();
    await drop(page, cdp, '.tiptap', [files.other[0], files.image]);
    await waitForToast(page, /分别|分开|单独/);
    assert.equal(await editor.innerHTML(), before);
    assert.equal(await page.locator('#status').getAttribute('title'), files.document);

    await drop(page, cdp, '.tiptap', [files.image]);
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.tiptap .rich-image img')];
      return images.length === 2 && images.every(img => img.naturalWidth === 1);
    });
    const withImage = await saveAndRead(page, files.document, '.assets/');
    assert.match(withImage, /写回原文/);
    assert.equal((await fs.readdir(path.join(dir, '原始 文档.assets'))).length, 1);

    await page.keyboard.press('Control+n');
    await page.waitForFunction(() => document.querySelector('.tiptap').textContent === '');
    await append(page, '未命名笔记的草稿');
    const tabs = page.locator('.document-tab [role="tab"]');
    const draftId = await page.locator('.document-tab.active').getAttribute('data-tab');
    await drop(page, cdp, '.tiptap', [...files.other, files.document]);
    await page.waitForFunction(() => document.querySelectorAll('.document-tab').length === 5);
    await waitForFile(page, files.document);
    for (const file of files.other) {
      const tab = tabs.filter({ hasText: path.parse(file).name });
      assert.equal(await tab.getAttribute('title'), file);
      await tab.click();
      await waitForFile(page, file);
      assert.match(await editor.innerText(), /文件正文/);
    }
    await drop(page, cdp, '.tiptap', [files.document]);
    await waitForFile(page, files.document);
    assert.equal(await tabs.count(), 5);
    assert.match(await editor.innerText(), /写回原文/);
    assert.equal(await editor.locator('.rich-image img').count(), 2);
    await page.locator('.document-tab[data-tab="' + draftId + '"] [role="tab"]').click();
    await page.waitForFunction(() => document.querySelector('.tiptap').textContent.includes('未命名笔记的草稿'));
    assert.deepEqual(errors, []);
    console.log('PASS ' + build.productName + ': 欢迎页拖入、保留原路径并保存、相对图片、混拖拒绝、图片插入、多文件处理与草稿保留');
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
