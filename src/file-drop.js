export const imageFile = file => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name);
const documentFile = file => /\.(md|markdown|mdown|txt)$/i.test(file.name);

export function installFileDrop({isBusy, openDocuments, insertImages, toast}) {
  const main = document.querySelector('main');
  let depth = 0;
  const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const blocked = () => isBusy() || !!document.querySelector('dialog[open]');
  function clear() {
    depth = 0;
    main.classList.remove('file-drag-over');
  }
  document.addEventListener('dragenter', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    depth++;
    if (!blocked()) main.classList.add('file-drag-over');
  },true);
  document.addEventListener('dragover', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = blocked() ? 'none' : 'copy';
  },true);
  document.addEventListener('dragleave', event => {
    if (isFileDrag(event) && --depth <= 0) clear();
  },true);
  document.addEventListener('dragend',clear);
  window.addEventListener('blur',clear);
  document.addEventListener('drop', async event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
    if (blocked()) { toast('请先完成当前操作，再拖入文件'); return; }
    // Before drop Chromium can hide the filenames. Only the actual File objects determine the action.
    const files = Array.from(event.dataTransfer.files);
    const notes = files.filter(documentFile), images = files.filter(imageFile);
    if (notes.length && images.length) { toast('请将文档和图片分开拖入'); return; }
    try {
      if (notes.length) await openDocuments(notes);
      else if (images.length) await insertImages(images,{left:event.clientX,top:event.clientY});
      else toast('请拖入 Markdown、TXT 文档或支持的图片');
    } catch (error) { toast(error.message); }
  },true);
}
