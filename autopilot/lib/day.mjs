// Clock, config and paths. All dates are in the site's timezone (budget.json).
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const AP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// AUTOPILOT_ROOT lets tests run against a temporary copy of the site.
export const ROOT = process.env.AUTOPILOT_ROOT ? path.resolve(process.env.AUTOPILOT_ROOT) : path.resolve(AP, '..');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const config = (name) => readJson(path.join(AP, 'config', `${name}.json`));

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Date parts in the configured timezone. `now` can be overridden with AUTOPILOT_NOW for tests.
export function localParts(now = process.env.AUTOPILOT_NOW ? new Date(process.env.AUTOPILOT_NOW) : new Date()) {
  const tz = config('budget').timezone;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hm: `${p.hour}:${p.minute}`,
    weekday: p.weekday.toLowerCase().slice(0, 3),
  };
}

export const today = () => localParts().date;

export function weekdayOf(date) {
  return DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

export function formatFor(date = today()) {
  return config('budget').formats[weekdayOf(date)] || null;
}

export function isPast(hm) {
  return localParts().hm >= hm;
}

export function dayOfYear(date = today()) {
  const d = new Date(`${date}T00:00:00Z`);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
}

// Per-run working folder, never committed.
export function runDir(stage, date = today()) {
  const dir = path.join(ROOT, 'autopilot', '.runs', date, stage);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function setOutput(key, value) {
  const line = `${key}<<__AP__\n${value ?? ''}\n__AP__\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  console.log(`[output] ${key}=${String(value ?? '').slice(0, 200)}`);
}
