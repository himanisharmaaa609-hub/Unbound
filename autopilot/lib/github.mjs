// GitHub issues as inbox + state machine, through the gh CLI (preinstalled on GitHub runners).
// The issue body ends with a hidden block that scripts read and patch:
//   <!-- autopilot-state
//   { ...json... }
//   -->
import { execFileSync } from 'node:child_process';
import { redact } from './secrets.mjs';

const STATE_RE = /<!-- autopilot-state\r?\n([\s\S]*?)\r?\n-->/;

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
}
const ghJson = (args) => JSON.parse(gh(args) || 'null');

export function readState(body) {
  const m = String(body || '').match(STATE_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return undefined; } // undefined = present but unreadable
}

export function stateBlock(state) {
  return `<!-- autopilot-state\n${JSON.stringify(state, null, 2).replace(/-->/g, '--\\u003e')}\n-->`;
}

// Patch the state in a body. Refuses to rebuild a block it cannot parse.
export function patchBody(body, patch) {
  const cur = readState(body);
  if (cur === undefined) throw new Error('autopilot-state block is unreadable; refusing to overwrite it');
  const next = { ...(cur || {}), ...patch };
  const block = stateBlock(next);
  // A replacer function, so a `$` in any text is never treated as a replacement pattern.
  return { body: cur ? body.replace(STATE_RE, () => block) : `${body.trimEnd()}\n\n${block}\n`, state: next };
}

export function ensureLabels() {
  for (const [name, color, desc] of [
    ['autopilot', '4F2BF5', 'Blog autopilot issue'],
    ['published', '2DD4A7', 'Autopilot post is live'],
  ]) { try { gh(['label', 'create', name, '--color', color, '--description', desc, '--force']); } catch {} }
}

export function listIssues({ state = 'open', search } = {}) {
  const args = ['issue', 'list', '--label', 'autopilot', '--state', state, '--limit', '50', '--json', 'number,title,body,state,labels,createdAt'];
  if (search) args.push('--search', search);
  return ghJson(args) || [];
}

export function findIssuesForDate(date) {
  return listIssues({ state: 'all', search: `"autopilot ${date}" in:title` })
    .filter((i) => i.title.startsWith(`autopilot ${date}`));
}

export function getIssue(n) {
  return ghJson(['issue', 'view', String(n), '--json', 'number,title,body,state,labels,comments,author']);
}

export function createIssue({ title, body }) {
  const url = gh(['issue', 'create', '--title', title, '--label', 'autopilot', '--body-file', '-'], redactBody(body)).trim();
  return Number(url.split('/').pop());
}

export function comment(n, text) {
  gh(['issue', 'comment', String(n), '--body-file', '-'], redact(text));
}

export function updateState(n, patch) {
  const issue = getIssue(n);
  const { body, state } = patchBody(issue.body, patch);
  gh(['issue', 'edit', String(n), '--body-file', '-'], body);
  return state;
}

export function addLabel(n, label) { gh(['issue', 'edit', String(n), '--add-label', label]); }
export function closeIssue(n) { gh(['issue', 'close', String(n)]); }

// Redact everything except the state block (which only scripts write).
function redactBody(body) {
  const m = body.match(STATE_RE);
  if (!m) return redact(body);
  return redact(body.replace(STATE_RE, '\u0000STATE\u0000')).replace('\u0000STATE\u0000', () => m[0]);
}

// ------------------------------------------------------------------ reply parsing
const HOLD = /^(hold|wait|stop)\b/i;
const GO = /^(go|publish|release)\b/i;

export function cleanReply(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n').filter((l) => !/^\s*>/.test(l)).join('\n') // drop quoted lines (GitHub Mobile "Quote reply")
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

// Walk the owner's comments in order. Returns the latest pick or custom keyword, and the hold flag.
export function readDecisions(comments, owners) {
  const allowed = new Set(owners.map((o) => o.toLowerCase()));
  const out = { pick: null, custom: null, hold: false, holdAt: null, decidedAt: null };
  for (const c of comments || []) {
    const who = (c.author?.login || c.user?.login || '').toLowerCase();
    if (!allowed.has(who)) continue;
    const t = cleanReply(c.body);
    if (!t) continue;
    const firstLine = t.split('\n')[0].trim().replace(/[.!]+$/, '');
    if (t.length <= 40 && HOLD.test(firstLine)) { out.hold = true; out.holdAt = c.createdAt; continue; }
    if (t.length <= 40 && GO.test(firstLine)) { out.hold = false; continue; }
    if (/^[1-5]$/.test(firstLine) || /^(option\s*)?#?[1-5]$/i.test(firstLine)) {
      out.pick = Number(firstLine.match(/[1-5]/)[0]); out.custom = null; out.decidedAt = c.createdAt; continue;
    }
    if (firstLine.length >= 3 && firstLine.length <= 80 && t.split('\n').length <= 2 && !/[<>{}`]/.test(firstLine)) {
      out.custom = firstLine; out.pick = null; out.decidedAt = c.createdAt;
    }
  }
  return out;
}

export function runUrl() {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = process.env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : '(local run)';
}
