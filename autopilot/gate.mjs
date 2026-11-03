#!/usr/bin/env node
// Cheap "anything to do?" check that runs before any install or Claude call.
// node autopilot/gate.mjs pick [--format <fmt>] [--extra true]   (--extra opens one more issue for today)
import { today, formatFor, setOutput } from './lib/day.mjs';
import { findIssuesForDate } from './lib/github.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
const stage = process.argv[2];
const date = today();

if (stage === 'pick') {
  const forced = arg('format');
  const extra = arg('extra') === 'true';
  const format = forced || formatFor(date);
  if (!format) { setOutput('go', 'false'); console.log(`no post format scheduled for ${date}`); process.exit(0); }
  const existing = findIssuesForDate(date);
  if (existing.length && !forced && !extra) {
    setOutput('go', 'false'); console.log(`issue #${existing[0].number} already exists for ${date}`); process.exit(0);
  }
  setOutput('go', 'true');
  setOutput('format', format);
  setOutput('date', date);
  setOutput('slot', String(existing.length + 1));
} else {
  console.error('usage: gate.mjs pick'); process.exit(2);
}
