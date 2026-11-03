#!/usr/bin/env node
// Packages a drafted post. Two modes:
//   node autopilot/collect.mjs --work autopilot/work --result <run>/write.result.json --out <pkg>   (draft job, after Claude)
//   node autopilot/collect.mjs --tree <slug> --out <pkg> [--assets <assets.json>] [--result <file>]  (verify job, after images)
// Only allowed files are copied, then the package is validated with lib/postfiles.mjs.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './lib/day.mjs';
import { validatePackage } from './lib/postfiles.mjs';
import { redact } from './lib/secrets.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('out') || 'pkg');
const CONTENT = ['post.md', 'meta.json', 'facts.json', 'brief.md', 'cover.json', 'shots.json', 'shots.result.json'];
const errors = [];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function copyContent(from, slug) {
  const dest = path.join(out, 'content', slug);
  mkdirSync(dest, { recursive: true });
  for (const f of CONTENT) if (existsSync(path.join(from, f))) cpSync(path.join(from, f), path.join(dest, f));
  const figs = path.join(from, 'figures');
  if (existsSync(figs)) {
    mkdirSync(path.join(dest, 'figures'), { recursive: true });
    for (const f of readdirSync(figs)) if (/^[a-z0-9-]{1,40}\.(html|json|chart\.json)$/.test(f)) cpSync(path.join(figs, f), path.join(dest, 'figures', f));
  }
}

let slug;
if (arg('work')) {
  const work = path.resolve(arg('work'));
  // Claude may only write inside the work folder. Anything else changed in the checkout fails the run.
  try {
    const rel = path.relative(ROOT, work).split(path.sep).join('/');
    const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
      .filter((p) => !p.startsWith(`${rel}/`) && p !== rel);
    if (changed.length) errors.push(`files changed outside ${rel}/: ${changed.slice(0, 10).join(', ')}`);
  } catch (e) { errors.push(`git status failed: ${e.message}`); }
  try { slug = JSON.parse(readFileSync(path.join(work, 'meta.json'), 'utf8')).slug; } catch { errors.push('meta.json missing or invalid'); }
  if (slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) copyContent(work, slug); else errors.push(`bad slug "${slug}"`);
} else if (arg('tree')) {
  slug = arg('tree');
  copyContent(path.join(ROOT, 'autopilot', 'content', slug), slug);
  const img = path.join(ROOT, 'blog', slug);
  if (existsSync(img)) {
    mkdirSync(path.join(out, 'blog', slug), { recursive: true });
    for (const f of readdirSync(img)) if (f.endsWith('.webp')) cpSync(path.join(img, f), path.join(out, 'blog', slug, f));
  }
}
if (arg('result') && existsSync(arg('result'))) {
  const r = JSON.parse(readFileSync(arg('result'), 'utf8'));
  writeFileSync(path.join(out, 'result.json'), redact(JSON.stringify({ ok: r.ok, data: r.data, costUsd: r.costUsd, turns: r.turns, durationMs: r.durationMs, model: r.model }, null, 2)));
}
if (arg('assets') && existsSync(arg('assets'))) cpSync(arg('assets'), path.join(out, 'assets.json'));

const v = validatePackage(out, { root: ROOT });
errors.push(...v.errors);
console.log(JSON.stringify({ ok: !errors.length, slug: v.slug, files: v.files, errors }, null, 2));
if (process.env.GITHUB_OUTPUT && v.slug) writeFileSync(process.env.GITHUB_OUTPUT, `slug=${v.slug}\n`, { flag: 'a' });
process.exit(errors.length ? 1 : 0);
