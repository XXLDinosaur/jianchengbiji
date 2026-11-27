// This module is bundled for Electron's main process; the editor stays offline.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table,
  TableRow, TableCell, ImageRun, WidthType, LevelFormat, AlignmentType, PageBreak } from 'docx';
import { marked } from 'marked';
import domino from '@mixmark-io/domino';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const blockNames = new Set(['P','DIV','SECTION','ARTICLE','FIGURE','FIGCAPTION','BLOCKQUOTE','PRE',
  'H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','HR']);
const omitted = new Set(['SCRIPT','STYLE','HEAD','IFRAME','OBJECT','EMBED','FORM']);
const children = node => Array.from(node.childNodes);
const elements = node => Array.from(node.children);
const emptyParagraph = () => new Paragraph({});

async function localTarget(context, href) {
  if (!href || href.startsWith('#')) return null;
  let file, fragment = '';
  if (/^file:/i.test(href)) {
    const url = new URL(href); fragment = url.hash; url.hash = ''; file = fileURLToPath(url);
  } else {
    const cut = href.indexOf('#');
    if (cut >= 0) { fragment = href.slice(cut); href = href.slice(0, cut); }
    if (href.startsWith('note:')) file = path.join(context.root, decodeURIComponent(href.slice(5)));
    else file = path.resolve(path.dirname(context.file), decodeURIComponent(href));
  }
  const relative = path.relative(context.root, file);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') return null;
  return {file: await context.vault.resolve(relative), fragment};
}

function relativeLink(target, output) {
  const value = path.relative(path.dirname(output), target.file);
  if (path.isAbsolute(value)) return pathToFileURL(target.file).href + target.fragment;
  return value.split(path.sep).map(encodeURIComponent).join('/') + target.fragment;
}

async function imageRun(node, ctx) {
  const src = node.getAttribute('src') || '';
  const label = node.getAttribute('alt') || '图片';
  if (/^https?:\/\//i.test(src)) {
    ctx.warnings.add('网络图片已保留为原图链接');
    return new ExternalHyperlink({link:src, children:[new TextRun({text:label, style:'Hyperlink'})]});
  }
  try {
    let bytes;
    if (/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(src)) bytes = Buffer.from(src.slice(src.indexOf(',')+1), 'base64');
    else {
      const target = await localTarget(ctx,src);
      if (!target || !/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(target.file)) throw Error();
      const info = await fs.stat(target.file);
      if (!info.isFile() || info.size > 24 * 1024 * 1024) throw Error();
      bytes = await fs.readFile(target.file);
    }
    const {nativeImage} = require('electron');
    const picture = nativeImage.createFromBuffer(bytes);
    if (picture.isEmpty()) throw Error();
    const {width,height} = picture.getSize();
    const requested = parseInt(node.getAttribute('width'),10) || width;
    const outWidth = Math.min(595, Math.max(1,requested), 810 * width / height);
    const data = picture.toPNG();
    ctx.media.bytes += data.length;
    if (ctx.media.bytes > 80 * 1024 * 1024) throw new RangeError('图片合计超过 80 MB，请分批导出');
    return new ImageRun({type:'png', data, transformation:{width:Math.round(outWidth),height:Math.max(1,Math.round(outWidth*height/width))}, altText:{title:label,description:label,name:label}});
  } catch (error) {
    if (error instanceof RangeError) throw error;
    ctx.warnings.add('部分图片无法嵌入，已在原位置保留说明');
    return new TextRun({text:'[图片：'+label+']',italics:true});
  }
}

async function inline(node, ctx, format={}) {
  if (node.nodeType === 3) return [new TextRun({...format,text:node.data})];
  if (node.nodeType !== 1 || omitted.has(node.tagName)) return [];
  const tag=node.tagName;
  if (tag==='BR') return [new TextRun({break:1})];
  if (tag==='IMG') return [await imageRun(node,ctx)];
  if (tag==='INPUT') return node.getAttribute('type')==='checkbox' ? [new TextRun(node.hasAttribute('checked')?'☑ ':'☐ ')] : [];
  if (tag==='A') {
    const href=node.getAttribute('href') || '';
    let link=/^(https?:\/\/|mailto:|zotero:\/\/(?:open-pdf|select)\/)/i.test(href)?href:null;
    if (!link && href && (!/^[a-z][\w+.-]*:/i.test(href) || /^(note|file):/i.test(href))) {
      try { const target=await localTarget(ctx,href); if(target)link=relativeLink(target,ctx.output); } catch {}
    }
    const runs=await inlineChildren(node,ctx,link?{...format,style:'Hyperlink'}:format);
    return link?[new ExternalHyperlink({link,children:runs})]:runs;
  }
  const styles={STRONG:{bold:true},B:{bold:true},EM:{italics:true},I:{italics:true},U:{underline:{}},
    DEL:{strike:true},S:{strike:true},CODE:{font:'Consolas'},SUP:{superScript:true},SUB:{subScript:true},MARK:{highlight:'yellow'}};
  return inlineChildren(node,ctx,{...format,...styles[tag]});
}
async function inlineChildren(node,ctx,format){
  const runs=[];for(const child of children(node))runs.push(...await inline(child,ctx,format));return runs;
}

