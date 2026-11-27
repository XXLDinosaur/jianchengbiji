import { Marked } from 'marked';
import domino from '@mixmark-io/domino';

export * from './core.mjs';

const tagMarkdown = new Marked({
  renderer: {
    text(token) {
      // Keep a literal Markdown escape distinct from a tag in the visible text.
      if (token.type === 'escape' && token.raw === '\\#') return '＃';
      return false;
    },
  },
});

const ignored = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA']);
const blocks = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'BR', 'HR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'FIGCAPTION']);

function visibleText(node, parts) {
  if (node.nodeType === 3) {
    parts.push(node.data);
    return;
  }
  if (node.nodeType !== 1) return;
  if (ignored.has(node.tagName) || node.hasAttribute('hidden')) {
    parts.push(node.tagName === 'PRE' ? '\n' : '\uFFFC');
    return;
  }
  const block = blocks.has(node.tagName);
  if (block) parts.push('\n');
  for (let child = node.firstChild; child; child = child.nextSibling) visibleText(child, parts);
  if (block) parts.push('\n');
}

const tagPattern = /(^|[\s，。；、（(【])#([\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*)/gu;
const tagOnlyLine = /^\s*#[\p{L}\p{M}\p{N}_-]+(?:\s+#[\p{L}\p{M}\p{N}_-]+)*\s*$/u;
const hexColor = /^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const colorContext = /(?:\b(?:color|background(?:-color)?|fill|stroke)|色值|色号|颜色)\s*[:：=]?\s*$/iu;

export function extractTags(source) {
  if (!/#[\p{L}\p{N}_]/u.test(source)) return [];
  const document = domino.createDocument(tagMarkdown.parse(source));
  const parts = [];
  visibleText(document.body, parts);
  const tags = new Set();
  for (const line of parts.join('').split(/\r?\n/)) {
    for (const match of line.matchAll(tagPattern)) {
      const [, prefix, tag] = match;
      // Keep explicit numeric tag lines, but ignore references such as Stream #0:1.
      if (!/\p{L}/u.test(tag) && !tagOnlyLine.test(line)) continue;
      if (prefix === '(' && line[match.index + match[0].length] === ')' && /^[a-z][\w-]*$/i.test(tag)) continue;
      if (hexColor.test(tag) && colorContext.test(line.slice(0, match.index))) continue;
      tags.add(tag.normalize('NFC').toLowerCase());
    }
  }
  return [...tags];
}

// Join inline marks and keep paragraph boundaries distinct, as in Tiptap textblocks.
const searchMarkdown = new Marked({gfm:true, breaks:false});
const searchIgnored = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON', 'SELECT', 'IFRAME',
  'OBJECT', 'EMBED', 'SVG', 'MATH', 'VIDEO', 'AUDIO', 'TEMPLATE', 'INPUT']);
export function searchBlocks(source) {
  const body = domino.createDocument(searchMarkdown.parse(source)).body;
  const result = [], inline = [];
  function flush() {
    const text = inline.join('').replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');
    if (text) result.push(text);
    inline.length = 0;
  }
  function walk(node) {
    if (node.nodeType === 3) { inline.push(node.data); return; }
    if (node.nodeType !== 1 || searchIgnored.has(node.tagName)) return;
    const tag = node.tagName;
    if (tag === 'IMG' || tag === 'BR' || node.hasAttribute('data-formula')) {
      inline.push('\uFFFC');
      return;
    }
    if (tag === 'PRE') {
      flush();
      result.push(node.textContent.replace(/\n$/, ''));
      return;
    }
    const block = blocks.has(tag);
    if (block) flush();
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
    if (block) flush();
  }
  walk(body);
  flush();
  return result;
}
