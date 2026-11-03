#!/usr/bin/env node
// node autopilot/write.mjs prepare                     read the reply, reserve a cover scene, mark the issue "writing"
// node autopilot/write.mjs assets --slug <s> --scene <id>   cover, OG card, screenshots, figures (verify job, no secrets)
// node autopilot/write.mjs ship --issue <n> --pkg <dir>     branch + Cloudflare preview + quote check + comment
// node autopilot/write.mjs report --issue <n> --what <text> failure comment
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { config, today, ROOT, readJson, setOutput } from './lib/day.mjs';
import { listIssues, getIssue, readState, readDecisions, comment, updateState, runUrl } from './lib/github.mjs';
import { inferFormat } from './lib/text.mjs';
import { fetchText, sleep } from './lib/net.mjs';
import { allowedChange } from './lib/postfiles.mjs';
import { git, changedFiles, commitAs } from './lib/gitops.mjs';
import { redact } from './lib/secrets.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const cfg = config('budget');
const owners = () => [cfg.owner, process.env.REPO_OWNER].filter(Boolean);

export function branchFor(date, issue) { return `ap-${date.replace(/-/g, '')}-${issue}`; }
export function previewBase(branch) {
  const domain = (process.env.CF_PAGES_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  // Cloudflare Pages branch alias: lowercase, non-alphanumerics to hyphens, at most 28 characters.
  return domain ? `https://${branch.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 28).replace(/-+$/, '')}.${domain}` : null;
}

// Least-used scene across published posts and open issues, so parallel posts never share one.
export function reserveScene(openStates) {
  const scenes = config('scenes').scenes.map((s) => s.id);
  const used = Object.fromEntries(scenes.map((s) => [s, 0]));
  const qf = path.join(ROOT, 'autopilot', 'state', 'queue.json');
  const queue = existsSync(qf) ? readJson(qf) : [];
  queue.slice(-scenes.length * 2).forEach((q, i) => { if (q.scene in used) used[q.scene] += 1 + i / 1000; });
  for (const s of openStates) if (s?.scene in used) used[s.scene] += 10;
  return scenes.sort((a, b) => used[a] - used[b])[0];
}

async function prepare() {
  const event = process.env.EVENT_NAME || 'workflow_dispatch';
  const no = (why) => { console.log(`nothing to write: ${why}`); setOutput('go', 'false'); process.exit(0); };
  let n = Number(process.env.ISSUE_NUMBER || 0);
  const date = today();

  if (!n) {
    const open = listIssues({ state: 'open' }).map((i) => ({ i, s: readState(i.body) }))
      .filter(({ s }) => s && s.stage === 'picked' && s.date === date)
      .sort((a, b) => (a.s.slot || 1) - (b.s.slot || 1));
    if (!open.length) no('no picked issue waiting for today');
    n = open[0].i.number;
  }
  const issue = getIssue(n);
  if (!issue.title.startsWith('autopilot ') || !issue.labels.some((l) => l.name === 'autopilot')) no(`#${n} is not an autopilot issue`);
  const state = readState(issue.body);
  if (!state) no(`#${n} has no readable state`);
  const d = readDecisions(issue.comments, owners());

  if (event === 'issue_comment') {
    const last = issue.comments[issue.comments.length - 1];
    const lastD = readDecisions([last], owners());
    const isHoldOrGo = /^(hold|wait|stop|go|publish|release)\b/i.test(String(last?.body || '').replace(/^>.*$/gm, '').trim()) && String(last?.body || '').trim().length <= 40;
    if (isHoldOrGo) {
      if (['writing', 'drafted', 'held'].includes(state.stage)) {
        comment(n, d.hold ? `Hold noted. This post will not go live until you reply **go**.` : `Go noted. This post is back on for ${cfg.schedule.publish} IST.`);
      }
      no('hold/go reply');
    }
    if (lastD.pick == null && !lastD.custom) no('comment is not a pick');
  }
  if (!['picked', 'failed'].includes(state.stage)) no(`issue is already ${state.stage}`);
  if (event === 'schedule' && state.stage !== 'picked') no('cron only starts picked issues');

  let choice;
  const forced = Number(process.env.INPUT_PICK || 0);
  if (forced >= 1 && forced <= 5) choice = { pick: forced };
  else if (d.custom) choice = { custom: d.custom };
  else if (d.pick) choice = { pick: d.pick };
  else if (event === 'schedule' || event === 'workflow_dispatch') choice = { pick: 1 };
  else no('no decision yet');

  let keyword, angle = '', format = state.format, optionN = null;
  if (choice.custom) { keyword = choice.custom.toLowerCase(); format = inferFormat(keyword, state.format); }
  else {
    const o = (state.options || []).find((x) => x.n === choice.pick) || state.options?.[choice.pick - 1];
    if (!o) no(`option ${choice.pick} does not exist`);
    keyword = o.keyword; angle = o.angle || ''; optionN = choice.pick;
  }

  const others = listIssues({ state: 'open' }).filter((i) => i.number !== n).map((i) => readState(i.body)).filter(Boolean);
  const scene = state.scene || reserveScene(others);
  const resumeRun = state.stage === 'failed' && state.keyword === keyword && state.lastWorkRun ? String(state.lastWorkRun) : '';

  comment(n, `Writing: **${keyword}** (${format}${optionN ? `, option ${optionN}` : ', your keyword'}${resumeRun ? ', reusing the research from the earlier run' : ''}). The preview link arrives here in about an hour.`);
  updateState(n, { stage: 'writing', keyword, angle, format, scene, option: optionN, writeRun: runUrl(), writeStartedAt: new Date().toISOString() });

  setOutput('go', 'true');
  setOutput('issue', String(n));
  setOutput('keyword', keyword);
  setOutput('angle', angle);
  setOutput('format', format);
  setOutput('scene', scene);
  setOutput('date', state.date || date);
  setOutput('resume_run', resumeRun);
}

async function assets() {
  const slug = arg('slug');
  const scene = arg('scene');
  const content = path.join(ROOT, 'autopilot', 'content', slug);
  const out = path.join(ROOT, 'blog', slug);
  const { makeCovers } = await import('./image.mjs');
  const { takeShots } = await import('./shots.mjs');
  const { makeFigures } = await import('./figures.mjs');
  const report = { cover: null, shots: null, figures: null };
  report.cover = await makeCovers(content, out, scene);
  report.shots = await takeShots(content, out);
  report.figures = await makeFigures(content, out);
  writeFileSync(arg('out', path.join(ROOT, 'autopilot', '.runs', 'assets.json')), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

async function waitFor(url, minutes) {
  const until = Date.now() + minutes * 60000;
  while (Date.now() < until) {
    const r = await fetchText(url, { timeoutMs: 15000 });
    if (r.ok) return true;
    await sleep(15000);
  }
  return false;
}

async function ship() {
  const n = Number(arg('issue'));
  const pkg = path.resolve(arg('pkg'));
  const issue = getIssue(n);
  const state = readState(issue.body);
  const slug = JSON.parse(execFileSync('node', [path.join(ROOT, 'autopilot', 'apply.mjs'), pkg, '--date', state.date, '--render', 'drafts'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop()).slug;
  const branch = branchFor(state.date, n);

  const changed = changedFiles();
  const bad = changed.filter((p) => !allowedChange(p, slug));
  if (bad.length) throw new Error(`unexpected changes: ${bad.join(', ')}`);
  git('checkout', '-q', '-B', branch);
  git('add', '-A');
  commitAs(`Draft: ${slug}`);
  git('push', '-q', '-f', 'origin', `HEAD:refs/heads/${branch}`);

  const base = previewBase(branch);
  const url = base ? `${base}/blog/${slug}/` : null;
  const live = url ? await waitFor(url, 8) : false;

  const facts = existsSync(path.join(pkg, 'content', slug, 'facts.json')) ? readJson(path.join(pkg, 'content', slug, 'facts.json')) : [];
  const { checkQuotes } = await import('./quotes.mjs');
  const quotes = facts.length ? await checkQuotes(facts) : [];
  const res = existsSync(path.join(pkg, 'result.json')) ? readJson(path.join(pkg, 'result.json')) : {};
  const assetsR = existsSync(path.join(pkg, 'assets.json')) ? readJson(path.join(pkg, 'assets.json')) : {};
  const lint = existsSync(path.join(pkg, 'lint.json')) ? readJson(path.join(pkg, 'lint.json')) : {};
  const meta = readJson(path.join(pkg, 'content', slug, 'meta.json'));
  const data = res.data || {};

  const open = [
    ...(Array.isArray(data.openItems) ? data.openItems : []).map(String),
    ...(assetsR.shots?.failed || []).map((f) => `No screenshot for ${f.name || f.key}: ${f.reason}`),
    ...(assetsR.figures?.failed || []).map((f) => `Figure ${f.name} not drawn: ${f.reason}`),
    ...quotes.filter((q) => q.status !== 'verified').map((q) => `Quote ${q.id} ${q.status}: ${facts.find((f) => f.id === q.id)?.url || ''}`),
    ...(lint.warnings || []).slice(0, 6).map((w) => `Style: ${w}`),
  ].map((s) => redact(s).slice(0, 300)).slice(0, 15);
  const verified = quotes.filter((q) => q.status === 'verified').length;

  comment(n, [
    `**Draft ready: ${meta.title}**`,
    '',
    url ? (live ? `Preview: ${url}` : `Preview (still building, try in a few minutes): ${url}`) : `Preview: open Cloudflare Pages, deployments for branch \`${branch}\`. Set the repo variable CF_PAGES_DOMAIN to get a direct link here.`,
    '',
    `${lint.words ?? '?'} words · ${facts.length} sources · quotes verified word for word: ${verified} of ${quotes.length}`,
    data.factCheck ? `Fact check: ${redact(String(data.factCheck)).slice(0, 400)}` : '',
    open.length ? `\n**Open items**\n${open.map((o) => `- ${o}`).join('\n')}` : '',
    '',
    `Goes live at **${cfg.schedule.publish} IST** today unless you reply **hold**.`,
    res.costUsd != null ? `<sub>Writer: ${res.turns} turns, about $${Number(res.costUsd).toFixed(2)} of API-equivalent usage.</sub>` : '',
  ].filter((x) => x !== '').join('\n'));
  updateState(n, { stage: 'drafted', slug, title: meta.title, branch, previewUrl: url, previewAt: new Date().toISOString() });
}

function report() {
  const n = Number(arg('issue'));
  if (!n) { console.log('no issue to report on'); return; }
  comment(n, `The ${arg('what', 'write')} run failed, so nothing goes live from it. Details: ${runUrl()}\n\nTo retry, reply with the option number again, or re-run the workflow from the Actions tab.`);
  try { updateState(n, { stage: 'failed', failedAt: new Date().toISOString(), lastWorkRun: process.env.GITHUB_RUN_ID || null }); } catch (e) { console.error(e.message); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = { prepare, assets, ship, report }[process.argv[2]];
  if (!run) { console.error('usage: write.mjs prepare|assets|ship|report'); process.exit(2); }
  Promise.resolve(run()).catch((e) => { console.error(redact(e.stack || String(e))); process.exit(1); });
}
