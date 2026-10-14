import DOMPurify from 'dompurify';

const styles = {
 p:'margin:12px 0;min-height:1.4em;', h1:'font-size:30px;line-height:1.4;margin:28px 0 18px;',
 h2:'font-size:24px;line-height:1.4;margin:24px 0 14px;',h3:'font-size:20px;line-height:1.5;margin:20px 0 12px;',
 table:'border-collapse:collapse;table-layout:fixed;width:100%;margin:18px 0;',
 td:'border:1px solid #b9c7bb;padding:8px 12px;vertical-align:top;',th:'border:1px solid #b9c7bb;padding:8px 12px;background:#edf3e6;text-align:left;',
 img:'max-width:100%;height:auto;',blockquote:'border-left:3px solid #719847;padding:8px 20px;margin:20px 0;background:#edf3e6;color:#36512d;',
 pre:'white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f3f0;padding:16px;',code:'font-family:Consolas,monospace;',
 ul:'padding-left:28px;',ol:'padding-left:28px;',hr:'border:0;border-top:1px solid #bec8b9;margin:24px 0;'
};
export const exportCSS = `
*{box-sizing:border-box}body{margin:0;background:#f0f2ee;color:#26392c;font:16px/1.85 "Segoe UI","Microsoft YaHei",sans-serif}
article{max-width:900px;margin:32px auto;padding:48px 56px;background:white;overflow-wrap:anywhere}
p:empty:before{content:'\\00a0'}h1,h2,h3,h4,h5,h6{break-inside:avoid;break-after:avoid}img,tr,blockquote{break-inside:avoid}
thead{display:table-header-group}p{orphans:3;widows:3}li>h1,li>h2,li>h3{margin-top:8px}
@media(max-width:600px){article{margin:0;padding:24px}}
@page{size:A4;margin:22mm 18mm;@top-left{content:var(--export-title);font:9pt sans-serif;color:#677465}@bottom-center{content:counter(page) ' / ' counter(pages);font:9pt sans-serif;color:#677465}}
@media print{html,body{background:white!important}article{margin:0;padding:0;max-width:none;font-size:11pt!important}body{font-size:11pt}img{max-height:240mm;object-fit:contain}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
const escape = value => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chinese(n){if(n<1||n>9999)return String(n);const digits='零一二三四五六七八九',units=['','十','百','千'];let out='',zero=false;for(let i=3;i>=0;i--){const d=Math.floor(n/10**i)%10;if(d){if(zero)out+='零';out+=digits[d]+units[i];zero=false;}else if(out)zero=true;}return out.replace(/^一十/,'十');}
function alpha(n){let s='';while(n>0){n--;s=String.fromCharCode(97+n%26)+s;n=Math.floor(n/26);}return s;}
async function png(data){
 const img=new Image();img.src=data;await img.decode();
 if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>40000000)throw Error('图片尺寸过大，无法复制');
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/png');
}
export async function makeExport(editor,api,checked,clipboard=false){
 const root=document.createElement('article');
 root.innerHTML=DOMPurify.sanitize(editor.getHTML(),{ALLOWED_URI_REGEXP:/^(?:(?:https?|file|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,ADD_ATTR:['colwidth'],FORBID_TAGS:['script','style','iframe','object','embed','form'],FORBID_ATTR:['srcset']});
 for(const el of root.querySelectorAll('*')){
  const custom=el.getAttribute('style')||'';el.setAttribute('style',(styles[el.localName]||'')+custom);
  // No resource-loading CSS can escape the single-file export.
  for(const prop of [...el.style])if(/url\s*\(|var\s*\(/i.test(el.style.getPropertyValue(prop)))el.style.removeProperty(prop);
  if(el.localName==='a'){if(!/^(https?:|mailto:|tel:|#)/i.test(el.getAttribute('href')||''))el.removeAttribute('href');el.style.color=getComputedStyle(editor.view.dom).getPropertyValue('--document-link').trim()||'#2b8325';el.style.textDecoration='underline';}
 }
 // Explicit markers survive clipboard consumers that discard custom counters.
 for(const list of root.querySelectorAll('ol')){let n=Number(list.getAttribute('start'))||1;for(const item of list.children){if(item.tagName!=='LI')continue;const kind=list.dataset.numbering;const text=kind==='chinese'?chinese(n)+'、':kind==='chinese-paren'?'（'+chinese(n)+'）':kind==='paren'?'（'+n+'）':kind==='circle'&&n<=20?String.fromCodePoint(0x2460+n-1):kind==='alpha'?alpha(n)+'.':n+'.';const marker=document.createElement('span');marker.textContent=text+' ';item.style.listStyle='none';(item.querySelector('p,h1,h2,h3,h4,h5,h6')||item).prepend(marker);n++;}}
 for(const item of root.querySelectorAll('[data-type="taskItem"]')){const label=item.querySelector('label');if(label)label.textContent=item.dataset.checked==='true'?'☑ ':'☐ ';item.style.listStyle='none';}
 for(const cell of root.querySelectorAll('[colwidth]')){const widths=cell.getAttribute('colwidth').split(',').map(Number);if(widths.every(x=>x>0))cell.style.width=widths.reduce((a,b)=>a+b,0)+'px';}
 const images=[...root.querySelectorAll('img')],sources=[...new Set(images.map(img=>img.getAttribute('src')))];
 const embedded=await checked(api.exportImages(sources));
 for(const img of images){let data=embedded[sources.indexOf(img.getAttribute('src'))];if(clipboard&&data.startsWith('data:image/svg+xml'))data=await png(data);img.src=data;await img.decode();const width=Number(img.getAttribute('width'));if(width>0)img.style.width=width+'px';}
 const title=(document.getElementById('fileName').textContent||'未命名').replace(/\.(md|markdown)$/i,'');
 root.style.cssText='font:16px/1.85 "Segoe UI","Microsoft YaHei",sans-serif;color:#26392c;overflow-wrap:anywhere;';
 const body=root.outerHTML;
 const titleCSS=JSON.stringify(title).replace(/</g,'\\3c ');
 return {title,text:editor.getText(),fragment:body,html:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><title>'+escape(title)+'</title><style>'+exportCSS+'\n:root{--export-title:'+titleCSS+'}</style></head><body>'+body+'</body></html>'};
}

