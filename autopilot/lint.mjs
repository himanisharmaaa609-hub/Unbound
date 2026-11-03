#!/usr/bin/env node
// Article lint. node autopilot/lint.mjs <dir> [--json]
// <dir> holds meta.json, post.md, facts.json and optional shots.json / figures/.
// Errors fail the run. Warnings are listed for the writer and the owner.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './lib/day.mjs';
import { renderMarkdown, plainText } from './lib/md.mjs';
import { words } from './lib/text.mjs';

export const BANNED = [
  'delve', 'tapestry', 'testament to', 'realm', 'embark', 'ever-evolving', 'ever evolving', 'fast-paced', "in today's",
  'in today’s', 'game-changer', 'game changer', 'unlock', 'unleash', 'elevate', 'seamless', 'robust', 'leverage', 'synergy',
  'cutting-edge', 'cutting edge', 'revolutionize', 'revolutionise', 'holistic', 'paradigm', 'plethora', 'myriad', 'nestled',
  'bustling', "it's important to note", 'it is important to note', "it's worth noting", 'it is worth noting', 'in conclusion',
  'to sum up', 'at the end of the day', 'look no further', 'dive into', 'deep dive', 'buckle up', 'harness the power',
  'supercharge', 'skyrocket', 'the world of', 'landscape', 'crucial', 'pivotal', 'vibrant', 'foster', 'empower', 'journey',
  'navigate the', 'navigating the', 'stand out from the crowd', 'take it to the next level', 'next level', 'in the digital age',
  'needle in a haystack', 'low-hanging fruit', 'move the needle', 'secret sauce', 'boost your', 'transformative', 'meticulous',
  'whether you are', "whether you're", 'not only', 'but also', 'a must-have', 'must-have', 'ultimate guide', 'comprehensive guide',
  'as an ai', 'i hope this helps', 'happy marketing',
];
const HANDS_ON = /\b(we|i) (tested|tried|used|reviewed|ran|have used|have tested|personally)\b|\bin (our|my) (experience|testing|tests)\b|\bour clients?\b|\bwe helped\b|\bwhen we worked with\b/i;
const LEAN = /^(this|that|these|those|it|they|such)\s+(is|are|was|were|means|helps|makes|gives|lets|can|will|has|have|matters)\b/i;
const ALLOWED_ABBR = new Set(['AI', 'UNBOUND', 'CEO', 'CMO', 'USA', 'UK', 'FAQ', 'URL', 'HTML', 'PDF', 'API', 'IIM', 'CFP', 'FPSB', 'ACCA', 'II', 'III', 'IV', 'OK', 'TV', 'B2B', 'B2C', 'D2C', 'SaaS', 'GST', 'INR', 'USD', 'PR']);
const CATEGORY = { guide: 'Guide', listicle: 'Listicle', comparison: 'Comparison', news: 'News' };
const SITE_LINKS = new Set(['/', '/team/', '/contact/', '/#book', '/#services', '/#story', '/#usp', '/blog/']);

