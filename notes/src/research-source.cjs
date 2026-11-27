const pageNumber = value => /^[1-9]\d{0,6}$/.test(value || '');
const itemKey = /^[A-Z0-9]{8}$/;

function zoteroSource(value) {
  if (typeof value !== 'string' || !/^zotero:\/\//i.test(value) || /[\s\\#]/.test(value)) return null;
  const match = /^zotero:\/\/(open-pdf|select)\/(library|groups\/[1-9]\d*)\/items\/([A-Z0-9]{8})(?:\?([^#]*))?$/.exec(value);
  if (!match) return null;
  const [, action, , , query] = match;
  if (query === undefined) return value;
  if (action !== 'open-pdf' || !query) return null;
  const params = new URLSearchParams(query);
  for (const [key, val] of params) {
    if (params.getAll(key).length !== 1) return null;
    if (key === 'page' ? !pageNumber(val) : key !== 'annotation' || !itemKey.test(val)) return null;
  }
  return value;
}

// Markdown links contain encoded path segments. Keep separators literal so a
// moved note and PDF can also be opened together in other Markdown editors.
function encodePdfPath(value) {
  return value.replace(/\\/g, '/').split('/').map(segment =>
    encodeURIComponent(segment).replace(/[()]/g, ch => ch === '(' ? '%28' : '%29')
  ).join('/');
}

function localPdf(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const match = /^([^#?]+\.pdf)(?:#page=([1-9]\d{0,6}))?$/i.exec(value);
  if (!match) return null;
  let name;
  try {
    name = match[1].split('/').map(segment => {
      // A manually typed filename may contain a literal percent sign.
      const decoded = decodeURIComponent(segment.replace(/%(?![\da-f]{2})/ig, '%25'));
      if (/[/\\]/.test(decoded)) throw Error();
      return decoded;
    }).join('/');
  } catch { return null; }
  if (!name || name.startsWith('/') || /[<>:"\\|?*\x00-\x1f\x7f]/.test(name)) return null;
  return { path:name, page:match[2] || '' };
}

function sourceHref(value, printedPage = '') {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  const page = pageNumber(printedPage) ? String(printedPage) : '';
  const zotero = zoteroSource(raw);
  if (zotero) {
    const url = new URL(zotero);
    if (page && url.hostname === 'open-pdf' && !url.searchParams.has('page')) url.searchParams.set('page', page);
    return url.href;
  }
  const remote = /^10\.\d{4,9}\/\S+$/i.test(raw) ? 'https://doi.org/' + raw : raw;
  if (/^https:\/\//i.test(remote)) {
    const url = new URL(remote);
    if (url.username || url.password) throw Error('来源网址不能包含登录凭据');
    if (page && !url.hash && /\.pdf$/i.test(url.pathname)) url.hash = 'page=' + page;
    return url.href.replace(/[()]/g, ch => ch === '(' ? '%28' : '%29');
  }
  const local = localPdf(raw.replace(/\\/g, '/'));
  if (local) return encodePdfPath(local.path) + ((local.page || page) ? '#page=' + (local.page || page) : '');
  throw Error('请输入 HTTPS 网址、DOI、Zotero 文献链接或指向仓库内 PDF 的相对路径');
}

function fromCitation(value) {
  const text = value.trim().replace(/^[（(]|[）)]$/g, '');
  const match = /^(.*?)[,，\s]+((?:1|2)\d{3}[a-z]?)\b(?:[,，\s]+(?:pp?\.?|第)\s*([\w\u2013\u2014-]+)\s*页?)?/iu.exec(text);
  return { author:match?.[1]?.trim() || '', year:match?.[2] || '', page:match?.[3] || '' };
}

function unquote(value) {
  const quote = value.replace(/^\s*>\s?/gm, '').trim();
  const pairs = {'“':'”','‘':'’','"':'"','「':'」','『':'』'};
  return quote.length >= 2 && pairs[quote[0]] === quote.at(-1) ? quote.slice(1,-1).trim() : quote;
}

function parseAnnotation(value) {
  if (!value || !value.includes('zotero://')) return null;
  const text = value.replace(/&amp;/g, '&').trim();
  const urls = [...text.matchAll(/zotero:\/\/(?:open-pdf|select)\/[^\s<>)\]"，。；]+/g)]
    .filter(match => zoteroSource(match[0]));
  const pdfLinks = urls.filter(match => match[0].startsWith('zotero://open-pdf/'));
  if (pdfLinks.length > 1 || (!pdfLinks.length && urls.length !== 1)) return null;
  const selected = pdfLinks[0] || urls[0];
  if (!selected) return null;
  const source = selected[0];
  const links = [...text.matchAll(/\[([^\]\n]*)\]\((zotero:\/\/[^)\s]+)\)/g)];
  const citation = links.find(match => match[2].startsWith('zotero://select/'));
  const original = links.find(match => match[2] === source);
  let start = links[0]?.index ?? urls[0].index;
  let end = original ? original.index + original[0].length : selected.index + source.length;
  let prefix = text.slice(0,start).replace(/[\s（(<]+$/, '').trim();
  // Plain-text quick copy can contain the citation without a Markdown link.
  const plainCitation = /[（(]([^()\n]*?(?:1|2)\d{3}[^()\n]*)[）)]\s*$/.exec(prefix);
  if (plainCitation) prefix = prefix.slice(0, plainCitation.index).trim();
  const metadata = fromCitation(citation?.[1] || plainCitation?.[1] || '');
  const linkedQuote = original && !citation && !prefix && !/^(?:pdf|page\s+\d+|页码?\s*\d+)$/i.test(original[1]) ? original[1] : '';
  return {
    quote:unquote(prefix || linkedQuote), author:metadata.author, year:metadata.year,
    page:metadata.page || new URL(source).searchParams.get('page') || '',
    source, interpretation:text.slice(end).replace(/^[\s）)>]+/, '').trim()
  };
}

module.exports = { zoteroSource, localPdf, sourceHref, encodePdfPath, parseAnnotation, fromCitation, unquote };
