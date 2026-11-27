const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const {createHash, randomUUID} = require('node:crypto');
const path = require('node:path');
const {atomicSave} = require('./files.cjs');

const repository = 'XXLDinosaur/jianchengbiji';
const day = 24 * 60 * 60 * 1000;
const hour = day / 24;
const packageName = require('../package.json').name;
const products = {
  'chengjian-notes': {title:'简成笔记', assetPrefix:'Jiancheng-Notes'},
  'moye-markdown': {title:'简成文档', assetPrefix:'Jiancheng-Documents'}
};
const product = products[packageName];
if (!product) throw Error('未知的更新产品：' + packageName);
const installerName = new RegExp('^(?:' + product.assetPrefix + '|' + product.title + ')' + String.raw`-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-x64\.msi$`,'i');

function compareVersion(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// Releases may contain both products, and their publication order can differ from version order.
async function latestRelease(fetch) {
  const signal = AbortSignal.timeout(18000);
  let best = null;
  for (let page = 1; ; page++) {
    const endpoint = 'https://api.github.com/repos/' + repository + '/releases?per_page=100&page=' + page;
    let response;
    try {
      response = await fetch(endpoint, {signal, credentials:'omit', cache:'no-store', redirect:'error',
        headers:{Accept:'application/vnd.github+json','User-Agent':product.assetPrefix + '-Update'}});
    } catch {
      throw Error('无法连接更新服务，请检查网络后重试。');
    }
    if (response.status === 403 || response.status === 429) throw Error('更新服务暂时限制了请求次数，请稍后再试。');
    if (!response.ok) throw Error('更新服务暂时不可用，请稍后再试。');
    const releases = await response.json().catch(() => null);
    if (!Array.isArray(releases)) throw Error('暂时无法读取发布信息，请稍后再试。');
    for (const release of releases) {
      if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' ||
          !release.tag_name || /^\.{1,2}$/.test(release.tag_name) || !Array.isArray(release.assets)) continue;
      for (const asset of release.assets) {
        const match = installerName.exec(asset?.name);
        if (!match || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0) continue;
        const version = match[1];
        if (best && compareVersion(version,best.version) <= 0) continue;
        // Construct the download destination from the official repository and the matching MSI.
        const url = 'https://github.com/' + repository + '/releases/download/' +
          encodeURIComponent(release.tag_name) + '/' + encodeURIComponent(asset.name);
        if (asset.browser_download_url !== url) continue;
        const digest = /^sha256:([a-f\d]{64})$/i.exec(asset.digest)?.[1].toLowerCase();
        best = {version,url,name:asset.name,size:asset.size,digest};
      }
    }
    if (releases.length < 100) break;
  }
  if (!best) throw Error('发布页暂时没有可用的' + product.title + ' Windows 安装包。');
  return best;
}

function sameAsset(a,b) {
  return !!a && !!b && a.url === b.url && a.size === b.size && a.digest === b.digest;
}

async function verifyInstaller(file,asset) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size !== asset.size) throw Error('安装包大小不符，请重新下载。');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== asset.digest) throw Error('安装包 SHA-256 校验失败，请重新下载。');
}

async function saveInstaller(asset, destination, fetch, confirmCandidate) {
  if (!path.isAbsolute(destination) || path.extname(destination).toLowerCase() !== '.msi' ||
      /[<>:"|?*]/.test(path.basename(destination))) throw Error('请选择 MSI 安装包的保存位置。');
  const temporary = path.join(path.dirname(destination), '.jiancheng-' + randomUUID() + '.part');
  const controller = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(15 * 60 * 1000),controller.signal]);
  let ownsTemporary = false;
  try {
    const response = await fetch(asset.url,{signal,credentials:'omit',cache:'no-store'});
    if (response.status !== 200 || !response.body) throw Error('安装包下载失败，请检查网络或使用浏览器下载。');
    const hash = createHash('sha256');
    let received = 0;
    async function* verifiedChunks() {
      for await (const chunk of response.body) {
        received += chunk.byteLength;
        if (received > asset.size) throw Error('安装包大小不符，请重新下载。');
        hash.update(chunk);
        yield chunk;
      }
      if (received !== asset.size) throw Error('安装包大小不符，请重新下载。');
      if (hash.digest('hex') !== asset.digest) throw Error('安装包 SHA-256 校验失败，请重新下载。');
    }
    // A failed or interrupted download must leave any existing destination untouched.
    const handle = await fs.open(temporary,'wx');
    ownsTemporary = true;
    try { await handle.writeFile(verifiedChunks(),{signal}); }
    finally { await handle.close(); }
    confirmCandidate();
    await fs.rename(temporary,destination);
    ownsTemporary = false;
  } catch (error) {
    if (signal.aborted) throw Error('下载超时，请重试或使用浏览器下载。');
    if (error.code === 'ENOSPC') throw Error('保存位置的磁盘空间不足，请选择其他位置。');
    if (['EACCES','EPERM','EBUSY','ENOENT','EISDIR','EROFS'].includes(error.code)) throw Error('无法写入安装包，请选择其他保存位置。');
    if (/^(?:安装包|可用版本)/.test(error.message)) throw error;
    throw Error('未能完成下载，请检查网络和保存位置，或使用浏览器下载。');
  } finally {
    controller.abort();
    if (ownsTemporary) await fs.rm(temporary,{force:true}).catch(() => {});
  }
}

