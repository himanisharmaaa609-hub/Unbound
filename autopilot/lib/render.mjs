// Builds every blog file from the post sources. Pure scripts: no Claude-written code runs here.
//   blog/posts.json                   rows: { slug, title, description, category, format, keyword, date, updated, published, words, readMin }
//   autopilot/content/<slug>/         post.md, meta.json, facts.json, shots.json, figures/*.json (sources, written by the writer)
//   blog/<slug>/*.webp                images (made by scripts)
// Outputs: blog/<slug>/index.html, blog/index.html, blog/feed.xml, sitemap.xml, llms.txt section, nav links.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT, AP, config, readJson } from './day.mjs';
import { renderMarkdown, esc, plainText } from './md.mjs';
import { words } from './text.mjs';

const ORIGIN = config('budget').site.origin;
export const POSTS = path.join(ROOT, 'blog', 'posts.json');
export const contentDir = (slug) => path.join(ROOT, 'autopilot', 'content', slug);
export const blogDir = (slug) => path.join(ROOT, 'blog', slug);

export const loadPosts = () => (existsSync(POSTS) ? readJson(POSTS) : []);
export const savePosts = (rows) => writeFileSync(POSTS, JSON.stringify(rows, null, 2) + '\n');
export const visible = (rows, drafts) => rows.filter((r) => r.published || drafts)
  .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug));

const readOpt = (p, fallback) => (existsSync(p) ? readJson(p) : fallback);

export function longDate(d) {
  if (!d) return '';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// WebP dimensions straight from the file header (VP8, VP8L, VP8X).
export function webpSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return null;
}

// Upsert a row from meta.json. Only the script writes posts.json.
export function rowFromMeta(slug, { published = false, date } = {}) {
  const meta = readJson(path.join(contentDir(slug), 'meta.json'));
  const md = readFileSync(path.join(contentDir(slug), 'post.md'), 'utf8');
  const n = words(plainText(md));
  return {
    slug, title: meta.title, description: meta.description, category: meta.category,
    format: meta.format, keyword: meta.keyword, date: date || meta.date || null,
    updated: date || meta.date || null, published, words: n, readMin: Math.max(1, Math.round(n / 220)),
  };
}

export function upsertRow(row) {
  const rows = loadPosts();
  const i = rows.findIndex((r) => r.slug === row.slug);
  if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
  savePosts(rows);
  return rows;
}

// ---------------------------------------------------------------- page shell
// The header, nav, footer and icon sprite come from the contact page, so blog pages stay in sync with the site.
function shell({ depth, title, description, canonical, ogImage, ogType = 'website', jsonld = [], noindex = false, active }) {
  const src = readFileSync(path.join(ROOT, 'contact', 'index.html'), 'utf8');
  const mainStart = src.indexOf('<main');
  const mainEnd = src.indexOf('</main>') + '</main>'.length;
  let before = src.slice(0, mainStart);
  let after = src.slice(mainEnd);
  const prefix = depth === 1 ? '../' : '../../';
  const fix = (s) => (depth === 1 ? s : s.replace(/(href|src)="\.\.\//g, `$1="${prefix}`));
  before = fix(before); after = fix(after);
  before = before
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}">`)
    .replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${ogType}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImage}">\n<meta name="twitter:card" content="summary_large_image">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}">`)
    .replace(/ class="is-active"/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const extra = [
    noindex ? '<meta name="robots" content="noindex">' : '',
    `<link rel="alternate" type="application/rss+xml" title="UNBOUND Insights" href="${ORIGIN}/blog/feed.xml">`,
    `<link rel="stylesheet" href="${prefix}css/blog.css?v=bp1">`,
    ...jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('\n');
  before = before.replace('</head>', `${extra}\n</head>`);
  if (active) before = before.replace(/(<a href="[^"]*blog\/" title="Insights")/, '$1 class="is-active"');
  return { before, after, prefix };
}

// ---------------------------------------------------------------- post page
function figureBlocks(slug) {
  const dir = blogDir(slug); const cdir = contentDir(slug);
  const blocks = {}; const missing = [];
  const shots = readOpt(path.join(cdir, 'shots.json'), []);
  const capturedAt = readOpt(path.join(cdir, 'shots.result.json'), {}).capturedAt;
  for (const s of shots) {
    const f = path.join(dir, `shot-${s.key}.webp`);
    if (!existsSync(f)) { missing.push(`SHOT:${s.key}`); continue; }
    const d = webpSize(f) || { w: 1200, h: 750 };
    let host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
    blocks[`SHOT:${s.key}`] = `<figure class="bp-fig bp-shot"><div class="bp-shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>${esc(host)}</span></div>` +
      `<img src="shot-${esc(s.key)}.webp" alt="${esc(s.alt)}" width="${d.w}" height="${d.h}" loading="lazy" decoding="async">` +
      `<figcaption>${esc(s.name)} homepage${capturedAt ? `, captured ${esc(longDate(capturedAt))}` : ''}.</figcaption></figure>`;
  }
  const figDir = path.join(cdir, 'figures');
  if (existsSync(figDir)) {
    for (const f of readdirSync(figDir)) {
      const m = f.match(/^([a-z0-9-]+)\.(json|chart\.json)$/);
      if (!m || f.endsWith('.chart.json') && m[2] !== 'chart.json') continue;
      const name = f.replace(/\.chart\.json$|\.json$/, '');
      const meta = readJson(path.join(figDir, f));
      const img = path.join(dir, `fig-${name}.webp`);
      if (!existsSync(img)) { missing.push(`FIG:${name}`); continue; }
      const d = webpSize(img) || { w: 1200, h: 700 };
      blocks[`FIG:${name}`] = `<figure class="bp-fig"><img src="fig-${esc(name)}.webp" alt="${esc(meta.alt)}" width="${d.w}" height="${d.h}" loading="lazy" decoding="async">` +
        (meta.caption ? `<figcaption>${esc(meta.caption)}</figcaption>` : '') + '</figure>';
    }
  }
  return { blocks, missing };
}

