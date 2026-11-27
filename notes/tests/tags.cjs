const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'notes-tags-'));
  const vault = path.join(temp,'笔记');
  const profile = path.join(temp,'profile');
  let app;
  try {
    await fs.mkdir(path.join(vault,'专题'),{recursive:true});
    await fs.mkdir(profile);
    await fs.writeFile(path.join(profile,'vaults.json'),JSON.stringify({root:vault,recent:[vault]}));
    await fs.writeFile(path.join(vault,'笔记.md'),'# 第一篇\n\n#论文 #论文 `#代码`');
    await fs.writeFile(path.join(vault,'专题','笔记.md'),'# 第二篇\n\n#论文 #统计');
    await fs.writeFile(path.join(vault,'解码日志.txt'),'Input #0, mov\nStream #0:1: Audio');
    await fs.writeFile(path.join(vault,'资料索引.md'),[
      '案卷，#32–34 和 #52–58；see #860 and #12826.',
      'WebVTT thumbnail track (#xywh)。见 [#目录](#目录)。',
      '普通文字 \\#转义、颜色 color: #abc123、<code>#指令</code>。',
      '<div style="color: #ff8800"><pre>#示例</pre><strong>#论文</strong></div>',
      '正文 #3D建模。',
      '#2026 #研究',
    ].join('\n\n'));
    const env={...process.env,MOYE_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    const exe=process.env.EDITOR_TEST_EXECUTABLE;
    app=await _electron.launch({executablePath:exe||require('electron'),args:exe?[]:[process.cwd()],env});
    const page=await app.firstWindow();
    await app.evaluate(({BrowserWindow}) => {const win=BrowserWindow.getAllWindows()[0];win.setSize(...win.getMinimumSize());});
    const tagsTab = page.getByRole('tab',{name:'#标签',exact:true});
    await tagsTab.waitFor();
    assert.ok(await tagsTab.evaluate(el=>el.scrollWidth<=el.clientWidth),'#标签 should fit in the narrowest window');
    await tagsTab.click();
    const pane=page.locator('#tagPane');
    const articleTag=pane.getByRole('button',{name:'#论文（3）',exact:true});
    await articleTag.waitFor();
    const labels=async()=> (await pane.getByRole('button').allTextContents()).filter(label=>label.startsWith('#')).sort();
    assert.deepEqual(await labels(),['#2026（1）','#3d建模（1）','#研究（1）','#统计（1）','#论文（3）'].sort());
    await articleTag.click();
    await pane.getByRole('button',{name:'专题\\笔记.md',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.tiptap h1')?.textContent==='第二篇');
    await pane.getByRole('button',{name:'‹ 全部标签'}).click();
    assert.equal(await pane.getByText('#代码').count(),0);
    await page.locator('.tiptap').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText(' #新增');
    await pane.getByRole('button',{name:'#新增（1）',exact:true}).waitFor();
    console.log('PASS vault grouping, deduplication, code exclusion, open nested document, autosave refresh');
  } finally {
    if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});