function createUpdates({current, stateFile, fetch, openExternal, openPath, now = Date.now}) {
  let lastSuccess = 0, lastAutomatic = 0, pending = null, candidate = null, saved = null, operation = null;
  const ready = fs.readFile(stateFile,'utf8').then(data => {
    const state = JSON.parse(data);
    lastSuccess = Number(state.lastSuccess) || 0;
    lastAutomatic = Number(state.lastAutomatic) || 0;
  }).catch(() => {});
  let writing = Promise.resolve();
  function persist() {
    const data = JSON.stringify({lastSuccess,lastAutomatic});
    writing = writing.then(() => atomicSave(stateFile,data)).catch(() => {});
    return writing;
  }
  function recent(time, delay) {
    const elapsed = now() - time;
    return time > 0 && elapsed >= 0 && elapsed < delay;
  }
  async function refresh() {
    const latest = await latestRelease(fetch);
    candidate = compareVersion(latest.version,current) > 0 ? latest : null;
    if (!sameAsset(saved?.asset,candidate)) saved = null;
    lastSuccess = now();
    await persist();
    if (!candidate) return {status:'current',current,latest:latest.version};
    return {status:'available',current,latest:candidate.version,size:candidate.size,
      installMode:saved ? 'ready' : candidate.digest ? 'download' : 'browser'};
  }
  function confirmCandidate(asset) {
    if (!sameAsset(asset,candidate)) throw Error('可用版本已变化，请重新检查更新。');
  }
  async function handleInstaller(action,asset,chooseDestination) {
    if (action === 'download') {
      const file = await chooseDestination(asset.name);
      if (!file) return {status:'canceled'};
      confirmCandidate(asset);
      await saveInstaller(asset,file,fetch,() => confirmCandidate(asset));
      confirmCandidate(asset);
      saved = {file,asset};
      return {status:'ready'};
    }
    if (!sameAsset(saved?.asset,asset)) throw Error('请先下载安装包。');
    const file = saved.file;
    try { await verifyInstaller(file,asset); }
    catch (error) {
      saved = null;
      if (error.code) throw Error('无法读取已下载的安装包，请重新下载。');
      throw error;
    }
    confirmCandidate(asset);
    try { if (await openPath(file)) throw Error(); }
    catch { throw Error('未能打开安装向导，请检查 Windows 安装服务或使用浏览器下载。'); }
    return {status:'opened'};
  }
  return {
    async check(mode) {
      if (mode !== 'manual' && mode !== 'automatic') throw Error('未知检查方式');
      await ready;
      if (mode === 'automatic') {
        if (recent(lastSuccess,day) || recent(lastAutomatic,hour)) return null;
        lastAutomatic = now();
        persist();
      }
      if (!pending) pending = refresh().finally(() => { pending = null; });
      try { return await pending; }
      finally { if (mode === 'automatic') await writing; }
    },
    async open(request,chooseDestination) {
      const {version,action} = typeof request === 'string' ? {version:request,action:'browser'} : request || {};
      const asset = candidate;
      if (!asset || asset.version !== version) throw Error('可用版本已变化，请重新检查更新。');
      if (action === 'browser') {
        try { await openExternal(asset.url); }
        catch { throw Error('未能打开浏览器，请重试。'); }
        return true;
      }
      if (action !== 'download' && action !== 'install') throw Error('未知更新操作。');
      if (!asset.digest) throw Error('此版本缺少 SHA-256 校验值，请使用浏览器下载。');
      if (operation) {
        if (operation.action === action && sameAsset(operation.asset,asset)) return operation.promise;
        throw Error('正在处理另一个更新请求，请稍后重试。');
      }
      const promise = handleInstaller(action,asset,chooseDestination).finally(() => { operation = null; });
      operation = {action,asset,promise};
      return promise;
    }
  };
}
module.exports = {latestRelease,createUpdates};
