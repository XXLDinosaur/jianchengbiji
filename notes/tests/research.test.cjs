const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Vaults } = require('../src/vaults.cjs');

test('a reading template keeps literal titles, citation metadata, and a writable question in Markdown', async () => {
  const { readingMarkdown } = require('../src/research.js');
  const { prepareMarkdown } = await import('../src/core.mjs');
  const { createDocument } = require('@mixmark-io/domino');
  const note = readingMarkdown({title:'A <B> & [C] *D*', author:'Chen', year:'2024', venue:'期刊 A',
    question:'方法可以复用吗？', source:'https://example.org/paper.pdf'});
  const dom = createDocument(prepareMarkdown(note).html);
  assert.equal(dom.querySelector('h1').textContent, 'A <B> & [C] *D*');
  assert.equal(dom.querySelector('a').getAttribute('href'), 'https://example.org/paper.pdf');
  assert.match(dom.body.textContent, /Chen/);
  assert.match(dom.body.textContent, /2024/);
  assert.match(dom.body.textContent, /期刊 A/);
  assert.match(dom.body.textContent, /方法可以复用吗？/);
  assert.ok(Array.from(dom.querySelectorAll('h2')).some(h => h.textContent === '原文摘录'));
});

test('Zotero annotation links keep both their PDF page and selected annotation', () => {
  const { zoteroSource, sourceHref } = require('../src/research-source.cjs');
  const source = 'zotero://open-pdf/groups/12345/items/83HFMJ3S?page=18&annotation=PK292D2C';
  assert.equal(zoteroSource(source), source);
  assert.equal(sourceHref(source, 'xvii'), source);
  assert.equal(sourceHref('zotero://open-pdf/library/items/83HFMJ3S', '12'), 'zotero://open-pdf/library/items/83HFMJ3S?page=12');
  assert.equal(sourceHref('https://example.org/study.pdf', '17'), 'https://example.org/study.pdf#page=17');
  assert.equal(sourceHref('https://example.org/study.pdf#page=19', '17'), 'https://example.org/study.pdf#page=19');
  for (const invalid of ['zotero://launch/foo', 'zotero://open-pdf/library/items/83HFMJ3S?file=C:/test',
    'zotero://open-pdf/library/items/83HFMJ3S?page=-1', 'zotero://open-pdf@other/library/items/83HFMJ3S']) {
    assert.equal(zoteroSource(invalid), null, invalid);
  }
});

test('copying a Zotero Markdown annotation separates author, printed page, quote and comment', () => {
  const { parseAnnotation } = require('../src/research-source.cjs');
  const source = 'zotero://open-pdf/library/items/83HFMJ3S?page=18&annotation=PK292D2C';
  const text = '“图 2 的两组数据有重叠。” ([Chen et al., 2021, p. 13](zotero://select/library/items/WS7M8D6T)) ([pdf](' + source + '))\n需要检查误差条。';
  assert.deepEqual(parseAnnotation(text), {quote:'图 2 的两组数据有重叠。', author:'Chen et al.', year:'2021', page:'13',
    source, interpretation:'需要检查误差条。'});
  assert.equal(parseAnnotation('普通粘贴'), null);
  assert.equal(parseAnnotation(text + '\n' + text), null, 'several annotations must never collapse into one misattributed quote');
});

test('a relative PDF attachment and page remain usable after moving the vault', async t => {
  const { resolveResearchPdf } = require('../src/research.cjs');
  const { sourceHref, localPdf } = require('../src/research-source.cjs');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cj-research-'));
  t.after(() => fs.rm(temp, { recursive:true, force:true }));
  const vaults = new Vaults(path.join(temp, 'profile.json'));
  let root = path.join(temp, 'vault');
  await fs.mkdir(path.join(root, 'notes'), {recursive:true});
  await fs.mkdir(path.join(root, '资料'));
  await fs.writeFile(path.join(root, 'notes', 'reading.md'), '# Study');
  const pdf = path.join('资料', '试验 10% (A).pdf');
  await fs.writeFile(path.join(root, pdf), '%PDF-1.7');
  await fs.writeFile(path.join(temp, 'outside.pdf'), '%PDF-1.7');
  const href = sourceHref('../资料/试验 10% (A).pdf', '9');
  assert.equal(href, '../%E8%B5%84%E6%96%99/%E8%AF%95%E9%AA%8C%2010%25%20%28A%29.pdf#page=9');
  for (const attempt of [0,1]) {
    await vaults.select(root);
    const notePath = path.join(root, 'notes', 'reading.md');
    assert.equal(await resolveResearchPdf({href, vaults, notePath}), pathToFileURL(path.join(root, pdf)).href + '#page=9');
    await assert.rejects(resolveResearchPdf({href:'../../outside.pdf#page=1', vaults, notePath}));
    await assert.rejects(resolveResearchPdf({href:'../missing.pdf#page=1', vaults, notePath}), /找不到/);
    if (!attempt) {
      const moved = path.join(temp, 'moved');
      await fs.rename(root, moved);
      root = moved;
    }
  }
  for (const invalid of ['/a.pdf','//server/sh/a.pdf','C:/a.pdf','%5C%5Cserver/a.pdf','sub/a.exe','../a.pdf#run=1','file:///a.pdf']) assert.equal(localPdf(invalid), null, invalid);
});
