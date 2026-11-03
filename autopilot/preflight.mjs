#!/usr/bin/env node
// One-off health check, run by the "autopilot check" workflow. node autopilot/preflight.mjs [--claude]
// Checks: secrets present, repo variables, the live site, the IndexNow key file, keyword sources, labels,
// and optionally one tiny Claude call that proves the login works and is not billing an API key.
import { spawnSync } from 'node:child_process';
import { config } from './lib/day.mjs';
import { fetchText } from './lib/net.mjs';
import { autocomplete, googleNews } from './lib/sources.mjs';
import { ensureLabels } from './lib/github.mjs';
import { moneyGuard, childEnv } from './run-stage.mjs';

const cfg = config('budget');
const rows = [];
const row = (name, ok, detail = '') => { rows.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

row('CLAUDE_CODE_OAUTH_TOKEN secret is set', !!process.env.CLAUDE_CODE_OAUTH_TOKEN || cfg.auth !== 'subscription');
row('ANTHROPIC_API_KEY is NOT set (subscription money guard)', !process.env.ANTHROPIC_API_KEY || cfg.auth !== 'subscription');
row('CF_PAGES_DOMAIN repo variable is set', !!process.env.CF_PAGES_DOMAIN, process.env.CF_PAGES_DOMAIN || 'preview links will point to the Cloudflare dashboard instead');
const site = await fetchText(`${cfg.site.origin}/`);
row('live site answers', site.ok, `${cfg.site.origin} ${site.status || site.error}`);
const { key } = config('indexnow');
const keyFile = await fetchText(`${cfg.site.origin}/${key}.txt`);
row('IndexNow key file is live', keyFile.ok && keyFile.text.trim() === key, `${keyFile.status}`);
const hidden = await fetchText(`${cfg.site.origin}/autopilot/config/budget.json`);
row('autopilot folder is not served', !hidden.ok || !hidden.text.includes('"stages"'), `${hidden.status}`);
const ac = await autocomplete('fractional cmo', config('niche').market, 300);
row('autocomplete engines answer', Object.values(ac).filter((l) => l.length).length >= 2, Object.entries(ac).map(([e, l]) => `${e} ${l.length}`).join(', '));
const news = await googleNews('digital marketing India');
row('Google News RSS answers', news.length > 0, `${news.length} items`);
try { ensureLabels(); row('issue labels exist', true); } catch (e) { row('issue labels exist', false, e.message); }

if (process.argv.includes('--claude')) {
  const sc = cfg.stages.pick;
  const r = spawnSync('claude', ['-p', '--model', sc.model, '--max-turns', '1', '--max-budget-usd', '0.2', '--tools', '', '--setting-sources', 'project,local', '--strict-mcp-config', '--output-format', 'stream-json', '--verbose'],
    { input: 'Reply with the single word OK.', env: childEnv(), encoding: 'utf8', timeout: 120000 });
  const lines = String(r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const init = lines.find((e) => e.type === 'system' && e.subtype === 'init');
  const res = lines.find((e) => e.type === 'result');
  row('Claude login works', !!res && !res.is_error, res ? String(res.result).slice(0, 40) : String(r.stderr).slice(0, 200));
  row('Claude bills the subscription, not an API key', !!init && !moneyGuard(cfg.auth, init.apiKeySource), `apiKeySource=${init?.apiKeySource ?? 'unknown'}`);
}

const failed = rows.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);
