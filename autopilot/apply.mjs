#!/usr/bin/env node
// Re-checks a package with a fresh copy of the guard, then copies it into the site.
// node autopilot/apply.mjs <pkgDir> [--date YYYY-MM-DD] [--render drafts|live|none]
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, today } from './lib/day.mjs';
import { validatePackage } from './lib/postfiles.mjs';
import { rowFromMeta, upsertRow, renderAll } from './lib/render.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const pkg = path.resolve(process.argv[2] || '');
const v = validatePackage(pkg, { root: ROOT });
if (!v.ok) { console.error(`package refused:\n- ${v.errors.join('\n- ')}`); process.exit(1); }
const slug = v.slug;

const content = path.join(ROOT, 'autopilot', 'content', slug);
rmSync(content, { recursive: true, force: true });
mkdirSync(content, { recursive: true });
cpSync(path.join(pkg, 'content', slug), content, { recursive: true });
const imgs = path.join(pkg, 'blog', slug);
if (existsSync(imgs)) {
  mkdirSync(path.join(ROOT, 'blog', slug), { recursive: true });
  for (const f of readdirSync(imgs)) cpSync(path.join(imgs, f), path.join(ROOT, 'blog', slug, f));
}
upsertRow(rowFromMeta(slug, { published: false, date: arg('date', today()) }));
const mode = arg('render', 'drafts');
if (mode !== 'none') renderAll({ drafts: mode === 'drafts' });
console.log(JSON.stringify({ ok: true, slug, files: v.files.length }));
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\n`, { flag: 'a' });
