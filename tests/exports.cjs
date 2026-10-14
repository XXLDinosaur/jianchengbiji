const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'chengjian-export-test-'));let app;
 try{
  await fs.copyFile(path.join(root,'assets/mountains.svg'),path.join(temp,'image.svg'));
  const file=path.join(temp,'导出测试.md');
  await fs.writeFile(file,'# 导出测试\n\n**加粗** 与 [链接](https://example.com)\n\n<img src="image.svg" width="300">\n\n<table><tbody><tr><th colspan="2">合并标题</th></tr><tr><td>左栏</td><td>右栏</td></tr></tbody></table>\n\n'+Array.from({length:40},(_,i)=>'## 小节 '+(i+1)+'\n\n这是分页测试。保留清晰的正文、标题与足够的页边距。\n\n').join(''));
  const env={...process.env,MOYE_TEST_PROFILE:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:process.env.EDITOR_TEST_EXECUTABLE||require('electron'),args:process.env.EDITOR_TEST_EXECUTABLE?[file]:[root,file],env});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('.tiptap h1',{state:'attached'});await page.locator('#guideClose').click();
  // Intercept writes to avoid replacing the user's clipboard during automation.
  await app.evaluate(({clipboard})=>{clipboard.write=data=>{global.exportClipboard=data;};});
  const click=async id=>{await page.locator('#fileMenuBtn').click();await page.locator(id).click();};
  await click('#copyRichBtn');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('已复制富文本'));
  const copied=await app.evaluate(()=>global.exportClipboard);assert.match(copied.html,/data:image\/png;base64,/);assert.match(copied.html,/width: 300px/);assert.match(copied.html,/colspan="2"/);assert.match(copied.text,/导出测试/);assert.ok(!copied.html.includes('file:'));
  const target=path.join(root,'test-results/export-test.html');await fs.mkdir(path.dirname(target),{recursive:true});
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},target);
  await click('#exportHtmlBtn');await page.waitForFunction(()=>document.getElementById('toast').textContent==='导出完成');const html=await fs.readFile(target,'utf8');assert.match(html,/data:image\/svg\+xml;base64,/);assert.ok(!html.includes('src="image.svg"'));
  const pdf=path.join(root,'test-results/export-test.pdf');await app.evaluate(({dialog},pdf)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:pdf});},pdf);
  await click('#exportPdfBtn');await page.waitForFunction(()=>document.getElementById('toast').textContent==='导出完成');assert.equal((await fs.readFile(pdf)).subarray(0,4).toString(),'%PDF');
  await app.evaluate(({app})=>{app.on('web-contents-created',(_event,contents)=>{contents.print=(options,callback)=>{global.printOptions=options;callback(true);};});});
  await page.keyboard.press('Control+p');await page.waitForFunction(()=>document.getElementById('toast').textContent==='已发送打印任务');assert.equal((await app.evaluate(()=>global.printOptions)).pageSize,'A4');
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await click('#exportHtmlBtn');await page.waitForFunction(()=>document.getElementById('toast').textContent==='已取消');
  // Export is independent of source images and network after it has been saved.
  await fs.unlink(path.join(temp,'image.svg'));assert.equal(await app.evaluate(async ({BrowserWindow},target)=>{const preview=new BrowserWindow({show:false,webPreferences:{sandbox:true}});try{await preview.loadFile(target);return await preview.webContents.executeJavaScript('Promise.all(Array.from(document.images,i=>i.decode())).then(()=>document.images[0].naturalWidth>0)');}finally{preview.destroy();}},target),true);
  await click('#copyRichBtn');await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('导出失败'));assert.deepEqual(await app.evaluate(()=>global.exportClipboard),copied,'Failure must leave clipboard intact');
  console.log('PASS: rich HTML/PNG clipboard, merged table, widths, offline HTML, A4 PDF, cancellation and missing-image failure');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});




