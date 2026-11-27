const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {_electron} = require('playwright');
const isNotes = require('../package.json').name === 'chengjian-notes';
const productName = isNotes ? '简成笔记' : '简成文档';
const prefix = isNotes ? 'Jiancheng-Notes' : 'Jiancheng-Documents';
const otherPrefix = isNotes ? 'Jiancheng-Documents' : 'Jiancheng-Notes';

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'jiancheng-update-ui-'));
  const profile = path.join(temp,'profile'), file = path.join(temp,'正在写的笔记.md');
  const installer = path.join(temp,'测试安装包.msi'), payload = 'mock installer data';
  const digest = 'sha256:' + createHash('sha256').update(payload).digest('hex');
  await fs.writeFile(file,'# 论文笔记\n\n继续写这一段。\n');
  const env = {...process.env,MOYE_TEST_PROFILE:profile};
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = env.EDITOR_TEST_EXECUTABLE;
  let app;
  async function launch({empty=false,offline=false}={}) {
    const args = exe ? [] : [process.cwd()];
    if (!empty) args.push(file);
    app = await _electron.launch({executablePath:exe || require('electron'),args,env});
    const page = await app.firstWindow();
    await app.evaluate(({net,shell,dialog,BrowserWindow},{offline,payload,digest,installer,productName,prefix,otherPrefix}) => {
      global.mockUpdate = {version:'9.12.0',calls:0,downloads:0,urls:[],opened:[],offline,live:false,digest};
      const realFetch = net.fetch.bind(net);
      net.fetch = async (url,options) => {
        const mock = global.mockUpdate;
        if (String(url).startsWith('https://github.com/XXLDinosaur/jianchengbiji/releases/download/')) {
          mock.downloads++;
          return new Response(mock.corrupt ? 'x'.repeat(payload.length) : payload);
        }
        if (!String(url).startsWith('https://api.github.com/repos/XXLDinosaur/jianchengbiji/releases?')) return realFetch(url,options);
        mock.calls++;
        if (mock.live) return realFetch(url,options);
        if (mock.offline) throw Error('test offline');
        const version = mock.version, name = prefix + '-' + version + '-x64.msi', tag = 'v' + version;
        const otherName = otherPrefix + '-99.1.0-x64.msi';
        const other = {name:otherName,size:payload.length,digest:mock.digest,state:'uploaded',
          browser_download_url:'https://github.com/XXLDinosaur/jianchengbiji/releases/download/' + tag + '/' + otherName};
        return Response.json([{tag_name:tag,prerelease:false,draft:false,assets:[other,{name,size:payload.length,digest:mock.digest,state:'uploaded',
          browser_download_url:'https://github.com/XXLDinosaur/jianchengbiji/releases/download/' + tag + '/' + name}]}]);
      };
      shell.openExternal = async url => { global.mockUpdate.urls.push(url); };
      shell.openPath = async file => { global.mockUpdate.opened.push(file); return ''; };
      const realSave = dialog.showSaveDialog.bind(dialog);
      dialog.showSaveDialog = (win,options) => {
        if (options.title !== '保存' + productName + '安装包') return realSave(win,options);
        return Promise.resolve({canceled:!!global.mockUpdate.cancel,filePath:installer});
      };
      BrowserWindow.getAllWindows()[0].show();
    }, {offline,payload,digest,installer,productName,prefix,otherPrefix});
    await page.locator('#checkUpdatesBtn').waitFor({state:'attached'});
    return page;
  }
  async function stop() {
    if (!app) return;
    await app.evaluate(({app}) => { setTimeout(() => app.exit(0),20); }).catch(() => {});
    await app.close().catch(() => {}); app = null;
  }
  async function manual(page) {
    await page.locator('#fileMenuBtn').click();
    await page.getByRole('menuitem',{name:'检查更新…'}).click();
  }
  try {
    let page = await launch();
    const editor = page.locator('.tiptap');
    if (await page.locator('#guideDone').isVisible()) await page.locator('#guideDone').click();
    await editor.click();
    let notice = page.locator('#updateNotice');
    await notice.getByText(productName + ' 9.12.0 可用').waitFor();
    assert.ok(await editor.evaluate(el => el.contains(document.activeElement)));
    await notice.getByRole('button',{name:'稍后提醒'}).click();
    assert.deepEqual(await app.evaluate(() => global.mockUpdate.urls),[]);
    await manual(page);
    assert.equal(await app.evaluate(() => global.mockUpdate.downloads),0);
    await app.evaluate(() => { global.mockUpdate.cancel=true; });
    await notice.getByRole('button',{name:'下载安装包'}).click();
    await notice.getByText(productName + ' 9.12.0 可用').waitFor();
    assert.equal(await app.evaluate(() => global.mockUpdate.downloads),0);
    await app.evaluate(() => { global.mockUpdate.cancel=false; global.mockUpdate.corrupt=true; });
    await notice.getByRole('button',{name:'下载安装包'}).click();
    await notice.getByText(/校验失败/).waitFor();
    assert.deepEqual(await app.evaluate(() => global.mockUpdate.opened),[]);
    await app.evaluate(() => { global.mockUpdate.corrupt=false; });
    await notice.getByRole('button',{name:'重新下载'}).click();
    await notice.getByText(productName + ' 9.12.0 已下载').waitFor();
    assert.equal(await fs.readFile(installer,'utf8'),payload);
    assert.deepEqual(await app.evaluate(() => global.mockUpdate.opened),[]);
    await notice.getByRole('button',{name:'稍后安装'}).click();
    await manual(page);
    await notice.getByRole('button',{name:'打开安装向导'}).click();
    await notice.getByText('安装向导已打开').waitFor();
    assert.deepEqual(await app.evaluate(() => global.mockUpdate.opened),[installer]);
    await notice.getByRole('button',{name:'关闭'}).click();
    await app.evaluate(() => { global.mockUpdate.digest=null; });
    await manual(page);
    await notice.getByText(/未提供 SHA-256/).waitFor();
    await notice.getByRole('button',{name:'浏览器下载'}).click();
    assert.deepEqual(await app.evaluate(() => global.mockUpdate.urls),[
      'https://github.com/XXLDinosaur/jianchengbiji/releases/download/v9.12.0/' + prefix + '-9.12.0-x64.msi'
    ]);
    assert.equal(await fs.readFile(file,'utf8'),'# 论文笔记\n\n继续写这一段。\n');
    await stop();
    page = await launch();
    notice = page.locator('#updateNotice');
    // Wait beyond the startup check to confirm throttling survives process restart.
    await page.waitForTimeout(5700);
    assert.equal(await app.evaluate(() => global.mockUpdate.calls),0);
    assert.ok(await notice.isHidden());
    await app.evaluate(({app}) => { global.mockUpdate.version=app.getVersion(); });
    await manual(page);
    await notice.getByText('暂无可用更新').waitFor();
    assert.ok((await notice.textContent()).includes('已是最新公开版本'));
    await notice.getByRole('button',{name:'关闭'}).click();
    await app.evaluate(() => { global.mockUpdate.offline=true; });
    await manual(page);
    await notice.getByText(/检查网络/).waitFor();
    await app.evaluate(() => { global.mockUpdate.offline=false;global.mockUpdate.version='0.1.0'; });
    await notice.getByRole('button',{name:'重新检查'}).click();
    await notice.getByText(/最新公开版本为 0\.1\.0/).waitFor();
    if (process.env.JIANCHENG_LIVE_UPDATE_TEST) {
      await notice.getByRole('button',{name:'关闭'}).click();
      await app.evaluate(() => {global.mockUpdate.live=true;});
      await manual(page);
      await notice.getByText(/暂无可用更新|简成(?:笔记|文档) [\d.]+ 可用/).waitFor({timeout:24000});
      console.log('Public release check in Electron:',await notice.locator('p').innerText());
    }
    await stop();
    await fs.writeFile(path.join(profile,'update-check.json'),JSON.stringify({lastSuccess:0}));
    page = await launch({empty:true,offline:true});
    await page.waitForTimeout(5700);
    assert.equal(await app.evaluate(() => global.mockUpdate.calls),1);
    assert.ok(await page.locator('#updateNotice').isHidden());
    await manual(page);
    await page.locator('#updateNotice').getByText(/检查网络/).waitFor();
    console.log('PASS startup reminder, editor focus, manual download, cancel, SHA-256 rejection, retry, deferred install, explicit wizard handoff, browser fallback, restart and offline checks.');
  } finally {
    await stop();
    if (path.dirname(temp) !== os.tmpdir() || !path.basename(temp).startsWith('jiancheng-update-ui-')) throw Error('Unexpected test directory');
    await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
})().catch(error => {console.error(error);process.exitCode=1;});
