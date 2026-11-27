const fs = require('node:fs/promises');
const path = require('node:path');
const { readDocument } = require('./files.cjs');
const { extractTags } = require('../dist/document.cjs');

function createTagIndex() {
  let cache = new Map();
  return async function scan(vault) {
    const root = vault.root;
    const groups = new Map(), next = new Map();
    let skipped = 0;
    async function walk(folder) {
      if (vault.root !== root) throw Error('仓库已切换');
      for (const entry of await vault.list(folder)) {
        if (entry.folder) {
          if (!entry.name.endsWith('.assets') && entry.name !== 'node_modules') await walk(entry.path);
          continue;
        }
        const file = path.join(root, entry.path);
        try {
          const stat = await fs.stat(file);
          if (stat.size > 20 * 1024 * 1024) { skipped++; continue; }
          const stamp = [stat.mtimeMs, stat.ctimeMs, stat.size].join('/');
          let record = cache.get(file);
          if (record?.stamp !== stamp) record = {stamp, tags:extractTags((await readDocument(file)).text)};
          next.set(file, record);
          for (const tag of record.tags) {
            if (!groups.has(tag)) groups.set(tag, []);
            groups.get(tag).push(entry.path);
          }
        } catch { skipped++; }
      }
    }
    if (root) await walk('');
    cache = next;
    return {groups:[...groups].sort(([a],[b]) => a.localeCompare(b,'zh-CN')), skipped};
  };
}
module.exports = {createTagIndex};
