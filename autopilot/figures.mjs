#!/usr/bin/env node
// Diagrams and charts -> WebP. node autopilot/figures.mjs <workDir> <outDir>
//   figures/<name>.html + figures/<name>.json { alt, caption }   small HTML/inline-SVG snippet written by the writer.
//       Rendered with JavaScript OFF and every network request blocked, so a snippet can only draw.
//   figures/<name>.chart.json { title, unit, alt, caption, bars: [{ label, value, fact }] }
//       Bars drawn to scale by this script. Every bar must cite a fact id.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { launch, toWebp } from './lib/images.mjs';
import { esc } from './lib/md.mjs';

const FRAME = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--ink:#0A0A0B;--ink-2:#2E2E33;--mute:#6D6D74;--line:#E6E6E2;--bg-2:#F6F6F4;--flame:#FF4A1C;--violet:#4F2BF5;--saffron:#FFC23A;--lilac:#CBBEFF;--mint:#2DD4A7}
*{box-sizing:border-box}body{margin:0;background:#fff;font-family:Inter,'Helvetica Neue',Arial,sans-serif;color:var(--ink)}
#fig{width:1200px;padding:48px;background:#fff}
#fig h3{margin:0 0 24px;font-size:30px;font-weight:600;letter-spacing:-.02em}
</style></head><body><div id="fig">${inner}</div></body></html>`;

function chartHtml(c, facts) {
  const bars = (c.bars || []).slice(0, 12);
  const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
  const rows = bars.map((b, i) => {
    const v = Number(b.value) || 0;
    const w = Math.max(2, Math.round((v / max) * 640));
    return `<div style="display:grid;grid-template-columns:300px 1fr;align-items:center;gap:20px;margin:14px 0">
<div style="font-size:20px;color:var(--ink-2);text-align:right">${esc(b.label)}</div>
<div style="display:flex;align-items:center;gap:14px"><div style="height:34px;width:${w}px;border-radius:8px;background:${i === 0 ? 'var(--flame)' : 'var(--violet)'}"></div>
<b style="font-size:20px">${esc(String(b.value))}${esc(c.unit || '')}</b></div></div>`;
  }).join('');
  const src = [...new Set(bars.map((b) => b.fact))].map((id) => facts.find((f) => f.id === id)).filter(Boolean)
    .map((f) => esc(f.publisher || new URL(f.url).hostname)).join(', ');
  return `<h3>${esc(c.title)}</h3>${rows}<p style="margin:26px 0 0;font-size:16px;color:var(--mute)">Source: ${src}</p>`;
}

export async function makeFigures(workDir, outDir) {
  const dir = path.join(workDir, 'figures');
  const result = { ok: [], failed: [] };
  if (!existsSync(dir)) return result;
  const facts = existsSync(path.join(workDir, 'facts.json')) ? JSON.parse(readFileSync(path.join(workDir, 'facts.json'), 'utf8')) : [];
  const jobs = [];
  for (const f of readdirSync(dir)) {
    let m;
    if ((m = f.match(/^([a-z0-9-]{1,40})\.chart\.json$/))) jobs.push({ name: m[1], kind: 'chart' });
    else if ((m = f.match(/^([a-z0-9-]{1,40})\.html$/))) jobs.push({ name: m[1], kind: 'html' });
  }
  if (!jobs.length) return result;
  mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  try {
    for (const job of jobs.slice(0, 4)) {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, javaScriptEnabled: false, deviceScaleFactor: 1 });
      await ctx.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
      const page = await ctx.newPage();
      try {
        let inner;
        if (job.kind === 'chart') {
          const c = JSON.parse(readFileSync(path.join(dir, `${job.name}.chart.json`), 'utf8'));
          for (const b of c.bars || []) if (!facts.some((x) => x.id === b.fact)) throw new Error(`bar "${b.label}" cites unknown fact ${b.fact}`);
          inner = chartHtml(c, facts);
        } else {
          if (!existsSync(path.join(dir, `${job.name}.json`))) throw new Error('missing <name>.json with alt text');
          inner = readFileSync(path.join(dir, `${job.name}.html`), 'utf8');
          if (inner.length > 20000) throw new Error('snippet over 20 KB');
        }
        await page.setContent(FRAME(inner), { waitUntil: 'load', timeout: 15000 });
        const el = await page.$('#fig');
        const png = await el.screenshot({ type: 'png' });
        writeFileSync(path.join(outDir, `fig-${job.name}.webp`), await toWebp(png, { width: 1200, maxKB: 100 }));
        result.ok.push(job.name);
      } catch (e) {
        result.failed.push({ name: job.name, reason: String(e.message || e).slice(0, 160) });
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [workDir, outDir] = process.argv.slice(2);
  makeFigures(workDir, outDir).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
