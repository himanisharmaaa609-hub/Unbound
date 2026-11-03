#!/usr/bin/env node
// node autopilot/pick.mjs lab --format <fmt> --dir <runDir>        free keyword research + live post list
// node autopilot/pick.mjs post --dir <runDir> --format <fmt> --slot <n> [--dry]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config, today, ROOT, readJson } from './lib/day.mjs';
import { runLab, livePostTitles } from './keyword-lab.mjs';
import { createIssue, ensureLabels, stateBlock, updateState } from './lib/github.mjs';
import { normalize } from './lib/text.mjs';
import { redact } from './lib/secrets.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const clip = (s, n) => redact(String(s || '').replace(/\s+/g, ' ').trim()).slice(0, n);

export function validateOptions(result, candidates) {
  const opts = Array.isArray(result?.options) ? result.options : [];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out = [];
  for (const o of opts) {
    const c = byId.get(o.id);
    if (!c || normalize(o.keyword) !== normalize(c.keyword)) continue; // Claude cannot invent keywords
    if (out.some((x) => x.id === c.id)) continue;
    out.push({ id: c.id, keyword: c.keyword, angle: clip(o.angle, 160), why: clip(o.why, 200), evidence: { engines: c.engines, engineCount: c.engineCount, bestRank: c.bestRank, bing: c.bing?.impressions ?? null } });
  }
  // Fill from the top of the lab's own list, so the owner always sees 5 choices.
  for (const c of candidates) {
    if (out.length >= 5) break;
    if (out.some((x) => x.id === c.id)) continue;
    out.push({ id: c.id, keyword: c.keyword, angle: '', why: 'Added by script from the top of the keyword list.', evidence: { engines: c.engines, engineCount: c.engineCount, bestRank: c.bestRank, bing: c.bing?.impressions ?? null } });
  }
  return out.slice(0, 5);
}

export function issueBody({ date, format, slot, options, trends, owner, cfg }) {
  const s = cfg.schedule;
  const lines = [
    `@${owner} today's **${format}** options are ready. Reply with a number from **1** to **5**, or type your own keyword.`,
    '',
    `If there is no reply by **${s.deadline} IST**, option 1 is written. A preview link arrives here when the draft is ready. The post goes live at **${s.publish} IST** unless you reply **hold**. Reply **go** to lift a hold.`,
    '',
    ...options.map((o, i) => [
      `### ${i + 1}. ${o.keyword}`,
      o.angle ? `${o.angle}` : '',
      `<sub>${o.evidence.engineCount} of 4 search engines suggest it (${o.evidence.engines.join(', ')}), best position ${o.evidence.bestRank}${o.evidence.bing != null ? `, Bing impressions ${o.evidence.bing}` : ''}. ${o.why}</sub>`,
      '',
    ].filter((x) => x !== '').join('\n') + '\n'),
    trends.length ? '<details><summary>Trend sources checked today</summary>\n\n' + trends.slice(0, 12).map((t) => `- ${t.id}: [${clip(t.title, 120)}](${t.url}) (${t.source})`).join('\n') + '\n\n</details>' : '',
    '',
    stateBlock({ date, format, slot, stage: 'picked', options: options.map((o, i) => ({ n: i + 1, ...o })) }),
  ];
  return lines.join('\n');
}

async function main() {
const cmd = process.argv[2];
const dir = arg('dir');
const format = arg('format');
if (cmd === 'lab') {
  const data = await runLab({ format, out: dir });
  const posts = livePostTitles();
  writeFileSync(path.join(dir, 'posts.md'), posts.length ? posts.map((p) => `- ${p}`).join('\n') + '\n' : '- (no posts yet)\n');
  console.log(JSON.stringify({ candidates: data.candidates.length, trends: data.trends.length, engineHealth: data.engineHealth }));
  if (data.candidates.length < 5) { console.error('fewer than 5 candidates: the keyword sources may be blocking this runner'); process.exit(3); }
} else if (cmd === 'post') {
  const cfg = config('budget');
  const data = readJson(path.join(dir, 'candidates.json'));
  const resFile = path.join(dir, 'pick.result.json');
  const result = existsSync(resFile) ? readJson(resFile).data : null;
  const options = validateOptions(result, data.candidates);
  const slot = Number(arg('slot', '1'));
  const date = data.date || today();
  const title = `autopilot ${date}${slot > 1 ? ` #${slot}` : ''}: pick today's ${format}`;
  const body = issueBody({ date, format, slot, options, trends: data.trends, owner: process.env.AUTOPILOT_OWNER || cfg.owner, cfg });
  if (process.argv.includes('--dry')) { console.log(`# ${title}\n\n${body}`); process.exit(0); }
  ensureLabels();
  const n = createIssue({ title, body });
  updateState(n, { issue: n });
  console.log(`opened issue #${n}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `issue=${n}\n`, { flag: 'a' });
} else {
  console.error('usage: pick.mjs lab|post'); process.exit(2);
}
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(redact(e.stack || String(e))); process.exit(1); });
