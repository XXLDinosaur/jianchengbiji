const fs = require('node:fs/promises');
const path = require('node:path');
const {Vaults} = require('./vaults.cjs');
const {readDocument} = require('./files.cjs');

const MAX_RESULTS = 200;
const MAX_FILE = 20 * 1024 * 1024;
const CACHE_BYTES = 80 * 1024 * 1024;
const workerFlag = '--vault-search-worker';
const empty = () => ({hits:[], truncated:false, skipped:0});
const excludeFolder = name => name.startsWith('.') || name.toLowerCase().endsWith('.assets') || name.toLowerCase() === 'node_modules';

function startScanner() {
  const {searchBlocks, extractTags} = require('../dist/document.cjs');
  const cache = new Map();
  let bytes = 0, lastRoot, watcher, previous, revision = 0;
  function forget(file) {
    bytes -= cache.get(file).size;
    cache.delete(file);
  }
  async function read(vault, relative, needTags) {
    const file = await vault.resolve(relative);
    const stat = await fs.stat(file, {bigint:true});
    if (stat.size > MAX_FILE) throw Error('文档超过 20 MB');
    const stamp = [stat.mtimeNs, stat.ctimeNs, stat.size].join('/');
    let record = cache.get(file);
    if (record) {
      forget(file);
      if (record.stamp !== stamp) record = null;
    }
    if (!record || (needTags && !record.tags)) {
      const {text} = await readDocument(file);
      if (!record) {
        const blocks = searchBlocks(text);
        record = {stamp, blocks, size:blocks.reduce((n, s) => n + s.length * 2 + 48, 240)};
      }
      if (needTags) {
        record.tags = extractTags(text);
        for (const tag of record.tags) record.size += tag.length * 2 + 48;
      }
    }
    if (record.size <= CACHE_BYTES) {
      while (cache.size && (bytes + record.size > CACHE_BYTES || cache.size >= 12000))
        forget(cache.keys().next().value);
      cache.set(file, record);
      bytes += record.size;
    }
    return record;
  }

  return async function scan(root, {query, folder, tag}, current) {
    if (root !== lastRoot) {
      watcher?.close();
      watcher = previous = null;
      cache.clear(); bytes = 0; lastRoot = root;
      // Reuse the small candidate set as the user adds characters. A changed
      // file invalidates it, and unsupported filesystems use a fresh listing.
      try {
        watcher = require('node:fs').watch(root, {recursive:true, persistent:false}, () => { revision++; });
        const currentWatcher = watcher;
        watcher.on('error', () => {
          currentWatcher.close();
          if (watcher === currentWatcher) { watcher = null; previous = null; }
        });
      } catch { /* Watching network shares is optional. */ }
    }
    const output = empty();
    if (!root || !query) return output;
    const vault = new Vaults();
    vault.root = root;
    const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    const folderPath = folder.replace(/[\\/]+/g, path.sep);
    if (path.isAbsolute(folderPath) || folderPath.split(path.sep).some(part => part && excludeFolder(part)))
      throw Error('请输入仓库内的文件夹相对路径');
    const startRevision = revision;
    async function matchFile(relative) {
      let record;
      try { record = await read(vault, relative, !!tag); }
      catch { output.skipped++; return; }
      if (!current() || (tag && !record.tags.includes(tag))) return;
      let occurrence = 0;
      for (const block of record.blocks) {
        expression.lastIndex = 0;
        let match;
        while ((match = expression.exec(block))) {
          if (output.hits.length === MAX_RESULTS) { output.truncated = true; return; }
          const from = match.index, to = from + match[0].length;
          output.hits.push({
            path:relative, occurrence:occurrence++, match:match[0],
            before:block.slice(Math.max(0, from - 34), from),
            after:block.slice(to, to + 48),
            moreBefore:from > 34, moreAfter:to + 48 < block.length,
          });
        }
      }
    }
    async function walk(dir) {
      let items;
      try { items = await vault.list(dir); }
      catch (error) {
        if (dir === folderPath) {
          if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw Error('找不到此文件夹，请检查相对路径');
          throw error;
        }
        output.skipped++;
        return;
      }
      for (const item of items) {
        if (!current() || output.truncated) return;
        if (item.folder) {
          if (!excludeFolder(item.name)) await walk(item.path);
          continue;
        }
        await matchFile(item.path);
      }
    }
    const refining = watcher && previous && previous.revision === startRevision &&
      Date.now() - previous.time < 2500 && previous.folder === folderPath && previous.tag === tag &&
      query.length > previous.query.length && query.startsWith(previous.query);
    if (refining) {
      output.skipped = previous.skipped;
      for (const file of previous.files) {
        if (!current() || output.truncated) return output;
        await matchFile(file);
      }
      if (current() && revision !== startRevision) {
        output.hits.length = 0; output.skipped = 0; output.truncated = false;
        await walk(folderPath);
      }
    } else await walk(folderPath);
    if (current()) {
      previous = !output.truncated && revision === startRevision ? {
        revision, folder:folderPath, tag, query, time:Date.now(), skipped:output.skipped,
        files:[...new Set(output.hits.map(hit => hit.path))],
      } : null;
    }
    return output;
  };
}

