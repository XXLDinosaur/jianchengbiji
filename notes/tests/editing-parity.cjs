const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'editor-parity-'));let app;
 try{
  const file=path.join(temp,'编辑一致性.md');await fs.copyFile(path.join(root,'assets/mountains.svg'),path.join(temp,'image.svg'));await fs.writeFile(file,'# 编辑一致性\n\nhttps://example.com/test\n\n普通文字\n\n## 列表标题\n\n<img src="image.svg" width="240">\n\n列表正文\n');
  const env={...process.env,MOYE_TEST_PROFILE:temp};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:process.env.EDITOR_TEST_EXECUTABLE||require('electron'),args:process.env.EDITOR_TEST_EXECUTABLE?[file]:[root,file],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('.tiptap h1');
  if(await page.locator('#guideClose').isVisible())await page.locator('#guideClose').click();
  await app.evaluate(({shell})=>{shell.openExternal=async url=>{global.openedLink=url;};});
  const url=page.locator('.tiptap p').filter({hasText:'https://example.com/test'});
  await url.click({position:{x:30,y:10},button:'right'});await page.getByRole('menuitem',{name:'取消跳转链接',exact:true}).click();
  assert.equal(await page.locator('.tiptap [data-no-jump]').textContent(),'https://example.com/test');
  await page.locator('.tiptap [data-no-jump]').dblclick();assert.equal(await app.evaluate(()=>global.openedLink),undefined);
  await page.locator('.tiptap [data-no-jump]').click({button:'right'});await page.getByRole('menuitem',{name:'恢复跳转链接',exact:true}).click();
  await page.locator('.tiptap a').dblclick();assert.equal(await app.evaluate(()=>global.openedLink),'https://example.com/test');
  // Both products offer external URL editing through the same keyboard command.
  await page.locator('.tiptap p').last().click();await page.keyboard.press('Control+k');assert.equal(await page.locator('#linkDialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');
  await page.locator('.tiptap').evaluate(el=>{const range=document.createRange();range.setStart(el.querySelector('h2'),0);range.setEnd(el.lastElementChild,el.lastElementChild.childNodes.length);el.focus();const sel=getSelection();sel.removeAllRanges();sel.addRange(range);});
  await page.locator('[data-command="bullet"]').click();
  assert.equal(await page.locator('.tiptap ul>li').count(),2,'Images must belong to previous list item, not have a bullet');
  assert.equal(await page.locator('.tiptap ul>li').first().locator('h2').textContent(),'列表标题');assert.equal(await page.locator('.tiptap ul>li').first().locator('.rich-image img').count(),1);
  await page.locator('.tiptap ul>li').last().locator('p').click({position:{x:8,y:10}});await page.locator('#brushBtn').click();await page.locator('.tiptap p').filter({hasText:'普通文字'}).click({position:{x:8,y:10}});await page.waitForFunction(()=>Array.from(document.querySelectorAll('.tiptap ul p')).some(p=>p.textContent==='普通文字'));assert.equal(await page.locator('.tiptap ul p').filter({hasText:'普通文字'}).count(),1,'Format painter applies list format to plain paragraph');
  await page.locator('#colorsBtn').click();await page.locator('#newScheme').click();const button=page.locator('#backgroundType + .glass-select-button');
  for(const label of ['纯色','渐变色','上传图片']){
   await button.scrollIntoViewIfNeeded();await button.click();const a=await button.boundingBox(),b=await page.locator('.glass-select-menu').boundingBox();assert.ok(Math.abs(a.x-b.x)<2);assert.equal(await page.locator('#colorsDialog').evaluate(e=>e.scrollLeft),0);
   await page.getByRole('option',{name:label,exact:true}).click();assert.equal(await page.locator('#gradientControls').evaluate(e=>e.hidden),label!=='渐变色');assert.equal(await page.locator('#imageControls').evaluate(e=>e.hidden),label!=='上传图片');
  }
  await button.click();await page.keyboard.press('Escape');assert.equal(await page.locator('#colorsDialog').evaluate(e=>e.open),true);await page.locator('#applyColors').click();await page.locator('#schemesDialog button.primary').click();
  const notes=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).name==='chengjian-notes';
  assert.equal(await page.locator('#vaultPanel').count(),notes?1:0);assert.equal(await page.locator('#documentTabs').count(),notes?1:0);
  console.log('PASS: URL disable/restore/open, external link shortcut, media lists, format painter, theme modes/popover and product boundary');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});




