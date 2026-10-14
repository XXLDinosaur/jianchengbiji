export function mountGuide({name,notes=false,pages}){
 const key=notes?'jiancheng.home.seen.v1':'chengjian.home.seen.v1';
 const button=document.getElementById('helpBtn'),dialog=document.createElement('section');
 dialog.id=notes?'usageGuide':'helpDialog';dialog.className='welcome-guide welcome-home';dialog.setAttribute('aria-labelledby','welcomeTitle');
 const chapters=[['欢迎',`<div class="welcome-intro"><span class="welcome-kicker">${notes?'你的本地文档空间':'从一份文档，开始记录'}</span><h2>${notes?'写下来，也整理好。':'让注意力，回到文字。'}</h2><p>${notes?'用仓库、文件夹和标签页管理内容，保留简单直接的编辑体验。':'像编辑普通文档一样写 Markdown，直接排版、插入图片与表格。'}</p></div><div class="welcome-cards"><article><span>01</span><h3>${notes?'建立自己的仓库':'打开就能写'}</h3><p>${notes?'左下角进入管理仓库，新建或打开本地文件夹。':'通过「文件」新建或打开文档，点击正文开始输入。'}</p></article><article><span>02</span><h3>图文一起表达</h3><p>标题、编号、格式刷、图片和表格，都在上方工具栏。</p></article><article><span>03</span><h3>${notes?'让记录有条理':'保存与分享'}</h3><p>${notes?'在文件侧栏整理资料，标签页切换文档，导航快速定位章节。':'保存为 Markdown，或导出 PDF、独立 HTML，复制富文本。'}</p></article></div><p class="welcome-tip">这是软件内置说明，可离线查看。新建或打开文档即可开始；按 F1 随时回到使用首页。</p>`],...pages];
 dialog.innerHTML=`<div class="welcome-header"><div><img src="../assets/app-icon.svg" alt=""><div><h1 id="welcomeTitle">欢迎使用${name}</h1><span>功能介绍与使用指南</span></div></div><button id="guideClose" aria-label="返回文档" title="返回文档（Esc）">×</button></div><div class="welcome-body"><nav aria-label="操作说明章节"></nav><section id="guideContent" tabindex="0" aria-live="polite"></section></div><div class="welcome-footer"><span>${notes?'「文件 → 帮助」':'「文件 → 帮助」'} · F1 随时查看</span><div><button id="guideNext">下一步 →</button><button id="guideNew">新建文档</button><button id="guideOpen">打开文档</button><button id="guideDone" class="primary">返回文档</button></div></div>`;
 document.getElementById('documentScroll').prepend(dialog);dialog.hidden=true;dialog.open=false;const nav=dialog.querySelector('nav'),content=dialog.querySelector('section');let current=0;
 function show(index){current=index;content.innerHTML=chapters[index][1];content.scrollTop=0;[...nav.children].forEach((b,i)=>{b.setAttribute('aria-current',i===index?'page':'false');});dialog.querySelector('#guideNext').hidden=index===chapters.length-1;}
 chapters.forEach(([label],i)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>show(i);nav.append(b);});
 const close=()=>{dialog.hidden=true;dialog.open=false;dialog.open=false;dialog.removeAttribute('open');document.body.classList.remove('welcome-home-visible');try{localStorage.setItem(key,'1');}catch{}};
 const open=()=>{if(document.querySelector('dialog[open]'))return;show(0);dialog.hidden=false;dialog.open=true;dialog.setAttribute('open','');document.body.classList.add('welcome-home-visible');document.getElementById('documentScroll').scrollTop=0;};
 dialog.close=close;
 button.onclick=open;dialog.querySelector('#guideNext').onclick=()=>show(current+1);
 for(const id of ['guideClose','guideDone'])dialog.querySelector('#'+id).onclick=()=>dialog.close();
 for(const [id,target] of [['guideNew','newBtn'],['guideOpen','openBtn']])dialog.querySelector('#'+id).onclick=()=>{close();document.getElementById(target).click();};
 document.addEventListener('click',e=>{if(!dialog.hidden&&e.target.closest('#documentTabs .document-tab,#vaultTree .vault-row,#newBtn,#openBtn,#floatNewDocument,#floatOpenDocument'))close();},true);
 document.addEventListener('keydown',e=>{if(e.key==='F1'){e.preventDefault();open();}else if(e.key==='Escape'&&!dialog.hidden&&!document.querySelector('dialog[open]')){e.preventDefault();close();}else if((e.ctrlKey||e.metaKey)&&['n','o'].includes(e.key.toLowerCase()))close();});
 let seen=false;try{seen=!!localStorage.getItem(key);}catch{}if(!seen||document.body.classList.contains('workspace-empty'))open();
}