function runWorker() {
  const scan = startScanner();
  let latest, running = false;
  const port = process.parentPort;
  const send = data => port ? port.postMessage(data) : process.send?.(data);
  async function receive(message) {
    latest = message;
    if (running) return;
    running = true;
    try {
      while (latest) {
        const task = latest;
        if (task.request) {
          try {
            const result = await scan(task.root, task.request, () => latest === task);
            if (latest === task) send({id:task.id, result});
          } catch (error) {
            if (latest === task) send({id:task.id, error:error.message});
          }
        }
        if (latest === task) latest = null;
      }
    } finally { running = false; }
  }
  if (port) port.on('message', event => receive(event.data));
  else process.on('message', receive);
}

function createVaultSearch() {
  let worker, pending, idleTimer, sequence = 0;
  function stop() {
    clearTimeout(idleTimer);
    const oldWorker = worker;
    worker = null;
    pending?.resolve(empty());
    pending = null;
    oldWorker?.kill();
  }
  function onIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, 90000);
    idleTimer.unref();
  }
  function send(message) {
    if (worker.postMessage) worker.postMessage(message);
    else worker.send(message);
  }
  function spawn() {
    const child = process.type === 'browser' && process.versions.electron
      ? require('electron').utilityProcess.fork(__filename, [workerFlag], {stdio:'ignore', serviceName:'仓库全文搜索'})
      : require('node:child_process').fork(__filename, [workerFlag], {stdio:['ignore','ignore','ignore','ipc']});
    child.on('message', ({id, result, error}) => {
      if (worker !== child || pending?.id !== id) return;
      const task = pending;
      pending = null;
      onIdle();
      if (error) task.reject(Error(error));
      else task.resolve(result);
    });
    function failed() {
      if (worker !== child) return;
      clearTimeout(idleTimer);
      worker = null;
      pending?.reject(Error('搜索进程已退出，请重新搜索'));
      pending = null;
    }
    child.on('error', failed);
    child.on('exit', failed);
    return child;
  }

  async function search(vault, data = {}) {
    const root = vault.root;
    const request = {};
    for (const key of ['query', 'folder', 'tag']) {
      const value = data[key] ?? '';
      if (typeof value !== 'string' || value.length > 2048) throw Error('搜索条件过长或格式无效');
      request[key] = value.trim();
    }
    request.tag = request.tag.replace(/^#/, '').normalize('NFC').toLowerCase();
    const id = ++sequence;
    pending?.resolve(empty());
    pending = null;
    clearTimeout(idleTimer);
    if (!root || !request.query) {
      if (worker) { send({id}); onIdle(); }
      return empty();
    }
    if (!worker) worker = spawn();
    const result = await new Promise((resolve, reject) => {
      pending = {id, resolve, reject};
      try { send({id, root, request}); }
      catch (error) { reject(error); stop(); }
    });
    if (root !== vault.root) throw Error('仓库已切换，请重新搜索');
    return result;
  }
  search.dispose = stop;
  return search;
}

if (process.argv.includes(workerFlag) && (process.parentPort || process.send)) runWorker();
module.exports = {createVaultSearch};
