export function installFileMenu(){
 const $=id=>document.getElementById(id);
 if($('fileMenu')?.dataset.ready)return $('fileMenu').fileMenuController;
 let button=$('fileMenuBtn'),menu=$('fileMenu');
 if(!button){button=document.createElement('button');button.id='fileMenuBtn';button.textContent='文件';$('floatBtn').before(button);}
 button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
 if(!menu){menu=document.createElement('div');menu.id='fileMenu';document.body.append(menu);}
 menu.dataset.ready='true';menu.className='glass-context-menu file-actions';menu.setAttribute('role','menu');menu.hidden=true;
 for(const [id,label,key] of [['newBtn','新建文档','Ctrl+N'],['openBtn','打开文档','Ctrl+O'],['saveBtn','保存','Ctrl+S'],['saveAsBtn','另存为','Ctrl+Shift+S'],['printBtn','打印','Ctrl+P'],['helpBtn','帮助','F1']]){
 const b=$(id);b.classList.remove('primary');b.setAttribute('role','menuitem');b.innerHTML=label+'<kbd>'+key+'</kbd>';menu.append(b);
 }
 if(!$('vaultPanel'))menu.append($('autoSave').closest('label'));
 const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
 button.onclick=()=>{const show=menu.hidden;close();if(show){menu.hidden=false;const r=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=r.bottom+5+'px';button.setAttribute('aria-expanded','true');}};
 menu.addEventListener('click',e=>{if(e.target.closest('button'))close();});document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!button.contains(e.target))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});window.addEventListener('resize',close);
 return menu.fileMenuController={menu,button,close};
}