export function renderPost(slug, { drafts = false } = {}) {
  const rows = loadPosts();
  const row = rows.find((r) => r.slug === slug);
  if (!row) throw new Error(`no posts.json row for ${slug}`);
  const cdir = contentDir(slug);
  const meta = readJson(path.join(cdir, 'meta.json'));
  const author = config('author');
  const facts = readOpt(path.join(cdir, 'facts.json'), []);
  const { blocks, missing } = figureBlocks(slug);
  const md = readFileSync(path.join(cdir, 'post.md'), 'utf8');
  const r = renderMarkdown(md, { origin: ORIGIN, blocks });
  if (r.errors.length) throw new Error(`post.md: ${r.errors.join('; ')}`);

  const url = `${ORIGIN}/blog/${slug}/`;
  const date = row.date || new Date().toISOString().slice(0, 10);
  const cover = existsSync(path.join(blogDir(slug), 'cover.webp'));
  const og = existsSync(path.join(blogDir(slug), 'og.webp')) ? `${url}og.webp` : `${ORIGIN}/assets/logo-512.png`;
  const cited = [...new Set(r.cites)].sort((a, b) => a - b);
  const sources = cited.map((n) => facts.find((f) => f.id === `F${n}` || f.id === n)).filter(Boolean);

  const faq = Array.isArray(meta.faq) ? meta.faq : [];
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: meta.title, description: meta.description,
      datePublished: date, dateModified: row.updated || date, mainEntityOfPage: url, image: og,
      author: author.people.map((p) => ({ '@type': 'Person', name: p.name, url: p.linkedin })),
      publisher: { '@type': 'Organization', name: 'UNBOUND', url: `${ORIGIN}/`, logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/logo-512.png` } },
      keywords: meta.keyword, articleSection: meta.category, wordCount: row.words,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Insights', item: `${ORIGIN}/blog/` },
        { '@type': 'ListItem', position: 3, name: meta.title, item: url },
      ],
    },
  ];
  if (faq.length) jsonld.push({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })),
  });

  const s = shell({ depth: 2, title: `${meta.title} · UNBOUND`, description: meta.description, canonical: url, ogImage: og, ogType: 'article', jsonld, noindex: !row.published, active: true });
  const toc = r.headings.filter((h) => h.level === 2);
  const related = visible(rows, drafts).filter((p) => p.slug !== slug).slice(0, 3);
  const inline = (t) => renderMarkdown(t, { origin: ORIGIN }).html.replace(/^<p>|<\/p>$/g, '');

  const html = `${s.before}<main id="top" class="bp">
${row.published ? '' : '<div class="bp-draft wrap"><b>Draft preview.</b> This post is not live yet and is hidden from search engines.</div>\n'}<article class="bp-article">
<header class="bp-hero wrap">
  <nav class="bp-crumbs" aria-label="Breadcrumb"><a href="../">Insights</a><span aria-hidden="true">/</span><span>${esc(meta.category)}</span></nav>
  <h1 class="bp-title">${esc(meta.title)}</h1>
  <p class="bp-lead">${esc(meta.description)}</p>
  <div class="bp-meta">
    <span class="bp-by">By ${author.people.map((p) => `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join(' and ')}</span>
    <span><time datetime="${date}">${longDate(date)}</time></span>
    <span>${row.readMin} min read</span>
  </div>
</header>
${cover ? `<figure class="bp-cover wrap"><img src="cover.webp" alt="${esc(meta.coverAlt || meta.title)}" width="1600" height="1000" fetchpriority="high" decoding="async"></figure>` : ''}
<div class="bp-layout wrap">
  ${toc.length > 2 ? `<aside class="bp-toc" aria-label="On this page"><p>On this page</p><ol>${toc.map((h) => `<li><a href="#${h.id}">${inline(h.text)}</a></li>`).join('')}</ol></aside>` : '<div></div>'}
  <div class="bp-body">
${r.html}
${faq.length ? `<section class="bp-faq" aria-labelledby="faq"><h2 id="faq">Frequently asked questions</h2>${faq.map((q) => `<details><summary>${esc(q.q)}</summary><p>${inline(q.a)}</p></details>`).join('')}</section>` : ''}
${sources.length ? `<section class="bp-sources" aria-labelledby="sources"><h2 id="sources">Sources</h2><ol>${sources.map((f) => {
    const n = String(f.id).replace(/^F/, '');
    return `<li id="src-${n}"><a href="${esc(f.url)}" target="_blank" rel="nofollow noopener noreferrer">${esc(f.title || f.url)}</a>${f.publisher ? `, ${esc(f.publisher)}` : ''}${f.date ? `, ${esc(f.date)}` : ''}</li>`;
  }).join('')}</ol></section>` : ''}
    <div class="bp-cta">
      <h2>${esc(meta.cta?.heading || 'Want a whole marketing team behind this?')}</h2>
      <p>${esc(meta.cta?.text || 'UNBOUND runs strategy, brand, PR, social, SEO and growth for you on one retainer, led by the founders.')}</p>
      <a class="btn btn-dark" href="../../#book">Book a free 30-minute call <svg><use href="#i-arrow"/></svg></a>
    </div>
  </div>
</div>
</article>
${related.length ? `<section class="bp-related wrap" aria-labelledby="more"><h2 id="more">More from UNBOUND Insights</h2><div class="bp-grid">${related.map((p) => card(p, '../')).join('')}</div></section>` : ''}
</main>${s.after}`;
  mkdirSync(blogDir(slug), { recursive: true });
  writeFileSync(path.join(blogDir(slug), 'index.html'), html);
  return { slug, missing, headings: r.headings, links: r.links, cites: cited, markers: r.markers };
}

function card(p, base) {
  const hasCover = existsSync(path.join(blogDir(p.slug), 'cover.webp'));
  return `<a class="bp-card" href="${base}${p.slug}/">` +
    (hasCover ? `<span class="bp-card-img"><img src="${base}${p.slug}/cover.webp" alt="" width="1600" height="1000" loading="lazy" decoding="async"></span>` : '') +
    `<span class="bp-card-cat">${esc(p.category)}${p.published ? '' : ' · draft'}</span><b>${esc(p.title)}</b><span class="bp-card-desc">${esc(p.description)}</span>` +
    `<span class="bp-card-meta">${longDate(p.date)} · ${p.readMin} min read</span></a>`;
}

// ---------------------------------------------------------------- index, feeds, nav
export function renderIndex({ drafts = false } = {}) {
  const list = visible(loadPosts(), drafts);
  const s = shell({
    depth: 1, title: 'Insights · UNBOUND', active: true,
    description: 'Practical marketing guides from UNBOUND: strategy, brand, PR, social, SEO, growth and AI for startups and growing brands.',
    canonical: `${ORIGIN}/blog/`, ogImage: `${ORIGIN}/assets/logo-512.png`,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: 'UNBOUND Insights', url: `${ORIGIN}/blog/`, publisher: { '@type': 'Organization', name: 'UNBOUND', url: `${ORIGIN}/` } }],
  });
  const html = `${s.before}<main id="top" class="bp bp-index">
<header class="bp-hero wrap">
  <span class="eyebrow">Insights</span>
  <h1 class="bp-title">Marketing, explained by the people who run it.</h1>
  <p class="bp-lead">Guides, comparisons and news for founders and marketing leads: strategy, brand, PR, social, SEO, growth and AI.</p>
</header>
<section class="wrap">${list.length ? `<div class="bp-grid">${list.map((p) => card(p, '')).join('')}</div>` : '<p class="bp-empty">The first articles are on their way.</p>'}</section>
</main>${s.after}`;
  mkdirSync(path.join(ROOT, 'blog'), { recursive: true });
  writeFileSync(path.join(ROOT, 'blog', 'index.html'), html);
  return list.length;
}

export function renderFeed() {
  const list = visible(loadPosts(), false).slice(0, 30);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>UNBOUND Insights</title><link>${ORIGIN}/blog/</link><description>Marketing guides from UNBOUND.</description><language>en-in</language>
<atom:link href="${ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${list.map((p) => `<item><title>${esc(p.title)}</title><link>${ORIGIN}/blog/${p.slug}/</link><guid>${ORIGIN}/blog/${p.slug}/</guid><pubDate>${new Date(`${p.date}T14:30:00Z`).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('\n')}
</channel></rss>
`;
  writeFileSync(path.join(ROOT, 'blog', 'feed.xml'), xml);
}

export function renderSitemap() {
  const list = visible(loadPosts(), false);
  const urls = [
    { loc: `${ORIGIN}/`, pri: '1.0' },
    { loc: `${ORIGIN}/team/`, pri: '0.8' },
    { loc: `${ORIGIN}/contact/`, pri: '0.6' },
    ...(list.length ? [{ loc: `${ORIGIN}/blog/`, pri: '0.8', mod: list[0].date }] : []),
    ...list.map((p) => ({ loc: `${ORIGIN}/blog/${p.slug}/`, pri: '0.7', mod: p.updated || p.date })),
  ];
  writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
}

const NAV_RE = /<!--ap:blog-nav-->[\s\S]*?<!--\/ap:blog-nav-->/g;
const FOOT_RE = /<!--ap:blog-foot-->[\s\S]*?<!--\/ap:blog-foot-->/g;
export const SITE_PAGES = [['index.html', ''], ['contact/index.html', '../'], ['team/index.html', '../']];

export function renderNav(show) {
  for (const [file, prefix] of SITE_PAGES) {
    const p = path.join(ROOT, file);
    const src = readFileSync(p, 'utf8');
    const out = src
      .replace(NAV_RE, `<!--ap:blog-nav-->${show ? `<a href="${prefix}blog/" title="Insights">Insights</a>` : ''}<!--/ap:blog-nav-->`)
      .replace(FOOT_RE, `<!--ap:blog-foot-->${show ? `<li><a href="${prefix}blog/" title="Insights">Insights</a></li>` : ''}<!--/ap:blog-foot-->`);
    if (out !== src) writeFileSync(p, out);
  }
}

export function renderLlms() {
  const p = path.join(ROOT, 'llms.txt');
  const src = readFileSync(p, 'utf8');
  const list = visible(loadPosts(), false);
  const block = `<!-- ap:articles -->\n${list.length ? `## Articles\n\n${list.map((x) => `- [${x.title}](${ORIGIN}/blog/${x.slug}/): ${x.description}`).join('\n')}\n` : ''}<!-- /ap:articles -->`;
  const out = /<!-- ap:articles -->[\s\S]*?<!-- \/ap:articles -->/.test(src)
    ? src.replace(/<!-- ap:articles -->[\s\S]*?<!-- \/ap:articles -->/, block)
    : `${src.trimEnd()}\n\n${block}\n`;
  if (out !== src) writeFileSync(p, out);
}

// Everything. `drafts` renders unpublished rows too (branch previews only).
export function renderAll({ drafts = false } = {}) {
  const rows = loadPosts();
  const report = [];
  renderNav(visible(rows, drafts).length > 0);
  for (const row of rows) {
    if (!row.published && !drafts) {
      const dir = blogDir(row.slug);
      if (existsSync(path.join(dir, 'index.html'))) rmSync(path.join(dir, 'index.html'));
      continue;
    }
    report.push(renderPost(row.slug, { drafts }));
  }
  renderIndex({ drafts });
  renderFeed();
  renderSitemap();
  renderLlms();
  return report;
}
