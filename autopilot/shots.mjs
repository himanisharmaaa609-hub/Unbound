#!/usr/bin/env node
// Homepage screenshots for listicle and comparison picks. Never faked: a site that fails gets no image.
// node autopilot/shots.mjs <workDir> <outDir>     reads <workDir>/shots.json: [{ key, name, url, alt }]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, toWebp } from './lib/images.mjs';
import { today } from './lib/day.mjs';

const HIDE = `[id*="cookie" i],[class*="cookie" i]:not(body):not(html),[id*="consent" i],[class*="consent" i]:not(body):not(html),
#onetrust-banner-sdk,#onetrust-consent-sdk,.cc-window,#CybotCookiebotDialog,[aria-label*="cookie" i],[class*="gdpr" i],
[id*="intercom" i],[class*="chat-widget" i],iframe[title*="chat" i]{display:none!important;visibility:hidden!important}
html,body{overflow:hidden!important}`;

export async function takeShots(workDir, outDir) {
  const file = path.join(workDir, 'shots.json');
  const result = { capturedAt: today(), ok: [], failed: [] };
  if (!existsSync(file)) return result;
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error('shots.json must be an array');
  mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  try {
    for (const s of list.slice(0, 12)) {
      if (!/^[a-z0-9-]{1,40}$/.test(s.key || '')) { result.failed.push({ key: s.key, reason: 'bad key' }); continue; }
      let u; try { u = new URL(s.url); } catch { result.failed.push({ key: s.key, reason: 'bad url' }); continue; }
      if (u.protocol !== 'https:') { result.failed.push({ key: s.key, reason: 'not https' }); continue; }
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-IN',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
      const page = await ctx.newPage();
      try {
        const res = await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!res || res.status() >= 400) throw new Error(`HTTP ${res ? res.status() : 'no response'}`);
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.waitForTimeout(1500);
        const title = (await page.title()).toLowerCase();
        if (/just a moment|access denied|attention required|captcha|forbidden/.test(title)) throw new Error(`blocked page: ${title}`);
        const png = await page.screenshot({ type: 'png' });
        writeFileSync(path.join(outDir, `shot-${s.key}.webp`), await toWebp(png, { width: 1200, maxKB: 100 }));
        result.ok.push(s.key);
      } catch (e) {
        result.failed.push({ key: s.key, name: s.name, reason: String(e.message || e).slice(0, 160) });
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(workDir, 'shots.result.json'), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [workDir, outDir] = process.argv.slice(2);
  takeShots(workDir, outDir).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
