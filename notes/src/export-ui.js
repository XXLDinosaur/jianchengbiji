import {installFileMenu} from './file-menu.js';
import {makeExport} from './export-content.js';
export function installExports({getEditor,api,checked,toast,locked}){
 const {menu,close}=installFileMenu();
 let busy=false;
 const run=async kind=>{if(busy)return;busy=true;try{toast('正在整理文档和图片…');const data=await makeExport(getEditor(),api,checked,kind==='clipboard');const result=await checked(api.exportDocument({kind,...data}));toast(result?.canceled?'已取消':kind==='clipboard'?'已复制富文本，可粘贴到目标编辑器':kind==='print'?'已发送打印任务':'导出完成');}catch(e){toast('导出失败：'+e.message);}finally{busy=false;}};
 const start=kind=>{close();if(document.body.classList.contains('workspace-empty'))return toast('请先打开或新建文档');return locked(()=>run(kind));};
 for(const [id,label,kind] of [['copyRichBtn','复制为富文本','clipboard'],['exportPdfBtn','导出 A4 PDF…','pdf'],['exportHtmlBtn','导出独立 HTML…','html']]){const b=document.createElement('button');b.id=id;b.type='button';b.setAttribute('role','menuitem');b.textContent=label;b.onclick=()=>start(kind);menu.insertBefore(b,document.getElementById('helpBtn'));}
 document.getElementById('printBtn').onclick=()=>start('print');
}


