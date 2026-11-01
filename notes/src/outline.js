import { headingLabel } from './number-label.js';
const $ = id => document.getElementById(id);
const panel = $('documentOutline'), list = $('outlineList'), scroll = $('documentScroll');
let headings = [], buttons = [], frame = 0, rebuild = false;
const collapsed = new WeakSet();
let rows = [], parents = [];
function applyCollapse(){
 for(let i=0;i<rows.length;i++){
  let parent=parents[i],hidden=false;
  while(parent>=0){if(collapsed.has(headings[parent]))hidden=true;parent=parents[parent];}
  rows[i].hidden=hidden;
  const arrow=rows[i].querySelector('.outline-toggle');
  if(arrow){const open=!collapsed.has(headings[i]);arrow.textContent=open?'▾':'▸';arrow.setAttribute('aria-expanded',String(open));arrow.title=open?'折叠下级标题':'展开下级标题';arrow.setAttribute('aria-label',arrow.title+'：'+headingLabel(headings[i]));}
 }
}
function toggle(show) {
  if(window.showSidebar)window.showSidebar(show?'navigation':'files');else panel.hidden = !show;
  $('outlineBtn').setAttribute('aria-expanded', String(show));
  $('outlineBtn').classList.toggle('active', show);
  localStorage.setItem('moye.outline.visible', String(show));
  schedule();
}
$('outlineBtn').onclick = () => toggle(panel.hidden);
$('closeOutline').onclick = () => { toggle(false); $('outlineBtn').focus(); };
function highlight() {
  if (panel.hidden || !headings.length) return;
  const top = scroll.getBoundingClientRect().top + 42;
  let index = 0;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].getBoundingClientRect().top <= top) index = i; else break;
  }
  while(rows[index]?.hidden && parents[index]>=0)index=parents[index];
  for (let i = 0; i < buttons.length; i++) {
    if (i === index) buttons[i].setAttribute('aria-current', 'location');
    else buttons[i].removeAttribute('aria-current');
  }
}
function update() {
  const next = [...$('editor').querySelectorAll('.tiptap h1,.tiptap h2,.tiptap h3,.tiptap h4,.tiptap h5,.tiptap h6')];
  const unchanged = next.length === headings.length && next.every((el, i) => el === headings[i] && headingLabel(el) === buttons[i]?.textContent);
  if (unchanged) return;
  headings = next; buttons = []; rows = []; parents = [];
  const fragment = document.createDocumentFragment();
  const base = Math.min(...headings.map(el => Number(el.tagName.slice(1))));
  const stack=[];
  for (const [index,heading] of headings.entries()) {
    const levelNow=Number(heading.tagName.slice(1));
    while(stack.length&&Number(headings[stack.at(-1)].tagName.slice(1))>=levelNow)stack.pop();
    parents[index]=stack.at(-1)??-1;stack.push(index);
    const row=document.createElement('div');row.className='outline-row';row.style.setProperty('--level',levelNow-base);
    const hasChildren=index+1<headings.length&&Number(headings[index+1].tagName.slice(1))>levelNow;
    if(hasChildren){const arrow=document.createElement('button');arrow.type='button';arrow.className='outline-toggle';arrow.onclick=()=>{if(collapsed.has(heading))collapsed.delete(heading);else collapsed.add(heading);applyCollapse();highlight();};row.append(arrow);}else{const spacer=document.createElement('span');spacer.className='outline-spacer';row.append(spacer);}
    const button = document.createElement('button'); button.type = 'button'; button.className = 'outline-item';
    const level = Number(heading.tagName.slice(1));
    button.style.setProperty('--level', level - base);
    button.textContent = headingLabel(heading);
    button.title = button.textContent; button.setAttribute('aria-label', `${level} 级标题：${button.textContent}`);
    button.onclick = () => {
      if (!heading.isConnected) return;
      // Screen coordinates include document zoom; only scroll the document pane.
      scroll.scrollTo({ top: scroll.scrollTop + heading.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24, behavior: 'instant' });
      highlight();
    };
    buttons.push(button); row.append(button);rows.push(row);fragment.append(row);
  }
  list.replaceChildren(fragment);applyCollapse();
  $('outlineCount').textContent = String(headings.length);
  $('outlineEmpty').hidden = headings.length > 0 || !$('searchPanel').hidden;
}
function schedule(changed = false) {
  rebuild ||= changed;
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; if (rebuild) { rebuild = false; update(); } highlight(); });
}
new MutationObserver(() => schedule(true)).observe($('editor'), { childList:true, subtree:true, characterData:true,attributes:true,attributeFilter:['data-numbering','start'] });
new ResizeObserver(() => schedule()).observe(scroll);
scroll.addEventListener('scroll', () => schedule(), { passive:true });
scroll.addEventListener('load', () => schedule(), true);

toggle(localStorage.getItem('moye.outline.visible') !== 'false');
// Initial empty state also needs a count when no headings have been added yet.
$('outlineCount').textContent = '0';
schedule(true);

function followCaret(){
 const selection=window.getSelection(),node=selection?.anchorNode;if(!node||!$('editor').contains(node))return;
 update();let index=-1;for(let i=0;i<headings.length;i++){if(headings[i].contains(node)||headings[i]===node||Boolean(headings[i].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING))index=i;}
 if(index<0)return;while(rows[index]?.hidden&&parents[index]>=0)index=parents[index];for(let i=0;i<buttons.length;i++){if(i===index)buttons[i].setAttribute('aria-current','location');else buttons[i].removeAttribute('aria-current');}
 if(!panel.hidden&&!list.hidden){const r=buttons[index].getBoundingClientRect(),b=list.getBoundingClientRect();if(r.top<b.top||r.bottom>b.bottom)buttons[index].scrollIntoView({block:'nearest'});}
}
document.addEventListener('editor-caret',()=>requestAnimationFrame(followCaret));
$('editor').addEventListener('click',()=>requestAnimationFrame(followCaret));