async function bodyBlocks(parent,ctx,listLevel=0,firstOptions=null) {
  const blocks=[]; let pending=[];
  function paragraph(options={}) { const p=new Paragraph({...firstOptions,...options});firstOptions=null;return p; }
  function flush(){if (pending.length){blocks.push(paragraph({children:pending}));pending=[];}}
  for (const node of children(parent)) {
    if (node.nodeType===3 && !node.data.trim()&&!pending.length)continue;
    if (node.nodeType!==1 || !blockNames.has(node.tagName)){
      pending.push(...await inline(node,ctx));continue;
    }
    flush();
    const tag=node.tagName;
    if (tag==='TABLE'){
      const rows=[];
      for (const tr of Array.from(node.querySelectorAll('tr')).filter(row=>row.closest('table')===node)) {
        const cells=[];
        for (const cell of elements(tr).filter(n=>['TD','TH'].includes(n.tagName))){
          const inner=await bodyBlocks(cell,ctx);
          if(!inner.length || inner[inner.length-1] instanceof Table)inner.push(emptyParagraph());
          cells.push(new TableCell({children:inner,columnSpan:Math.min(50,Math.max(1,Number(cell.getAttribute('colspan'))||1))}));
        }
        if(cells.length)rows.push(new TableRow({children:cells}));
      }
      if(rows.length)blocks.push(new Table({rows,width:{size:100,type:WidthType.PERCENTAGE}}));
    } else if(tag==='OL'||tag==='UL'){
      const instance=++ctx.media.list;
      for(const li of elements(node).filter(n=>n.tagName==='LI')){
        const level=Math.min(listLevel,8);
        const list=tag==='UL'?{bullet:{level}}:{numbering:{reference:'chapter-number',level,instance}};
        blocks.push(...await bodyBlocks(li,ctx,listLevel+1,list));
      }
    } else if (/^H[1-6]$/.test(tag)){
      blocks.push(paragraph({heading:headingLevels[Number(tag[1])-1],children:await inlineChildren(node,ctx)}));
    } else if(tag==='P'||tag==='FIGCAPTION'){
      blocks.push(paragraph({children:await inlineChildren(node,ctx)}));
    } else if(tag==='PRE'){
      const lines=node.textContent.replace(/\n$/,'').split('\n');
      for(const line of lines)blocks.push(new Paragraph({children:[new TextRun({font:'Consolas',text:line})]}));
    } else if(tag==='HR') blocks.push(emptyParagraph());
    else blocks.push(...await bodyBlocks(node,ctx,listLevel));
  }
  flush();return blocks;
}

export async function makeChapterWord({vault,chapters,output,readDocument}) {
  const root=vault.root, warnings=new Set(), media={bytes:0,list:0}, sections=[];
  let textBytes=0;
  for(const relative of chapters){
    if(vault.root!==root)throw Error('仓库已切换，请重新导出');
    const file=await vault.resolve(relative);
    if(!/\.(md|markdown|mdown|txt)$/i.test(file))throw Error('只能导出仓库内的笔记');
    const doc=await readDocument(file);
    textBytes+=Buffer.byteLength(doc.text);
    if(textBytes>32*1024*1024)throw Error('章节内容超过 32 MB，请分批导出');
    const body=domino.createDocument(marked.parse(doc.text)).body;
    if(sections.length)sections.push(new Paragraph({children:[new PageBreak()]}));
    if(!/^H[1-6]$/.test(body.firstElementChild?.tagName||''))sections.push(new Paragraph({heading:HeadingLevel.HEADING_1,text:path.parse(file).name}));
    sections.push(...await bodyBlocks(body,{root,vault,file,output,warnings,media}));
  }
  const levels=Array.from({length:9},(_,level)=>({level,format:LevelFormat.DECIMAL,text:'%'+(level+1)+'.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}));
  const doc=new Document({creator:'简成笔记',numbering:{config:[{reference:'chapter-number',levels}]},sections:[{children:sections}]});
  return {bytes:await Packer.toBuffer(doc),warnings:[...warnings]};
}
