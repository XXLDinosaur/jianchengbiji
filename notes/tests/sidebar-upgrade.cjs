const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron} = require('playwright');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'notes-sidebar-upgrade-'));
  const profile = path.join(temp,'profile'), vault = path.join(temp,'仓库');
  const filename = '原周会.md', file = path.join(vault,filename);
  const markdown = '# 历史纪要\n\n会议类型：项目周会\n\n## 行动项\n\n- [ ] 校对稿件\n\n[上次记录](./上次.md)\n';
  let app;
  try {
    await fs.mkdir(profile);
    await fs.mkdir(vault);
    await fs.writeFile(file,markdown);
    await fs.writeFile(path.join(vault,'上次.md'),'# 上次记录\n');
    await fs.writeFile(path.join(profile,'vaults.json'), JSON.stringify({root:vault,recent:[vault]}));
    const exe = process.env.EDITOR_TEST_EXECUTABLE;
    const env = {...process.env,MOYE_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({executablePath:exe || require('electron'), args:exe ? [] : [process.cwd()],env});
    const page = await app.firstWindow();
    await page.locator('#filesPaneTab').waitFor();
    await page.evaluate(() => localStorage.setItem('notes.sidebar','meetings'));
    await page.reload();
    await page.locator('#filesPaneTab').waitFor();
    assert.equal(await page.locator('#filesPaneTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('notes.sidebar')),'files');
    assert.deepEqual(await page.locator('.sidebar-switcher [role=tab]').allTextContents(),['文件','搜索','#标签','导航']);
    await page.locator('#noteToolsBtn').click();
    assert.equal(await page.locator('#noteToolsMenu [role=menuitem]').count(),3);
    await page.keyboard.press('Escape');
    if (await page.locator('#guideClose').isVisible()) await page.locator('#guideClose').click();
    await page.locator('#vaultTree [data-path="原周会.md"]').click();
    await page.getByRole('heading',{name:'历史纪要'}).waitFor();
    assert.equal(await page.locator('.tiptap input[type=checkbox]').count(),1);
    await page.locator('.tiptap a').filter({hasText:'上次记录'}).click();
    await page.getByRole('heading',{name:'上次记录'}).waitFor();
    assert.equal(await fs.readFile(file,'utf8'),markdown);
    await page.getByRole('tab',{name:'#标签',exact:true}).click();
    await page.reload();
    await page.locator('#tagsPaneTab[aria-selected=true]').waitFor();
    console.log('PASS old sidebar selection resets to files; existing notes, checkboxes, relative links and tag preference work.');
  } finally {
    if(app){await app.evaluate(({app})=>setTimeout(()=>app.exit(0),20)).catch(()=>{});await app.close().catch(()=>{});}
    await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
