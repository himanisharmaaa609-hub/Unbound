#!/usr/bin/env node
// Cover (1600x1000) and Open Graph card (1200x630) for a post, drawn from a scene + cover.json.
// node autopilot/image.mjs <workDir> <outDir> <sceneId>
// cover.json (written by the writer) is plain text only: { "kicker": "", "headline": "", "chips": ["", ""] }.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './lib/day.mjs';
import { esc } from './lib/md.mjs';
import { launch, toWebp } from './lib/images.mjs';

export function coverSpec(workDir) {
  const meta = JSON.parse(readFileSync(path.join(workDir, 'meta.json'), 'utf8'));
  let c = {};
  try { c = JSON.parse(readFileSync(path.join(workDir, 'cover.json'), 'utf8')); } catch {}
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const headline = clean(c.headline, 70) || clean(meta.title, 70);
  const kicker = clean(c.kicker, 24) || clean(meta.category, 24) || 'Insights';
  const chips = (Array.isArray(c.chips) ? c.chips : []).map((x) => clean(x, 26)).filter(Boolean).slice(0, 3);
  return { headline, kicker, chips };
}

function html(spec, scene, w, h) {
  const big = w > 1300;
  const patterns = {
    orbit: `<div class="o o1"></div><div class="o o2"></div>`,
    grid: `<div class="grid"></div><div class="o o1 soft"></div>`,
    rings: `<div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>`,
  };
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;overflow:hidden;background:${scene.bg};color:${scene.text};font-family:'Inter Tight',Inter,system-ui,sans-serif;position:relative}
.o{position:absolute;border-radius:50%;filter:blur(${big ? 90 : 70}px);opacity:.85}
.o1{width:${w * 0.55}px;height:${w * 0.55}px;background:${scene.a};right:-${w * 0.12}px;top:-${w * 0.18}px}
.o2{width:${w * 0.42}px;height:${w * 0.42}px;background:${scene.b};right:${w * 0.2}px;bottom:-${w * 0.26}px;opacity:.7}
.o.soft{opacity:.35}
.grid{position:absolute;inset:0;background-image:linear-gradient(${scene.text}14 1px,transparent 1px),linear-gradient(90deg,${scene.text}14 1px,transparent 1px);background-size:${big ? 80 : 60}px ${big ? 80 : 60}px}
.ring{position:absolute;border-radius:50%;border:${big ? 2 : 1.5}px solid ${scene.a};right:-${w * 0.1}px;top:50%;transform:translateY(-50%)}
.r1{width:${w * 0.5}px;height:${w * 0.5}px;opacity:.9}.r2{width:${w * 0.68}px;height:${w * 0.68}px;opacity:.5;border-color:${scene.b}}.r3{width:${w * 0.86}px;height:${w * 0.86}px;opacity:.25}
.pad{position:absolute;inset:0;padding:${big ? 96 : 64}px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:${big ? 14 : 10}px;font-weight:600;letter-spacing:.08em;font-size:${big ? 26 : 20}px}
.mark{width:${big ? 40 : 30}px;height:${big ? 40 : 30}px}
.kicker{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:${big ? 22 : 17}px;padding:${big ? '10px 18px' : '7px 14px'};border-radius:999px;border:1px solid ${scene.text}33;background:${scene.bg}aa;margin-bottom:${big ? 28 : 20}px}
h1{font-weight:500;letter-spacing:-.035em;line-height:1.02;font-size:${big ? (spec.headline.length > 44 ? 92 : 108) : (spec.headline.length > 44 ? 66 : 76)}px;max-width:${big ? 1150 : 900}px;text-wrap:balance}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.chips{display:flex;gap:${big ? 14 : 10}px;flex-wrap:wrap}
.chip{font-size:${big ? 22 : 17}px;padding:${big ? '12px 20px' : '8px 15px'};border-radius:14px;background:${scene.text === '#FFFFFF' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.75)'};border:1px solid ${scene.text}22;backdrop-filter:blur(8px)}
.chip::before{content:"";display:inline-block;width:${big ? 10 : 8}px;height:${big ? 10 : 8}px;border-radius:50%;background:${scene.a};margin-right:${big ? 12 : 9}px;vertical-align:middle}
.url{font-family:'JetBrains Mono',monospace;font-size:${big ? 20 : 16}px;opacity:.7}
</style></head><body>
${patterns[scene.pattern] || patterns.orbit}
<div class="pad">
  <div class="top"><svg class="mark" viewBox="0 0 48 48"><circle cx="21" cy="27" r="14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="66 21.96" transform="rotate(-20 21 27)"/><circle cx="35" cy="11" r="5" fill="${scene.a}"/></svg>UNBOUND</div>
  <div><span class="kicker">${esc(spec.kicker)}</span><h1>${esc(spec.headline)}</h1></div>
  <div class="foot"><div class="chips">${spec.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div><span class="url">weunbound.com</span></div>
</div></body></html>`;
}

export async function makeCovers(workDir, outDir, sceneId) {
  const scenes = config('scenes').scenes;
  const scene = scenes.find((s) => s.id === sceneId) || scenes[0];
  const spec = coverSpec(workDir);
  mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  try {
    for (const [name, w, h, maxKB] of [['cover', 1600, 1000, 100], ['og', 1200, 630, 90]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(html(spec, scene, w, h), { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      const png = await page.screenshot({ type: 'png' });
      writeFileSync(path.join(outDir, `${name}.webp`), await toWebp(png, { width: w, maxKB }));
      await page.close();
    }
  } finally { await browser.close(); }
  return { scene: scene.id, ...spec };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [workDir, outDir, sceneId] = process.argv.slice(2);
  if (!workDir || !outDir || !existsSync(path.join(workDir, 'meta.json'))) { console.error('usage: image.mjs <workDir> <outDir> <sceneId>'); process.exit(2); }
  makeCovers(workDir, outDir, sceneId).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
