#!/usr/bin/env node
// Runs ONE Claude stage under the caps in budget.json. Never retries.
// node autopilot/run-stage.mjs <pick|write> --dir <runDir> [--vars K=V,...] [--vars-env A,B]
// Prompt placeholders {{NAME}} are filled from --vars and from the named environment variables.
// Writes <dir>/<stage>.events.jsonl (transcript, not uploaded) and <dir>/<stage>.result.json.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { config, AP, ROOT } from './lib/day.mjs';
import { redact } from './lib/secrets.mjs';

export function fill(tpl, v) { return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m)); }

export function parseJsonResult(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

// Child environment: only what Claude Code needs. No deploy, GitHub or API-key credentials.
const STRIP = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|GH_TOKEN|GITHUB_TOKEN|BING_WEBMASTER_KEY|CLOUDFLARE_.*|CF_.*|VERCEL_.*|ACTIONS_ID_TOKEN_REQUEST_.*|ACTIONS_RUNTIME_TOKEN|ACTIONS_RESULTS_URL|ACTIONS_CACHE_URL|INPUT_.*|NPM_TOKEN|NODE_AUTH_TOKEN)$/;
export function childEnv(src = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(src)) if (!STRIP.test(k)) env[k] = v;
  env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1';
  env.DISABLE_AUTOUPDATER = '1';
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return env;
}

// Money guard: on a subscription setup, any API key source would bill per token.
export function moneyGuard(auth, apiKeySource) {
  const src = String(apiKeySource ?? 'none').toLowerCase();
  if (auth !== 'subscription') return null;
  return ['none', 'oauth', 'claude.ai'].includes(src) ? null : `money guard: apiKeySource is "${apiKeySource}"`;
}

function main() {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const stage = process.argv[2];
  const dir = arg('dir');
  const cfg = config('budget');
  const sc = cfg.stages[stage];
  if (!sc || !dir) { console.error('usage: run-stage.mjs <pick|write> --dir <runDir>'); process.exit(2); }

  // Inputs the stage must have before any Claude call.
  if (stage === 'pick' && !existsSync(path.join(dir, 'digest.md'))) { console.error('refusing to call Claude: digest.md is missing'); process.exit(4); }

  const vars = { DIR: path.relative(ROOT, dir) || '.', DATE: '', FORMAT: '', MAX_SEARCHES: cfg.research.maxSearches, MAX_FETCHES: cfg.research.maxFetches };
  for (const kv of (arg('vars', '') || '').split(',').filter(Boolean)) { const [k, ...v] = kv.split('='); vars[k] = v.join('='); }
  for (const k of (arg('vars-env', '') || '').split(',').filter(Boolean)) vars[k] = process.env[k] ?? '';
  if (stage === 'pick') { vars.DIGEST = path.join(vars.DIR, 'digest.md'); vars.POSTS = path.join(vars.DIR, 'posts.md'); }

  let prompt = fill(readFileSync(path.join(AP, 'prompts', `${stage}.md`), 'utf8'), vars);
  if (stage === 'write') {
    const extra = path.join(AP, 'prompts', 'house-overrides.md');
    if (existsSync(extra)) prompt += `\n\n---\n\n${readFileSync(extra, 'utf8')}`;
  }
  writeFileSync(path.join(dir, `${stage}.prompt.md`), prompt);

  const env = childEnv();
  if (cfg.auth === 'subscription' && !env.CLAUDE_CODE_OAUTH_TOKEN) { console.error('CLAUDE_CODE_OAUTH_TOKEN is not set'); process.exit(4); }

  const args = [
    '-p',
    '--model', sc.model, '--effort', sc.effort,
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--setting-sources', 'project,local', '--strict-mcp-config',
    '--allowedTools', sc.allowedTools.join(','),
    '--disallowedTools', sc.disallowedTools.join(','),
    '--max-turns', String(sc.maxTurns), '--max-budget-usd', String(sc.maxBudgetUsd),
    '--output-format', 'stream-json', '--verbose',
  ];

  const started = Date.now();
  const events = createWriteStream(path.join(dir, `${stage}.events.jsonl`));
  const child = spawn('claude', args, { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let killedFor = null;
  const kill = (why) => { if (!killedFor) { killedFor = why; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); } };
  const timer = setTimeout(() => kill(`wall-clock limit of ${sc.timeoutMin} min`), sc.timeoutMin * 60000);

  let buf = '';
  let final = null;
  let init = null;
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      events.write(line + '\n');
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'system' && ev.subtype === 'init') {
        init = ev;
        const stop = moneyGuard(cfg.auth, ev.apiKeySource);
        if (stop) kill(stop);
        console.error(`[init] model=${ev.model} apiKeySource=${ev.apiKeySource ?? 'none'} tools=${(ev.tools || []).length}`);
      }
      if (ev.type === 'assistant') {
        for (const c of ev.message?.content || []) if (c.type === 'tool_use') console.error(`[tool] ${c.name} ${redact(JSON.stringify(c.input)).slice(0, 140)}`);
      }
      if (ev.type === 'result') final = ev;
    }
  });
  child.stderr.on('data', (d) => process.stderr.write(redact(String(d))));
  child.stdin.end(prompt);

  child.on('close', (code) => {
    clearTimeout(timer);
    events.end();
    const data = final && !final.is_error ? parseJsonResult(final.result) : null;
    const ok = !killedFor && !!data && !data.error;
    const out = {
      ok, stage, killedFor, exitCode: code,
      error: killedFor || (final?.is_error ? `${final.subtype}: ${String(final.result || '').slice(0, 300)}` : null) || (data?.error ?? (data ? null : 'final message was not JSON')),
      data,
      costUsd: final?.total_cost_usd ?? null, turns: final?.num_turns ?? null,
      durationMs: Date.now() - started, model: init?.model ?? sc.model, apiKeySource: init?.apiKeySource ?? null,
    };
    writeFileSync(path.join(dir, `${stage}.result.json`), redact(JSON.stringify(out, null, 2)));
    console.error(`[done] ok=${ok} cost=$${out.costUsd} turns=${out.turns} ${out.error ? `error=${out.error}` : ''}`);
    process.exit(ok ? 0 : 1);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
