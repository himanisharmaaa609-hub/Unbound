// Git helpers for the ship and publish jobs. Bot commits carry an Automated-by trailer.
import { execFileSync } from 'node:child_process';
import { ROOT } from './day.mjs';
import { runUrl } from './github.mjs';

export const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

export function changedFiles() {
  // Not trimmed: the first status column is often a space, and trimming would shift the path.
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
}

export function commitAs(message) {
  const name = process.env.AUTOPILOT_GIT_NAME || 'github-actions[bot]';
  const email = process.env.AUTOPILOT_GIT_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com';
  git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `${message}\n\nAutomated-by: blog-autopilot\nRun: ${runUrl()}`);
}
