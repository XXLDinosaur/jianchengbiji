const fs=require('node:fs/promises');
const path=require('node:path');
const {localImagePath}=require('./resources.cjs');
const LIMIT=80*1024*1024;
async function embedImages(sources,documentPath){
 if(!Array.isArray(sources)||sources.length>500)throw Error('图片数量过多');
 let total=0;const output=[];
 for(const src of sources){
  if(typeof src!=='string')throw Error('无效图片');
  let bytes,mime;
  if(/^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif);base64,/i.test(src)){total+=src.length;if(total>LIMIT)throw Error('图片总大小超过 80 MB');output.push(src);continue;}
  if(/^https?:/i.test(src)){
   const response=await fetch(src,{signal:AbortSignal.timeout(15000),credentials:'omit'});if(!response.ok)throw Error('网络图片下载失败：'+response.status);
   mime=response.headers.get('content-type')?.split(';')[0];const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(total+size>LIMIT)throw Error('图片总大小超过 80 MB');chunks.push(chunk);}bytes=Buffer.concat(chunks);
  }else{const file=localImagePath(src,documentPath);if(!file)throw Error('无法定位图片');mime=({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.bmp':'image/bmp','.avif':'image/avif'})[path.extname(file).toLowerCase()];if(!mime)throw Error('不支持的图片格式');if((await fs.stat(file)).size+total>LIMIT)throw Error('图片总大小超过 80 MB');bytes=await fs.readFile(file);}
  if(!/^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif)$/.test(mime||''))throw Error('资源不是受支持的图片');
  total+=bytes.length;if(total>LIMIT)throw Error('图片总大小超过 80 MB');output.push('data:'+mime+';base64,'+bytes.toString('base64'));
 }return output;
}
function installExportHandlers({register,getWindow,getPath}){
 const {BrowserWindow,dialog,clipboard,app}=require('electron');
 register('export-images',sources=>embedImages(sources,getPath()));
 register('export-document',async data=>{
  if(!data||!['clipboard','html','pdf','print'].includes(data.kind)||typeof data.html!=='string'||data.html.length>LIMIT*2||typeof data.fragment!=='string'||typeof data.text!=='string')throw Error('无效导出内容');
  if(data.kind==='clipboard'){clipboard.write({html:data.fragment,text:data.text});return {success:true};}
  let target;
  if(data.kind!=='print'){const ext=data.kind==='pdf'?'pdf':'html';const result=await dialog.showSaveDialog(getWindow(),{title:ext==='pdf'?'导出 A4 PDF':'导出独立 HTML',defaultPath:path.join(getPath()?path.dirname(getPath()):app.getPath('documents'),path.basename(data.title||'未命名').replace(/[<>:"/\\|?*]/g,'_')+'.'+ext),filters:[{name:ext.toUpperCase(),extensions:[ext]}]});if(result.canceled)return {canceled:true};target=result.filePath;}
  if(data.kind==='html'){await fs.writeFile(target,data.html,'utf8');return {success:true};}
  const folder=await fs.mkdtemp(path.join(app.getPath('temp'),'chengjian-export-'));let preview;
  try{
   const file=path.join(folder,'document.html');await fs.writeFile(file,data.html,'utf8');
   preview=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'export-'+require('node:crypto').randomUUID()}});
   preview.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')&&details.url!==require('node:url').pathToFileURL(file).href}));
   preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));await preview.loadFile(file);
   await preview.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images,img=>img.decode())]).then(()=>true)');
   if(data.kind==='pdf'){const bytes=await preview.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:false});await fs.writeFile(target,bytes);return {success:true};}
   return await new Promise((resolve,reject)=>preview.webContents.print({silent:false,printBackground:true,pageSize:'A4'},(success,reason)=>{if(success)resolve({success:true});else if(/cancel/i.test(reason))resolve({canceled:true});else reject(Error(reason||'打印失败'));}));
  }finally{if(preview&&!preview.isDestroyed())preview.destroy();await fs.rm(folder,{recursive:true,force:true});}
 });
}
module.exports={embedImages,installExportHandlers};
