import sources from './research-source.cjs';

const { sourceHref, localPdf, zoteroSource, parseAnnotation, fromCitation, unquote } = sources;
const fieldNames = { title:'文献题名', author:'作者', year:'年份', venue:'期刊 / 出版信息', page:'引用页码', source:'来源链接',
  question:'研究问题', quote:'原文', interpretation:'我的理解' };

function literal(value) {
  return String(value || '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\*_\x60[\]#!|~])/g, '\\$1').replace(/\r?\n/g, ' ');
}

export function readingMarkdown(data) {
  const href = sourceHref(data.source || '');
  const lines = ['# ' + literal(data.title), '## 文献信息', ...['author','year','venue'].map(key => fieldNames[key] + '：' + literal(data[key])),
    '来源：' + (href ? '[查看来源](' + href + ')' : ''), '## 研究问题', literal(data.question) || '<p></p>', '## 研究方法', '<p></p>',
    '## 主要发现', '<p></p>', '## 证据与局限', '<p></p>', '## 原文摘录', '<p></p>', '## 与我的研究的关系', '<p></p>'];
  return lines.filter(Boolean).join('\n\n') + '\n';
}

const textNode = (text, marks) => ({type:'text', text, ...(marks ? {marks} : {})});
const paragraph = (text = '') => ({type:'paragraph', content:text ? [textNode(text)] : []});
const heading = (text, level) => ({type:'heading', attrs:{level}, content:[textNode(text)]});
const bold = text => textNode(text, [{type:'bold'}]);
const labelParagraph = (label, value) => ({type:'paragraph', content:[bold(label + '：'), ...(value ? [textNode(value)] : [])]});

function paragraphs(value) {
  return value.trim().split(/\r?\n/).map(line => paragraph(line));
}

function excerptBlocks(data, href) {
  const blocks = [heading('原文摘录' + (data.page ? ' · ' + data.page + ' 页' : ''), 3),
    {type:'blockquote', content:paragraphs(data.quote)}, labelParagraph('我的理解', '')];
  if (data.interpretation) blocks.push(...paragraphs(data.interpretation));
  const metadata = ['title','author','year','page'].filter(key => data[key]).map(key => fieldNames[key] + '：' + data[key]);
  const content = [bold('出处：')];
  if (metadata.length) content.push(textNode(metadata.join('　')));
  if (href) {
    if (metadata.length) content.push(textNode('　'));
    const caption = href.startsWith('zotero:') ? '在 Zotero 中查看' : '查看原文';
    content.push(textNode(caption,[{type:'link',attrs:{href}}]));
  }
  blocks.push({type:'paragraph',content});
  return blocks;
}

function comparisonBlocks(question) {
  const columns = ['文献', '对研究问题的回答', '证据与方法', '局限与分歧', '出处与页码'];
  const row = header => ({type:'tableRow', content:columns.map(label => ({
    type:header ? 'tableHeader' : 'tableCell', content:[paragraph(header ? label : '')]
  }))});
  return [heading('文献对照 · ' + question, 2), {type:'table', content:[row(true),row(false),row(false)]}, paragraph()];
}

function readingContext(editor) {
  const nodes = [];
  editor.state.doc.forEach((node,pos) => nodes.push({node,pos}));
  const info = nodes.findIndex(({node}) => node.type.name === 'heading' && node.attrs.level === 2 && node.textContent === '文献信息');
  if (info < 0) return {};
  const title = nodes.find(({node}) => node.type.name === 'heading' && node.attrs.level === 1);
  const data = {title:title?.node.textContent || ''};
  for (const {node} of nodes.slice(info + 1)) {
    if (node.type.name === 'heading') break;
    for (const key of ['author','year','venue']) {
      const prefix = fieldNames[key] + '：';
      if (node.textContent.startsWith(prefix)) data[key] = node.textContent.slice(prefix.length).trim();
    }
    if (node.textContent.startsWith('来源：')) {
      node.descendants(child => {const link = child.marks.find(mark => mark.type.name === 'link'); if (link) data.source = link.attrs.href;});
    }
  }
  const section = nodes.findIndex(({node}) => node.type.name === 'heading' && node.attrs.level === 2 && node.textContent === '原文摘录');
  if (section >= 0) data.end = nodes.slice(section+1).find(({node}) => node.type.name === 'heading' && node.attrs.level <= 2)?.pos ?? editor.state.doc.content.size;
  return data;
}

// Material copied as rich text can omit the visible app links and keep only
// Zotero's encoded data-annotation / data-citation attributes.
function richAnnotation(html) {
  if (!/data-annotation|zotero:\/\/open-pdf/i.test(html)) return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const highlights = [...root.querySelectorAll('[data-annotation]')];
  if (highlights.length > 1) return null;
  const mark = highlights[0];
  function attribute(el, name) {
    const value = el?.getAttribute(name);
    if (!value) return {};
    try { return JSON.parse(value.startsWith('{') ? value : decodeURIComponent(value)) || {}; } catch { return {}; }
  }
  const annotation = attribute(mark, 'data-annotation');
  const links = [...root.querySelectorAll('a[href]')];
  const pdfLinks = links.filter(a => zoteroSource(a.getAttribute('href'))?.startsWith('zotero://open-pdf/'));
  if (pdfLinks.length > 1) return null;
  let source = pdfLinks[0]?.getAttribute('href');
  if (!source && mark) {
    const uri = annotation.attachmentURI || annotation.uri || '';
    const match = /^https?:\/\/(?:www\.)?zotero\.org\/(users\/(?:local\/[\w-]+|\d+)|groups\/\d+)\/items\/([A-Z0-9]{8})$/.exec(uri);
    if (match) {
      const library = match[1].startsWith('groups/') ? match[1] : 'library';
      const params = new URLSearchParams();
      if (Number.isSafeInteger(annotation.position?.pageIndex) && annotation.position.pageIndex >= 0) params.set('page', annotation.position.pageIndex + 1);
      if (annotation.annotationKey) params.set('annotation', annotation.annotationKey);
      source = zoteroSource('zotero://open-pdf/' + library + '/items/' + match[2] + (params.size ? '?' + params : ''));
    }
  }
  if (!source) return null;
  const citation = root.querySelector('[data-citation],.citation') || links.find(a => a.getAttribute('href').startsWith('zotero://select/'));
  const metadata = fromCitation(citation?.textContent || '');
  const item = attribute(citation, 'data-citation').citationItems?.[0];
  metadata.page ||= item?.locator || annotation.pageLabel || new URL(source).searchParams.get('page') || '';
  const clone = root.cloneNode(true);
  for (const node of clone.querySelectorAll('[data-annotation],[data-citation],.citation,a[href^="zotero:"]')) node.remove();
  const rest = clone.textContent.trim().replace(/^[\s()（）]+|[\s()（）]+$/g,'').trim();
  return {source, ...metadata, quote:unquote(mark?.textContent || rest), interpretation:mark ? rest : ''};
}

function clipboardAnnotation(transfer) {
  const plain = transfer?.getData('text/markdown') || transfer?.getData('text/plain') || '';
  const html = transfer?.getData('text/html') || '';
  const parsed = parseAnnotation(plain);
  const rich = richAnnotation(html);
  if (!parsed) return rich;
  if (rich && parsed.source === rich.source) {
    for (const key of ['quote','author','year','page','interpretation']) parsed[key] ||= rich[key];
  }
  return parsed;
}

function suggestedFile(title) {
  let base = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim().replace(/[. ]+$/g, '').slice(0,110).trim();
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = '文献 ' + base;
  return (base || '文献阅读笔记') + '.md';
}

export function installResearch({getEditor, getPath, call, createNote, toast}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'researchDialog';
  dialog.className = 'small-dialog research-dialog';
  dialog.setAttribute('aria-labelledby', 'researchDialogTitle');
  const form = document.createElement('form');
  const title = document.createElement('h2');
  title.id = 'researchDialogTitle';
  const fields = document.createElement('div');
  fields.className = 'research-fields';
  const error = document.createElement('p');
  error.className = 'research-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = '取消'; cancel.onclick = () => dialog.close();
  const submit = document.createElement('button');
  submit.type = 'submit'; submit.className = 'primary';
  actions.append(cancel, submit); form.append(title, fields, error, actions); dialog.append(form);
  document.body.append(dialog);

  function showForm(caption, button, descriptors, initial, commit, {pickPdf = false} = {}) {
    if (dialog.open) return;
    title.textContent = caption; submit.textContent = button; error.textContent = '';
    submit.disabled = false; fields.replaceChildren();
    const controls = {};
    for (const [key, opts = {}] of descriptors) {
      const label = document.createElement('label');
      label.className = opts.half ? 'research-half' : '';
      const control = document.createElement(opts.rows ? 'textarea' : 'input');
      control.id = 'research-' + key; control.name = key; control.autocomplete = 'off';
      control.value = initial[key] || ''; control.required = Boolean(opts.required);
      control.placeholder = opts.placeholder || ''; if (opts.rows) control.rows = opts.rows;
      label.append(fieldNames[key], control); fields.append(label); controls[key] = control;
      if (key === 'source' && pickPdf) {
        const picker = document.createElement('button');
        picker.className = 'research-pick'; picker.type = 'button'; picker.textContent = '选择仓库内的 PDF…';
        picker.onclick = async () => {
          try {
            const selected = await call('research-pdf-pick');
            if (selected) { control.value = selected; error.textContent = ''; }
          } catch (err) { error.textContent = err.message; }
        };
        fields.append(picker);
      }
      if (key === 'quote') control.addEventListener('paste', event => {
        const data = clipboardAnnotation(event.clipboardData);
        if (!data) return;
        event.preventDefault();
        if (controls.source?.value !== data.source) {
          for (const key of ['title','author','year','page']) if (controls[key]) controls[key].value = '';
        }
        for (const [name,value] of Object.entries(data)) if (value && controls[name]) controls[name].value = value;
      });
    }
    let pending = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (pending) return;
      const data = Object.fromEntries(Object.entries(controls).map(([key,input]) => [key,input.value.trim()]));
      for (const [key, control] of Object.entries(controls)) {
        if (control.required && !data[key]) { error.textContent = '请填写' + fieldNames[key]; control.focus(); return; }
      }
      pending = true; submit.disabled = true; cancel.disabled = true; error.textContent = '';
      try { await commit(data); dialog.close(); }
      catch (err) { error.textContent = err.message || '操作未完成'; }
      finally { pending = false; submit.disabled = false; cancel.disabled = false; }
    };
    dialog.oncancel = event => { if (pending) event.preventDefault(); };
    dialog.showModal();
    controls[descriptors[0][0]].focus();
  }

  function newReading() {
    showForm('新建文献阅读笔记', '创建笔记', [
      ['title',{required:true}], ['author',{half:true}], ['year',{half:true}], ['venue'],
      ['source',{placeholder:'HTTPS 网址、DOI 或 Zotero 文献链接'}], ['question',{rows:2}]
    ], {}, async data => {
      const result = await createNote(suggestedFile(data.title), readingMarkdown(data));
      if (!result) throw Error('未能打开新笔记，请检查文件列表后重试');
    });
  }

  function activeEditor() {
    const editor = getEditor();
    if (!editor?.isEditable || document.body.classList.contains('workspace-empty')) {
      toast('请先打开或新建一篇笔记'); return null;
    }
    return editor;
  }

  function insert(editor, position, blocks) {
    if (getEditor() !== editor || editor.isDestroyed) throw Error('当前笔记已切换，请重新插入');
    if (!editor.chain().focus().insertContentAt(position,blocks).run()) throw Error('无法在此处插入，请将光标移至正文');
  }

  function addExcerpt(annotation) {
    const editor = activeEditor(); if (!editor) return;
    const context = readingContext(editor);
    const {from,to} = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from,to,'\n');
    const position = context.end ?? editor.state.selection.$to.after(1);
    const initial = annotation ? {...annotation} : {...context,quote:selectedText};
    showForm('插入文献摘录', '插入摘录', [
      ['quote',{rows:3,required:true,placeholder:'输入原文，或粘贴一条 Zotero 批注'}],
      ['interpretation',{rows:2,placeholder:'记录你的解读、疑问或论证用途'}], ['title'],
      ['author',{half:true}], ['year',{half:true}], ['page',{placeholder:'书面页码，如 17、xi 或 23–25'}],
      ['source',{placeholder:'HTTPS 网址、Zotero 链接或相对于本笔记的 PDF 路径'}]
    ], initial, async data => {
      const href = sourceHref(data.source, data.page);
      if (localPdf(href)) {
        if (!getPath()) throw Error('请先保存当前笔记，再关联本地 PDF');
        await call('research-pdf-validate',{href});
      }
      insert(editor,position,excerptBlocks(data,href));
    }, {pickPdf:true});
  }

  function compareSources() {
    const editor = activeEditor(); if (!editor) return;
    const position = editor.state.selection.$to.after(1);
    showForm('插入文献对照表','插入对照表',[['question',{required:true,placeholder:'这些文献共同回答什么问题？'}]],{},
      data => insert(editor,position,comparisonBlocks(data.question)));
  }

  const container = document.getElementById('editor');
  container.addEventListener('paste',event => {
    if (!event.target.closest('.tiptap') || !getEditor()?.isEditable || dialog.open) return;
    const data = clipboardAnnotation(event.clipboardData); if (!data) return;
    event.preventDefault(); event.stopPropagation(); addExcerpt(data);
  },true);

  async function navigate(event) {
    const link = event.target.closest('a[href]');
    if (!link || !link.closest('.tiptap')) return;
    const href = link.getAttribute('href');
    if (!zoteroSource(href) && !localPdf(href)) return;
    event.preventDefault(); event.stopPropagation();
    try {
      if (localPdf(href)) await call('research-pdf-open',{href});
      else {
        const result = await window.desktop.externalLink(href);
        if (result?.error) throw Error(result.error);
      }
    } catch (err) { toast(err.message); }
  }
  container.addEventListener('dblclick',navigate,true);
  container.addEventListener('click',event => { if (event.ctrlKey || event.metaKey || event.detail === 0) navigate(event); },true);
  return {newReading, addExcerpt, compareSources};
}
