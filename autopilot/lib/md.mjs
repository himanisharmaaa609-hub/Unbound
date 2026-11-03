// Safe Markdown subset -> HTML. Every character of input is escaped first, so a post can never
// carry raw HTML, scripts or event handlers. Supported: ## / ### headings, paragraphs, - and 1. lists,
// > quotes, pipe tables, **bold**, *italic*, `code`, [text](url), [F3] fact citations,
// and block markers {{SHOT:key}} / {{FIG:name}} on their own line.

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const headingId = (t) => String(t).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '')
  .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 64);

// Returns { kind: 'internal' | 'external' | 'anchor' } or null when the URL is not allowed.
export function classifyUrl(url, origin = 'https://weunbound.com') {
  const u = String(url).trim();
  if (/^#[a-z0-9-]+$/i.test(u)) return { kind: 'anchor', href: u };
  if (/^\/(?!\/)[a-z0-9/_#.-]*$/i.test(u)) return { kind: 'internal', href: u };
  let p; try { p = new URL(u); } catch { return null; }
  if (p.protocol !== 'https:') return null;
  if (p.username || p.password) return null;
  if (p.origin === origin || p.origin === origin.replace('://', '://www.')) return { kind: 'internal', href: p.pathname + p.hash };
  return { kind: 'external', href: p.href };
}

function inline(src, ctx) {
  // src is already escaped. Protect code spans first.
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, rawUrl) => {
    const url = rawUrl.replace(/&amp;/g, '&');
    const c = classifyUrl(url, ctx.origin);
    if (!c) { ctx.errors.push(`link not allowed: ${url}`); return text; }
    ctx.links.push({ ...c, text });
    const href = esc(c.href);
    return c.kind === 'external'
      ? `<a href="${href}" target="_blank" rel="nofollow noopener noreferrer">${text}</a>`
      : `<a href="${href}">${text}</a>`;
  });
  s = s.replace(/\[F(\d{1,3})\]/g, (_, n) => {
    ctx.cites.push(+n);
    return `<sup class="bp-cite"><a href="#src-${n}" aria-label="Source ${n}">${n}</a></sup>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const isTableSep = (l) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(l.trim());
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function renderMarkdown(md, { origin, blocks = {} } = {}) {
  const ctx = { origin, errors: [], links: [], cites: [], headings: [], markers: [] };
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(esc(para.join(' ')), ctx)}</p>`); para.length = 0; } };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); i++; continue; }
    let m;
    if ((m = t.match(/^\{\{(SHOT|FIG):([a-z0-9-]{1,40})\}\}$/))) {
      flush();
      ctx.markers.push({ type: m[1], key: m[2] });
      const html = blocks[`${m[1]}:${m[2]}`];
      if (html) out.push(html); // trusted HTML built by the renderer, never from the post text
      i++; continue;
    }
    if ((m = t.match(/^(#{1,6})\s+(.+)$/))) {
      flush();
      const level = m[1].length;
      if (level !== 2 && level !== 3) ctx.errors.push(`heading level ${level} not allowed: "${m[2]}"`);
      const lv = level === 3 ? 3 : 2;
      const html = inline(esc(m[2]), ctx);
      let id = headingId(html); let n = 2;
      while (ctx.headings.some((h) => h.id === id)) id = `${headingId(html)}-${n++}`;
      ctx.headings.push({ level: lv, id, text: m[2] });
      out.push(`<h${lv} id="${id}">${html}</h${lv}>`);
      i++; continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cells(t);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="bp-table"><table><thead><tr>' +
        head.map((c) => `<th scope="col">${inline(esc(c), ctx)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(esc(r[k] ?? ''), ctx)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (/^([-*])\s+/.test(t) || /^\d{1,2}\.\s+/.test(t)) {
      flush();
      const ordered = /^\d/.test(t);
      const items = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        const mm = ordered ? l.match(/^\d{1,2}\.\s+(.*)$/) : l.match(/^[-*]\s+(.*)$/);
        if (mm) { items.push(mm[1]); i++; continue; }
        if (l && items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + l; i++; continue; }
        break;
      }
      const tagName = ordered ? 'ol' : 'ul';
      out.push(`<${tagName}>` + items.map((x) => `<li>${inline(esc(x), ctx)}</li>`).join('') + `</${tagName}>`);
      continue;
    }
    if (t.startsWith('>')) {
      flush();
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote><p>${inline(esc(q.join(' ')), ctx)}</p></blockquote>`);
      continue;
    }
    para.push(t);
    i++;
  }
  flush();
  return { html: out.join('\n'), ...ctx };
}

// Plain text of the markdown, for word counts and lint.
export function plainText(md) {
  return String(md)
    .replace(/^\{\{[^}]+\}\}$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[F\d+\]/g, '')
    .replace(/^#+\s+/gm, '').replace(/^>\s?/gm, '').replace(/^[-*]\s+|^\d+\.\s+/gm, '')
    .replace(/[*`|]/g, ' ');
}
