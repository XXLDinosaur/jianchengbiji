const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {Open} = require('unzipper');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-word-'));
  const vault = path.join(temp, '论文'), profile = path.join(temp, 'profile');
  const methods = path.join(vault,'方法.md'), result = path.join(vault,'结果.md');
  const target = path.join(temp, '测试论文.docx');
  let app;
  try {
    await fs.mkdir(profile);
    await fs.mkdir(path.join(vault,'方法.assets'),{recursive:true});
    await fs.writeFile(path.join(profile,'vaults.json'), JSON.stringify({root:vault,recent:[vault]}));
    await fs.writeFile(path.join(vault,'方法.assets','sample.png'), await require('sharp')({create:{width:18,height:14,channels:3,background:'#52926b'}}).png().toBuffer());
    await fs.writeFile(methods,'# 研究方法\n\n正文含有**加粗**和[文献来源](https://example.org/paper#page=12)。\n\n![样本图](方法.assets/sample.png)\n\n图 1 样本图\n\n1. 采样\n2. 统计\n');
    await fs.writeFile(result,'# 实验结果\n\n| 项目 | 数值 |\n| --- | --- |\n| 样本 | 42 |\n');
    const env = {...process.env,MOYE_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    const exe = env.EDITOR_TEST_EXECUTABLE;
    app = await _electron.launch({executablePath:exe||require('electron'),args:exe?[]:[process.cwd()],env});
    await app.evaluate(({dialog},args)=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:args.files});
      dialog.showSaveDialog=async()=>({canceled:false,filePath:args.target});
    },{files:[result,methods],target});
    const page=await app.firstWindow();
    await page.locator('#fileMenuBtn').click();
    await page.locator('#chapterWordBtn').click();
    await page.getByRole('button',{name:'上移 方法.md',exact:true}).click();
    await page.getByRole('button',{name:'导出 Word',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#chapterWordDialog').open || !document.querySelector('#chapterWordDialog [role="alert"]').hidden);
    assert.ok(!await page.locator('#chapterWordDialog').isVisible(),await page.locator('#chapterWordDialog [role="alert"]').textContent());
    const zip=await Open.file(target);
    const part=async name=>(await zip.files.find(file=>file.path===name).buffer()).toString('utf8');
    const xml=await part('word/document.xml');
    assert.ok(xml.includes('实验结果') && xml.indexOf('研究方法')<xml.indexOf('实验结果'));
    for(const value of ['图 1 样本图','<w:tbl>','w:pStyle w:val="Heading1"','w:numPr','w:drawing','文献来源'])assert.ok(xml.includes(value),value);
    assert.ok(zip.files.map(file=>file.path).some(name=>/^word\/media\/.+\.png$/.test(name)));
    assert.ok((await part('word/_rels/document.xml.rels')).includes('Target="https://example.org/paper"'));
    assert.ok(xml.includes('w:anchor="page=12"'));
    if(env.JIANCHENG_VERIFY_DOCX)await fs.copyFile(target,env.JIANCHENG_VERIFY_DOCX,require('node:fs').constants.COPYFILE_EXCL);
    console.log('PASS ordered chapter export through File menu: editable headings, table, lists, embedded image, caption and source link');
  } finally {
    if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

