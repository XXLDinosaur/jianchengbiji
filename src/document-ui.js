import {installFileMenu} from './file-menu.js';
import { installHelp } from './usage-guide.js';
import {linkAtEvent} from './link-target.js';
import { Mark } from '@tiptap/core';
import { installGlassSelects } from './glass-selects.js';
import './ui-icons.js';
import { installExports } from './export-ui.js';
export const NoJump=Mark.create({name:'noJump',inclusive:false,addAttributes(){return {href:{default:null,parseHTML:el=>el.getAttribute('data-disabled-href'),renderHTML:attrs=>attrs.href?{'data-disabled-href':attrs.href}:{}}};},parseHTML(){return [{tag:'span[data-no-jump]'}];},renderHTML({HTMLAttributes}){return ['span',{...HTMLAttributes,'data-no-jump':'true'},0];}});
export function installDocumentUI({getEditor,api,checked,locked,toast}){
 const $=id=>document.getElementById(id);
 for(const [id,action] of [['windowMinimize','minimize'],['windowMaximize','maximize'],['windowClose','close']])$(id).onclick=()=>checked(api.windowControl(action)).catch(e=>toast(e.message));
 // Keep the single-document commands in one menu. Moving the actual buttons
 // preserves the same shortcuts, disabled state and unsaved-change handling.
 const {button:fileButton,close:closeFile}=installFileMenu();
 // Native clipboard operations remain in the main process; menu clicks restore
 // the ProseMirror selection so toolbar focus cannot change their target.
 const menu=document.createElement('div');menu.className='glass-context-menu';menu.id='documentContextMenu';menu.hidden=true;menu.setAttribute('role','menu');document.body.append(menu);
 let selection=null;
 const restore=()=>{const e=getEditor();if(e&&selection)e.chain().focus().setTextSelection(selection).run();return e;};
 const entry=(label,fn,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.setAttribute('role','menuitem');b.onmousedown=e=>e.preventDefault();b.onclick=()=>{menu.hidden=true;Promise.resolve(fn()).catch(e=>toast(e.message));};menu.append(b);};
 const targetLink=event=>linkAtEvent(getEditor(),event);
 $('editor').addEventListener('contextmenu',event=>{
  if(!event.target.closest('.tiptap')||!getEditor()?.isEditable)return;
  event.preventDefault();const editor=getEditor(),target=targetLink(event);selection={from:editor.state.selection.from,to:editor.state.selection.to};
  if(selection.from===selection.to){const hit=editor.view.posAtCoords({left:event.clientX,top:event.clientY});if(hit)selection={from:hit.pos,to:hit.pos};}
  menu.replaceChildren();for(const [label,command] of [['复制','copy'],['剪切','cut'],['粘贴','paste']])entry(label,()=>{restore();return checked(api.editCommand(command));},command!=='paste'&&selection.from===selection.to);
  entry('链接…',()=>{restore();$('linkBtn').click();});
  if(target&&/^https?:\/\//i.test(target.href||''))entry(target.disabled?'恢复跳转链接':'取消跳转链接',()=>{const chain=editor.chain().focus().setTextSelection({from:target.from,to:target.to});if(target.disabled)chain.unsetMark('noJump').setLink({href:target.href}).run();else chain.unsetLink().setMark('noJump',{href:target.href}).run();});
  menu.hidden=false;menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';
 });
 $('editor').addEventListener('dblclick',event=>{const target=targetLink(event);if(target&&!target.disabled&&/^https?:\/\//i.test(target.href||'')){event.preventDefault();checked(api.externalLink(target.href)).catch(e=>toast(e.message));}},true);
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.hidden=true;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFile();menu.hidden=true;}});
 const heading=document.querySelector('.file-heading');
 const fitTitle=()=>{const center=innerWidth/2,left=appMotto.getBoundingClientRect().right,right=fileButton.getBoundingClientRect().left;heading.style.maxWidth=Math.max(0,2*Math.min(center-left,right-center)-24)+'px';};
 new ResizeObserver(fitTitle).observe(document.querySelector('.topbar'));
 installHelp();
 installGlassSelects();
 installExports({getEditor,api,checked,toast,locked});
}