// Paragraphs and list items first, then sentences inside each.
const sentencesOf = (text) => text.split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)/)
  .map((u) => u.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/\*\*/g, '').replace(/\n+/g, ' ').trim())
  .flatMap((u) => u.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
  .map((s) => s.trim()).filter((s) => s.length > 1);

export function lintDir(dir, { root = ROOT } = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  const rj = (f) => { try { return JSON.parse(readFileSync(path.join(dir, f), 'utf8')); } catch (e) { E(`${f}: ${existsSync(path.join(dir, f)) ? 'invalid JSON' : 'missing'}`); return null; } };
  const meta = rj('meta.json') || {};
  const facts = rj('facts.json') || [];
  if (!existsSync(path.join(dir, 'post.md'))) { E('post.md: missing'); return { errors, warnings }; }
  const md = readFileSync(path.join(dir, 'post.md'), 'utf8');
  const budget = config('budget');
  const posts = existsSync(path.join(root, 'blog', 'posts.json')) ? JSON.parse(readFileSync(path.join(root, 'blog', 'posts.json'), 'utf8')) : [];

  // meta
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug || '') || meta.slug.length > 60) E('meta.slug: lowercase words joined by hyphens, at most 60 characters');
  if (posts.some((p) => p.slug === meta.slug && p.published)) E(`meta.slug: "${meta.slug}" is already a live post`);
  if (!meta.title || meta.title.length > 60) E(`meta.title: required, at most 60 characters (now ${meta.title?.length || 0})`);
  if (/\b(and who each fits|everything you need to know|explained|a complete guide)\b/i.test(meta.title || '')) E('meta.title: drop the vague tail');
  if (!meta.description || meta.description.length < 110 || meta.description.length > 165) E(`meta.description: 110 to 165 characters (now ${meta.description?.length || 0})`);
  if (!CATEGORY[meta.format]) E('meta.format: guide, listicle, comparison or news');
  else if (meta.category !== CATEGORY[meta.format]) E(`meta.category: must be "${CATEGORY[meta.format]}"`);
  if (!meta.keyword) E('meta.keyword: required');
  if (!Array.isArray(meta.faq) || meta.faq.length < 3 || meta.faq.length > 6) E('meta.faq: 3 to 6 questions');
  else for (const q of meta.faq) {
    if (!q.q || q.q.length > 120 || !q.q.endsWith('?')) E(`meta.faq: question must end with "?" and stay under 120 characters: "${q.q}"`);
    if (!q.a || q.a.length > 360) E(`meta.faq: answer under 360 characters: "${q.q}"`);
  }

  // facts
  const ids = new Set();
  for (const f of facts) {
    if (!/^F\d{1,3}$/.test(f.id || '')) { E(`facts.json: bad id ${f.id}`); continue; }
    ids.add(f.id);
    if (!/^https:\/\//.test(f.url || '')) E(`facts.json ${f.id}: url must be https`);
    if (!f.quote || words(f.quote) > 40) E(`facts.json ${f.id}: quote required, at most 40 words`);
    if (!f.claim || words(f.claim) > 20) E(`facts.json ${f.id}: claim required, at most 20 words`);
    for (const k of ['title', 'publisher']) if (!f[k]) E(`facts.json ${f.id}: ${k} required`);
  }

  // body
  const blocks = {};
  const r = renderMarkdown(md, { origin: budget.site.origin, blocks });
  r.errors.forEach((e) => E(`post.md: ${e}`));
  if (/^#\s/m.test(md)) E('post.md: no H1, the title is the H1');
  const h2 = r.headings.filter((h) => h.level === 2);
  if (h2.length < 4) E(`post.md: at least 4 H2 sections (now ${h2.length})`);
  for (const h of r.headings) if (h.text.length > 80) E(`post.md: heading over 80 characters: "${h.text}"`);
  for (const h of r.headings) if (/\]\(/.test(h.text)) E(`post.md: no links in headings: "${h.text}"`);

  const n = words(plainText(md));
  const [lo, hi] = budget.words[meta.format] || [800, 2500];
  if (n < lo * 0.95 || n > hi * 1.05) E(`post.md: ${n} words, budget for ${meta.format} is ${lo} to ${hi}`);

  const everything = `${md}\n${meta.title}\n${meta.description}\n${(meta.faq || []).map((q) => `${q.q} ${q.a}`).join('\n')}`;
  if (/[—–]/.test(everything)) E('no em dashes or en dashes anywhere; use a full stop, comma or "to"');
  const lower = everything.toLowerCase();
  for (const b of BANNED) if (lower.includes(b)) E(`banned phrase: "${b}"`);
  if (HANDS_ON.test(everything)) E(`hands-on claim: "${everything.match(HANDS_ON)[0]}" (the authors never claim to have tested, used or run anything)`);

  // citations: numbers need a source
  for (const c of r.cites) if (!ids.has(`F${c}`)) E(`citation [F${c}] has no entry in facts.json`);
  const prose = md.split('\n').filter((l) => !/^\s*(#|\{\{|\|)/.test(l)).join('\n');
  for (const s of sentencesOf(prose)) {
    const clean = s.replace(/\[F\d+\]/g, '');
    const needs = /\d[\d,.]*\s?%|[₹$€£]\s?\d|\b(Rs\.?|INR|USD)\s?\d|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(million|billion|crore|lakh|k)\b|\b\d{4,}\b(?<!\b(19|20)\d\d\b)/i.test(clean);
    if (needs && !/\[F\d+\]/.test(s)) E(`number without a source citation: "${s.slice(0, 120)}"`);
    const wc = words(clean);
    if (wc > 45) E(`sentence over 45 words: "${s.slice(0, 100)}…"`);
    else if (wc > 30) W(`sentence over 30 words: "${s.slice(0, 100)}…"`);
    if (LEAN.test(clean)) W(`sentence leans on the previous one, name the subject: "${s.slice(0, 80)}"`);
  }
  const all = sentencesOf(plainText(prose));
  const avg = all.length ? all.reduce((a, s) => a + words(s), 0) / all.length : 0;
  if (avg > 22) W(`average sentence length ${avg.toFixed(1)} words, aim for under 20`);

  // abbreviations: explain on first use
  const seen = new Set();
  for (const m of plainText(md).matchAll(/\b([A-Z][A-Za-z]?[A-Z]{1,4}s?)\b/g)) {
    const a = m[1].replace(/s$/, '');
    if (ALLOWED_ABBR.has(a) || seen.has(a)) continue;
    seen.add(a);
    const around = plainText(md).slice(Math.max(0, m.index - 80), m.index + a.length + 80);
    if (!new RegExp(`\\(${a}\\)|${a} \\(|${a}, (short for|meaning)`).test(around)) W(`abbreviation "${a}" is not explained on first use`);
  }

  // links
  for (const l of r.links) {
    if (l.kind === 'internal') {
      const base = l.href.replace(/#.*$/, '') || '/';
      const m = base.match(/^\/blog\/([a-z0-9-]+)\/$/);
      if (m) { if (!posts.some((p) => p.slug === m[1] && p.published)) E(`internal link to a post that is not live: ${l.href}`); }
      else if (!SITE_LINKS.has(l.href) && !SITE_LINKS.has(base)) E(`internal link to an unknown page: ${l.href}`);
    }
  }
  if (!r.links.some((l) => l.kind === 'internal')) W('no internal link: add at least one to a site page or a live post');

  // images and markers
  const shots = existsSync(path.join(dir, 'shots.json')) ? rj('shots.json') || [] : [];
  const figDir = path.join(dir, 'figures');
  const figs = existsSync(figDir) ? readdirSync(figDir) : [];
  for (const mk of r.markers) {
    if (mk.type === 'SHOT' && !shots.some((s) => s.key === mk.key)) E(`{{SHOT:${mk.key}}} has no entry in shots.json`);
    if (mk.type === 'FIG' && !figs.some((f) => f === `${mk.key}.json` || f === `${mk.key}.chart.json`)) E(`{{FIG:${mk.key}}} has no figures/${mk.key}.json or .chart.json`);
  }
  for (const s of shots) {
    if (!s.alt || s.alt.length < 20) E(`shots.json ${s.key}: descriptive alt text required`);
    if (!/^https:\/\//.test(s.url || '')) E(`shots.json ${s.key}: url must be https`);
    if (!r.markers.some((m) => m.type === 'SHOT' && m.key === s.key)) W(`shots.json ${s.key}: no {{SHOT:${s.key}}} marker in post.md`);
  }
  for (const f of figs.filter((x) => /\.(chart\.)?json$/.test(x))) {
    try { const j = JSON.parse(readFileSync(path.join(figDir, f), 'utf8')); if (!j.alt || j.alt.length < 20) E(`figures/${f}: descriptive alt text required`); } catch { E(`figures/${f}: invalid JSON`); }
  }
  if (meta.format === 'comparison' && !/^\|/m.test(md)) E('comparison posts need at least one HTML table (a Markdown pipe table)');
  if (meta.format !== 'guide' && meta.format !== 'news' && !meta.title.includes('?') && !/^(best|top)\b/i.test(meta.title)) W('title: phrase it as the searcher\'s question');

  return { errors, warnings, words: n, h2: h2.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: lint.mjs <dir> [--json]'); process.exit(2); }
  const r = lintDir(path.resolve(dir));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${r.words ?? '?'} words, ${r.h2 ?? '?'} sections`);
    for (const e of r.errors) console.log(`ERROR ${e}`);
    for (const w of r.warnings) console.log(`warn  ${w}`);
    console.log(r.errors.length ? `${r.errors.length} error(s): fix them and run the lint again` : 'lint passed');
  }
  process.exit(r.errors.length ? 1 : 0);
}
