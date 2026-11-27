const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const {createHash} = require('node:crypto');
const {latestRelease:latestNotesRelease, createUpdates} = require('../src/updates.cjs');

const repository = 'https://github.com/XXLDinosaur/jianchengbiji';
function release(version, {name = 'Jiancheng-Notes-' + version + '-x64.msi', tag = 'notes-v' + version, ...other} = {}) {
  return {tag_name:tag, draft:false, prerelease:false, assets:[{
    state:'uploaded', size:100, name, browser_download_url:repository + '/releases/download/' + tag + '/' + encodeURIComponent(name)
  }], ...other};
}
function page(data) {
  return Response.json(data);
}
test('takes highest stable Notes MSI across releases, languages and pages', async () => {
  const docs = release('8.0.0', {name:'Jiancheng-Documents-8.0.0-x64.msi'});
  const first = Array.from({length:100}, () => docs);
  first[0] = release('0.9.7');
  first[1] = release('0.11.0', {prerelease:true});
  first[2] = release('0.12.0', {draft:true});
  first[3] = release('0.13.0', {name:'Jiancheng-Notes-0.13.0-arm64.msi'});
  first[4] = release('0.14.0');
  first[4].assets[0].browser_download_url = 'https://example.org/replacement.msi';
  first[5] = release('0.15.0');
  first[5].assets[0].size = 0;
  const combined = release('0.10.1', {name:'简成笔记-0.10.1-x64.msi',tag:'documents-v1.0.0-notes-v0.10.1'});
  const calls = [];
  const best = await latestNotesRelease(async url => {
    calls.push(String(url));
    return page(calls.length === 1 ? first : [combined,release('0.9.18')]);
  });
  assert.equal(calls.length,2);
  assert.ok(calls[1].endsWith('page=2'));
  assert.equal(best.version,'0.10.1');
  assert.equal(best.url,combined.assets[0].browser_download_url);
});
test('distinguishes empty or unavailable feeds from an up-to-date version', async () => {
  await assert.rejects(latestNotesRelease(async () => page([])),/安装包/);
  await assert.rejects(latestNotesRelease(async () => new Response('',{status:403})),/稍后/);
  await assert.rejects(latestNotesRelease(async () => page({error:'unexpected'})),/发布信息/);
});
test('manual checks, restart throttling, later reminders, retry, shared checks and validated download', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'notes-updates-'));
  const stateFile = path.join(dir,'state.json');
  t.after(() => fs.rm(stateFile,{force:true}).then(() => fs.rmdir(dir)));
  let now = Date.now(), calls = 0, version = '0.10.0', opened, offline = false;
  const options = {current:'0.10.1',stateFile,now:()=>now,openExternal:async url=>{opened=url;},
    fetch:async () => { calls++; if(offline)throw Error('offline'); return page([release(version)]); }};
  const service = createUpdates(options);
  const [manual, auto] = await Promise.all([service.check('manual'),service.check('automatic')]);
  assert.equal(manual.status,'current');
  assert.equal(calls,1);
  assert.ok(!auto || auto.status==='current');
  assert.equal(await service.check('automatic'),null);
  assert.equal(await createUpdates(options).check('automatic'),null);
  version='0.11.0';
  const update=await service.check('manual');
  assert.equal(update.status,'available');
  assert.equal(update.latest,'0.11.0');
  assert.equal(update.installMode,'browser');
  await assert.rejects(service.open('8.0.0'));
  await service.open('0.11.0');
  assert.equal(opened,release(version).assets[0].browser_download_url);
  now+=25*60*60*1000;
  assert.equal((await createUpdates(options).check('automatic')).status,'available');
  offline=true;
  await assert.rejects(service.check('manual'),/网络/);
  offline=false;version='0.10.1';
  assert.equal((await service.check('manual')).status,'current');
  await assert.rejects(service.open('0.11.0'));
});

