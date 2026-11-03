// Security boundary for a drafted post. Re-checked in every job that applies a package.
// A package directory may contain exactly:
//   content/<slug>/{post.md, meta.json, facts.json, brief.md, cover.json, shots.json, shots.result.json}
//   content/<slug>/figures/<name>.{html,json,chart.json}
//   blog/<slug>/{cover.webp, og.webp, shot-<key>.webp, fig-<name>.webp}
//   result.json, assets.json   (run reports, never copied into the site)
// Everything else is refused. posts.json rows and rendered HTML are made by scripts, never shipped in a package.
import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { findSecrets } from './secrets.mjs';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NAME = '[a-z0-9-]{1,40}';
const RULES = [
  { re: new RegExp(`^content/(${SLUG})/post\\.md$`), max: 60e3, kind: 'md' },
  { re: new RegExp(`^content/(${SLUG})/meta\\.json$`), max: 12e3, kind: 'json' },
  { re: new RegExp(`^content/(${SLUG})/facts\\.json$`), max: 40e3, kind: 'json' },
  { re: new RegExp(`^content/(${SLUG})/brief\\.md$`), max: 20e3, kind: 'text' },
  { re: new RegExp(`^content/(${SLUG})/cover\\.json$`), max: 2e3, kind: 'json' },
  { re: new RegExp(`^content/(${SLUG})/shots(\\.result)?\\.json$`), max: 10e3, kind: 'json' },
  { re: new RegExp(`^content/(${SLUG})/figures/${NAME}\\.html$`), max: 20e3, kind: 'figure' },
  { re: new RegExp(`^content/(${SLUG})/figures/${NAME}\\.(chart\\.)?json$`), max: 8e3, kind: 'json' },
  { re: new RegExp(`^blog/(${SLUG})/(cover|og|shot-${NAME}|fig-${NAME})\\.webp$`), max: 150e3, kind: 'webp' },
  { re: /^(result|assets|lint)\.json$/, max: 60e3, kind: 'json', report: true },
];

const FIGURE_BANS = [/<script/i, /<iframe/i, /<object/i, /<embed/i, /<link/i, /<meta/i, /<base/i, /<form/i, /\son[a-z]+\s*=/i, /javascript:/i, /@import/i, /https?:\/\//i, /<foreignObject/i];
const MD_BANS = [/<script/i, /<iframe/i, /javascript:/i, /data:text\/html/i, /\son[a-z]+\s*=\s*["']/i, /set:html/i];

function walk(dir, base = dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) { out.push({ rel: path.relative(base, p), symlink: true }); continue; }
    if (st.isDirectory()) walk(p, base, out); else out.push({ rel: path.relative(base, p).split(path.sep).join('/'), size: st.size, abs: p });
  }
  return out;
}

export function validatePackage(pkgDir, { root } = {}) {
  const errors = [];
  const files = walk(pkgDir);
  const slugs = new Set();
  for (const f of files) {
    if (f.symlink) { errors.push(`${f.rel}: symlinks are not allowed`); continue; }
    const rule = RULES.find((r) => r.re.test(f.rel));
    if (!rule) { errors.push(`${f.rel}: path not allowed`); continue; }
    if (!rule.report) slugs.add(f.rel.match(rule.re)[1]);
    if (f.size > rule.max) errors.push(`${f.rel}: ${f.size} bytes, limit ${rule.max}`);
    const buf = readFileSync(f.abs);
    if (rule.kind === 'webp') {
      if (!(buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')) errors.push(`${f.rel}: not a real WebP file`);
      continue;
    }
    const text = buf.toString('utf8');
    if (text.includes('\u0000')) errors.push(`${f.rel}: binary content`);
    const secrets = findSecrets(text);
    if (secrets.length) errors.push(`${f.rel}: credential-shaped text (${secrets.join(', ')})`);
    if (rule.kind === 'json') { try { JSON.parse(text); } catch { errors.push(`${f.rel}: invalid JSON`); } }
    if (rule.kind === 'md') for (const re of MD_BANS) if (re.test(text)) errors.push(`${f.rel}: forbidden content ${re}`);
    if (rule.kind === 'figure') for (const re of FIGURE_BANS) if (re.test(text)) errors.push(`${f.rel}: forbidden content ${re}`);
  }
  if (slugs.size !== 1) errors.push(`package must hold exactly one post, found ${slugs.size} (${[...slugs].join(', ')})`);
  const slug = [...slugs][0];
  if (slug) {
    for (const need of [`content/${slug}/post.md`, `content/${slug}/meta.json`]) if (!files.some((f) => f.rel === need)) errors.push(`${need}: missing`);
    const metaFile = files.find((f) => f.rel === `content/${slug}/meta.json`);
    if (metaFile) { try { if (JSON.parse(readFileSync(metaFile.abs, 'utf8')).slug !== slug) errors.push('meta.json slug does not match its folder'); } catch {} }
    if (slug.length > 60) errors.push('slug over 60 characters');
    // Never touch another post, and never replace a live one.
    if (root && existsSync(path.join(root, 'blog', 'posts.json'))) {
      const rows = JSON.parse(readFileSync(path.join(root, 'blog', 'posts.json'), 'utf8'));
      if (rows.some((r) => r.slug === slug && r.published)) errors.push(`"${slug}" is already a live post`);
    }
  }
  return { ok: errors.length === 0, errors, slug, files: files.map((f) => f.rel) };
}

// Paths a ship or publish commit may change for one post.
export function allowedChange(rel, slug) {
  return rel.startsWith(`autopilot/content/${slug}/`) || rel.startsWith(`blog/${slug}/`) ||
    ['blog/index.html', 'blog/posts.json', 'blog/feed.xml', 'sitemap.xml', 'llms.txt', 'index.html', 'contact/index.html', 'team/index.html', 'autopilot/state/queue.json'].includes(rel) ||
    /^blog\/[a-z0-9-]+\/index\.html$/.test(rel); // related-post lists on other posts are re-rendered
}
