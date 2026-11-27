const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Vaults} = require('../src/vaults.cjs');
const {createVaultSearch} = require('../src/vault-search.cjs');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'chengjian-search-'));
  const vault = new Vaults(path.join(temp, 'config.json'));
  const search = createVaultSearch();
  try {
    const root = path.join(temp, '仓库'), sub = path.join(root, '资料');
    await fs.mkdir(sub, {recursive:true});
    await vault.select(root);
    const first = path.join(root, '甲.md'), second = path.join(sub, '乙.txt');
    await fs.writeFile(first, '# 标题\n\n第一个命中，第二个命**中**。\n\n#工作\n\n[正文链接](https://private.invalid)\n\n' +
      '<table><tr><td>第三个命<strong>中</strong></td></tr></table>\n\n<mark>原样 [a+b]</mark>');
    await fs.writeFile(second, Buffer.from('\ufeff命中，İ EXAMPLE。\r\n\r\n#工作组','utf16le'));
    for (const directory of ['照片.assets', 'node_modules', '.历史']) {
      await fs.mkdir(path.join(root, directory));
      await fs.writeFile(path.join(root, directory, '隐藏.md'), '命中');
    }
    const outside = path.join(temp, '外部');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, '外部.md'), '越界');
    await fs.symlink(outside, path.join(root,'外部链接'), process.platform === 'win32' ? 'junction' : 'dir');
    const badFile = path.join(root, '损坏.txt');
    await fs.writeFile(badFile, Buffer.from([0xf5, 0xfe]));
    const large = await fs.open(path.join(root,'超大.md'),'w');
    await large.truncate(20 * 1024 * 1024 + 1);
    await large.close();

    const run = (query, filters = {}) => search(vault, {query, ...filters});
    const all = await run('命中');
    assert.equal(all.hits.length, 4);
    assert.equal(all.skipped, 2);
    assert.deepEqual(all.hits.filter(h => h.path === '甲.md').map(h => h.occurrence), [0,1,2]);
    assert.deepEqual((await run('命中', {tag:'#工作'})).hits.map(h => h.path), ['甲.md','甲.md','甲.md']);
    assert.equal((await run('命中', {folder:'资料',tag:'工作'})).hits.length, 0);
    assert.equal((await run('example', {folder:'资料',tag:'工作组'})).hits[0].match, 'EXAMPLE');
    assert.equal((await run('[a+b]')).hits.length, 1);
    assert.equal((await run('正文链接')).hits.length, 1);
    assert.equal((await run('private.invalid')).hits.length, 0);
    assert.equal((await run('越界')).hits.length, 0);
    await assert.rejects(run('越界', {folder:'../外部'}));
    await assert.rejects(run('越界', {folder:'外部链接'}));

    await fs.writeFile(first, '刚刚编辑');
    assert.equal((await run('命中')).hits.length, 1);
    assert.equal((await run('刚刚编辑')).hits[0].path, '甲.md');
    await fs.rename(first, path.join(root,'已移动.md'));
    assert.equal((await run('刚刚编辑')).hits[0].path, '已移动.md');
    assert.equal((await run('全新')).hits.length, 0);
    await fs.writeFile(path.join(sub, '新增.md'), '全新索引');
    assert.equal((await run('全新索引')).hits.length, 1);
    await fs.unlink(second);
    assert.equal((await run('命中')).hits.length, 0);
    await fs.writeFile(path.join(root,'日志.txt'), 'a'.repeat(40000));
    const limited = await run('a');
    assert.equal(limited.hits.length, 200);
    assert.equal(limited.truncated, true);
    assert(limited.hits.every(hit => hit.before.length <= 34 && hit.after.length <= 48));
    const old = run('a'), latest = run('刚刚编辑');
    assert.equal((await old).hits.length, 0);
    assert.equal((await latest).hits.length, 1);
    await vault.select(outside);
    assert.equal((await run('刚刚编辑')).hits.length, 0);
    assert.equal((await run('越界')).hits.length, 1);
    console.log('PASS vault search: visible rich text, duplicate matches, UTF-16, mixed-case, literal punctuation, folder and tag filters, guarded paths, file changes, result cap, superseded requests and vault switches');
  } finally {
    search.dispose();
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('chengjian-search-'))
      throw Error('Unexpected test path');
    await fs.rm(temp, {recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