test('downloads only on request and verifies the chosen MSI again on a separate open action', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'notes-installer-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const target = path.join(dir,'选择的位置.msi');
  const pkg = release('2.0.0');
  const bytes = Buffer.from('official mock installer');
  const sha = createHash('sha256').update(bytes).digest('hex');
  Object.assign(pkg.assets[0],{size:bytes.length,digest:'sha256:' + sha});
  let payload = bytes, downloads = 0;
  const launches = [];
  const service = createUpdates({
    current:'1.0.0',stateFile:path.join(dir,'state.json'),
    fetch:async url => {
      if (url.startsWith('https://api.github.com/')) return page([pkg]);
      assert.equal(url,pkg.assets[0].browser_download_url);
      downloads++;
      return new Response(payload);
    },
    openPath:async file => { launches.push(file); return ''; }
  });
  const download = () => service.open({action:'download',version:'2.0.0'}, async () => target);
  const install = () => service.open({action:'install',version:'2.0.0',path:'C:/ignored.msi'});
  assert.equal((await service.check('automatic')).installMode,'download');
  assert.equal(downloads,0);
  await assert.rejects(install(),/下载/);
  assert.equal((await service.open({action:'download',version:'2.0.0'},async () => null)).status,'canceled');
  await assert.rejects(service.open({action:'download',version:'2.0.0'},async () => path.join(dir,'笔记.md')),/MSI/i);
  assert.equal(downloads,0);
  await fs.writeFile(target,'a previous installment');
  payload=Buffer.alloc(bytes.length);
  await assert.rejects(download(),/校验/);
  assert.equal(await fs.readFile(target,'utf8'),'a previous installment');
  payload=Buffer.alloc(bytes.length+1);
  await assert.rejects(download(),/大小/);
  assert.deepEqual((await fs.readdir(dir)).sort(),['state.json','选择的位置.msi'].sort());
  payload=bytes;
  const parallel = await Promise.all([download(),download()]);
  assert.ok(parallel.every(result => result.status === 'ready'));
  assert.equal(downloads,3);
  assert.deepEqual(await fs.readFile(target),bytes);
  assert.deepEqual(launches,[]);
  assert.equal((await service.check('manual')).installMode,'ready');
  await install();
  assert.deepEqual(launches,[target]);
  await fs.writeFile(target,Buffer.alloc(bytes.length));
  await assert.rejects(install(),/校验/);
  assert.deepEqual(launches,[target]);
  assert.equal((await service.check('manual')).installMode,'download');
  delete pkg.assets[0].digest;
  assert.equal((await service.check('manual')).installMode,'browser');
  await assert.rejects(download(),/浏览器/);
  await assert.rejects(install(),/浏览器/);
});
test('only one automatic reminder across windows, and checks again the next day', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'notes-update-time-'));
  const stateFile = path.join(dir,'state.json');
  t.after(() => fs.rm(stateFile,{force:true}).then(() => fs.rmdir(dir)));
  let time=Date.now(), requests=0;
  const service = createUpdates({current:'0.10.1', stateFile, now:()=>time,
    fetch:async () => { requests++; return page([release('0.11.0')]); }});
  const initial=await Promise.all([service.check('automatic'),service.check('automatic')]);
  assert.equal(initial.filter(check=>check?.status==='available').length,1);
  assert.equal(requests,1);
  time+=23*60*60*1000;
  assert.equal(await service.check('automatic'),null);
  time+=60*60*1000;
  assert.equal((await service.check('automatic')).status,'available');
  assert.equal(requests,2);
});

test('offline automatic checks back off across a restart while a manual retry still runs', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'notes-update-retry-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  let time=Date.now(), calls=0;
  const options = {current:'0.10.1',stateFile:path.join(dir,'state.json'),now:()=>time,
    fetch:async () => { calls++; throw Error('offline'); }};
  await assert.rejects(createUpdates(options).check('automatic'),/网络/);
  const restarted = createUpdates(options);
  assert.equal(await restarted.check('automatic'),null);
  await assert.rejects(restarted.check('manual'),/网络/);
  assert.equal(calls,2);
  time += 60*60*1000;
  await assert.rejects(restarted.check('automatic'),/网络/);
  assert.equal(calls,3);
});

test('withdrawn asset cannot finish a pending download or open a previously saved file', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'notes-update-replaced-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const target = path.join(dir,'save.msi'), bytes = Buffer.from('first');
  const pkg = release('2.0.0');
  Object.assign(pkg.assets[0],{size:bytes.length,digest:'sha256:' + createHash('sha256').update(bytes).digest('hex')});
  let feed = pkg, started, resume, block = true;
  const downloading = new Promise(resolve => { started=resolve; });
  const delayed = new Promise(resolve => { resume=resolve; });
  const service = createUpdates({current:'1.0.0',stateFile:path.join(dir,'state.json'),
    fetch:async url => {
      if (url.startsWith('https://api.github.com/')) return page([feed]);
      started();
      if (block) await delayed;
      return new Response(bytes);
    },
    openPath:async () => assert.fail('must never launch a withdrawn installer')});
  const download = () => service.open({action:'download',version:'2.0.0'},async () => target);
  const install = () => service.open({action:'install',version:'2.0.0'});
  await service.check('manual');
  const inFlight = download();
  await downloading;
  feed = release('1.0.0');
  await service.check('manual');
  resume();
  await assert.rejects(inFlight,/版本已变化/);
  await assert.rejects(fs.stat(target),{code:'ENOENT'});
  feed = pkg;
  block = false;
  await service.check('manual');
  await download();
  pkg.assets[0].digest = 'sha256:' + 'f'.repeat(64);
  assert.equal((await service.check('manual')).installMode,'download');
  await assert.rejects(install(),/先下载/);
});
