#!/usr/bin/env node
// Evening release. Scripts only, no Claude.
// node autopilot/publish.mjs decide                 which drafted issues go live now (honours "hold")
// node autopilot/publish.mjs ship --issue <n>       take the draft from its branch, publish to main, check the live URL
// node autopilot/publish.mjs report --issue <n>     failure comment
// Cloudflare Pages deploys main on every push, so the push to main is the production deploy.
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { config, today, ROOT, readJson, setOutput } from './lib/day.mjs';
import { listIssues, getIssue, readState, readDecisions, comment, updateState, addLabel, closeIssue, runUrl } from './lib/github.mjs';
import { validatePackage, allowedChange } from './lib/postfiles.mjs';
import { loadPosts, upsertRow, rowFromMeta, renderAll } from './lib/render.mjs';
import { fetchText, sleep } from './lib/net.mjs';
import { git, commitAs, changedFiles } from './lib/gitops.mjs';
import { redact } from './lib/secrets.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const cfg = config('budget');
const ORIGIN = cfg.site.origin;
const owners = [cfg.owner, process.env.REPO_OWNER].filter(Boolean);

export function eligible(issues, date, ownersList) {
  const ready = [], holds = [];
  for (const i of issues) {
    const s = readState(i.body);
    if (!s || !['drafted', 'held'].includes(s.stage) || !s.branch || !s.slug) continue;
    if (s.date > date) continue;
    const d = readDecisions(i.comments || [], ownersList);
    if (d.hold) holds.push({ number: i.number, state: s }); else ready.push({ number: i.number, state: s });
  }
  ready.sort((a, b) => a.state.date.localeCompare(b.state.date) || (a.state.slot || 1) - (b.state.slot || 1));
  return { ready, holds };
}

function decide() {
  const date = arg('date', today());
  const issues = listIssues({ state: 'open' }).map((i) => getIssue(i.number));
  const { ready, holds } = eligible(issues, date, owners);
  for (const h of holds) {
    if (h.state.stage !== 'held') {
      updateState(h.number, { stage: 'held', heldAt: new Date().toISOString() });
      comment(h.number, 'Held, so this post did not go live tonight. Reply **go** and it goes live at the next evening run, or run "autopilot publish" from the Actions tab.');
    }
  }
  console.log(`ready: ${ready.map((r) => `#${r.number}`).join(', ') || 'none'}; held: ${holds.map((r) => `#${r.number}`).join(', ') || 'none'}`);
  setOutput('issues', JSON.stringify(ready.map((r) => r.number)));
  setOutput('go', ready.length ? 'true' : 'false');
}

// Rebuild a package from the draft branch. Only allowed source files are taken; the branch's HTML is ignored.
export function packageFromBranch(branch, slug, out) {
  rmSync(out, { recursive: true, force: true });
  const files = git('ls-tree', '-r', '--name-only', `origin/${branch}`, '--', `autopilot/content/${slug}`, `blog/${slug}`).split('\n').filter(Boolean);
  for (const f of files) {
    let rel;
    if (f.startsWith(`autopilot/content/${slug}/`)) rel = f.replace(/^autopilot\//, '');
    else if (f.startsWith(`blog/${slug}/`) && f.endsWith('.webp')) rel = f;
    else continue;
    const dest = path.join(out, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, execFileSync('git', ['show', `origin/${branch}:${f}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
  }
  return validatePackage(out, { root: ROOT });
}

async function live(url, minutes) {
  const until = Date.now() + minutes * 60000;
  while (Date.now() < until) {
    const r = await fetchText(`${url}?v=${Date.now()}`, { timeoutMs: 15000 });
    if (r.ok && !/<meta name="robots" content="noindex">/.test(r.text)) return true;
    await sleep(15000);
  }
  return false;
}

async function indexNow(urls) {
  const { key, endpoint } = config('indexnow');
  const host = new URL(ORIGIN).host;
  const r = await fetchText(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList: urls }),
  });
  return r.status;
}

async function ship() {
  const n = Number(arg('issue'));
  const issue = getIssue(n);
  const s = readState(issue.body);
  if (!s?.branch || !s.slug) throw new Error(`#${n} has no draft branch`);
  const date = today();
  git('fetch', '-q', 'origin', `${s.branch}:refs/remotes/origin/${s.branch}`);

  const pkg = path.join(process.env.RUNNER_TEMP || path.join(ROOT, 'autopilot', '.runs'), `pub-${n}`);
  const v = packageFromBranch(s.branch, s.slug, pkg);
  if (!v.ok) throw new Error(`draft refused: ${v.errors.join('; ')}`);
  execFileSync('node', [path.join(ROOT, 'autopilot', 'apply.mjs'), pkg, '--date', date, '--render', 'none'], { cwd: ROOT, stdio: 'inherit' });
  upsertRow({ ...rowFromMeta(s.slug, { published: true, date }), published: true });
  const qf = path.join(ROOT, 'autopilot', 'state', 'queue.json');
  const queue = existsSync(qf) ? readJson(qf) : [];
  queue.push({ date, slug: s.slug, title: s.title, keyword: s.keyword, format: s.format, scene: s.scene, issue: n, url: `${ORIGIN}/blog/${s.slug}/` });
  writeFileSync(qf, JSON.stringify(queue, null, 2) + '\n');
  renderAll({ drafts: false });

  // The production build must hold only this post's files and the shared lists.
  const changed = changedFiles();
  const bad = changed.filter((p) => !allowedChange(p, s.slug));
  if (bad.length) throw new Error(`unexpected changes: ${bad.join(', ')}`);
  if (!loadPosts().find((r) => r.slug === s.slug)?.published) throw new Error('flip to published failed');
  if (process.argv.includes('--dry')) { console.log(`dry run: would publish ${s.slug} (${changed.length} files)`); return; }

  git('add', '-A');
  commitAs(`Publish: ${s.title}`);
  try { git('push', '-q', 'origin', 'HEAD:main'); }
  catch {
    git('pull', '-q', '--rebase', 'origin', 'main');
    git('push', '-q', 'origin', 'HEAD:main');
  }

  const url = `${ORIGIN}/blog/${s.slug}/`;
  const ok = await live(url, 8);
  if (!ok) {
    comment(n, `The post is on main, but ${url} did not answer within 8 minutes. Check the latest deployment in Cloudflare Pages. Run: ${runUrl()}`);
    updateState(n, { stage: 'published', live: url, liveChecked: false, publishedAt: new Date().toISOString() });
    return;
  }
  const status = await indexNow([url, `${ORIGIN}/blog/`]);
  try { git('push', '-q', 'origin', '--delete', s.branch); } catch {}
  comment(n, `**Live:** ${url}\n\n<sub>Search engines notified through IndexNow (status ${status}). Google picks it up from the sitemap.</sub>`);
  updateState(n, { stage: 'published', live: url, liveChecked: true, publishedAt: new Date().toISOString() });
  addLabel(n, 'published');
  closeIssue(n);
}

function report() {
  const n = Number(arg('issue'));
  if (!n) return;
  comment(n, `The publish run failed, so this post is not live. Details: ${runUrl()}\n\nThe draft is safe on its branch. Re-run "autopilot publish" from the Actions tab once the cause is fixed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = { decide, ship, report }[process.argv[2]];
  if (!run) { console.error('usage: publish.mjs decide|ship|report'); process.exit(2); }
  Promise.resolve(run()).catch((e) => { console.error(redact(e.stack || String(e))); process.exit(1); });
}
