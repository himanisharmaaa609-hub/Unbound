#!/usr/bin/env node
// Free keyword research. node autopilot/keyword-lab.mjs daily --format <fmt> [--out <dir>]
// Writes candidates.json (everything, with sources and fetch times) and digest.md (small, for Claude).
// Rule: every number the owner sees comes from this script, with a source and a date. Claude never types a number.
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config, today, dayOfYear, runDir, ROOT, readJson } from './lib/day.mjs';
import { googleNews, googleTrends, hackerNews, redditTop, autocomplete, bingKeywordStats, ENGINES } from './lib/sources.mjs';
import { normalize, overlap, fitsFormat, onTopic, tokens } from './lib/text.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

export function livePostTitles() {
  const out = [];
  const posts = path.join(ROOT, 'blog', 'posts.json');
  if (existsSync(posts)) for (const p of readJson(posts)) out.push(p.title, p.keyword);
  const queue = path.join(ROOT, 'autopilot', 'state', 'queue.json');
  if (existsSync(queue)) for (const q of readJson(queue)) out.push(q.keyword, q.title);
  return out.filter(Boolean);
}

// Pure scoring step, testable without network.
export function score({ suggestions, format, lexicon, seeds, existing }) {
  const map = new Map();
  for (const { seed, engine, list } of suggestions) {
    list.forEach((s, rank) => {
      const k = normalize(s);
      if (!k) return;
      const e = map.get(k) || { keyword: k, engines: new Set(), bestRank: 99, seen: 0, seed };
      e.engines.add(engine); e.bestRank = Math.min(e.bestRank, rank + 1); e.seen++;
      map.set(k, e);
    });
  }
  const seedWords = new Set(seeds.flatMap(tokens));
  return [...map.values()]
    .filter((e) => e.engines.size >= 2 || normalize(e.keyword).includes(normalize(e.seed)))
    .filter((e) => fitsFormat(e.keyword, format))
    .filter((e) => onTopic(e.keyword, lexicon) || tokens(e.keyword).some((w) => seedWords.has(w)))
    .filter((e) => !existing.some((t) => overlap(e.keyword, t) >= 0.75))
    .sort((a, b) => b.engines.size - a.engines.size || a.bestRank - b.bestRank || b.seen - a.seen)
    .map((e) => ({ keyword: e.keyword, engines: [...e.engines].sort(), engineCount: e.engines.size, bestRank: e.bestRank, seen: e.seen, seed: e.seed }));
}

export async function runLab({ format, out, date = today(), log = console.error }) {
  const niche = config('niche');
  const market = niche.market;
  const fetchedAt = new Date().toISOString();

  // 1. Trend sweep, last 48 hours
  log('trends: news, google trends, hacker news, reddit');
  const trends = [];
  for (const q of niche.newsQueries) trends.push(...await googleNews(q, { hl: market.hl, gl: market.gl, ceid: market.newsCeid }));
  trends.push(...(await googleTrends(market.trendsGeo)).filter((t) => onTopic(t.title, niche.lexicon)));
  trends.push(...(await hackerNews(niche.hnMinPoints)).filter((t) => onTopic(t.title, niche.lexicon)));
  trends.push(...(await redditTop(niche.subreddits)).filter((t) => onTopic(t.title, niche.lexicon)));
  const seenT = new Set();
  const trendItems = trends.filter((t) => { const k = normalize(t.title); if (!k || seenT.has(k)) return false; seenT.add(k); return true; })
    .slice(0, 40).map((t, i) => ({ id: `T${i + 1}`, ...t, fetchedAt }));

  // 2. Seeds for today: rotate through the list so each day asks different questions
  let seeds;
  const pool = niche.seeds[format] || [];
  if (format === 'news') {
    const fresh = pool.filter((s) => trendItems.some((t) => normalize(t.title).includes(normalize(s))));
    seeds = (fresh.length ? fresh : pool).slice(0, niche.seedsPerDay);
  } else {
    const start = (dayOfYear(date) * niche.seedsPerDay) % Math.max(pool.length, 1);
    seeds = Array.from({ length: Math.min(niche.seedsPerDay, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
  }

  // 3. Autocomplete fan-out
  const mods = (niche.modifiers[format] || []).slice(0, niche.modifiersPerSeed);
  const suggestions = [];
  const queries = [];
  for (const seed of seeds) {
    const qs = [seed, ...mods.map((m) => (['vs', 'or', 'for', 'alternative', 'update', 'difference'].includes(m) ? `${seed} ${m}` : `${m} ${seed}`))];
    for (const q of qs) {
      queries.push(q);
      const res = await autocomplete(q, market);
      for (const e of ENGINES) suggestions.push({ seed, engine: e, list: res[e] || [] });
    }
  }
  log(`autocomplete: ${queries.length} queries x ${ENGINES.length} engines`);

  // 4. Score, filter, cap
  let candidates = score({ suggestions, format, lexicon: niche.lexicon, seeds, existing: livePostTitles() }).slice(0, 40);
  const bingKey = process.env.BING_WEBMASTER_KEY;
  if (bingKey) for (const c of candidates.slice(0, 15)) { c.bing = await bingKeywordStats(c.keyword, bingKey); }
  candidates = candidates.map((c, i) => ({ id: `K${i + 1}`, ...c, fetchedAt }));

  const engineHealth = Object.fromEntries(ENGINES.map((e) => [e, suggestions.filter((s) => s.engine === e && s.list.length).length]));
  const data = { date, format, fetchedAt, seeds, queries, engineHealth, candidates, trends: trendItems };
  writeFileSync(path.join(out, 'candidates.json'), JSON.stringify(data, null, 2));
  writeFileSync(path.join(out, 'digest.md'), digest(data));
  return data;
}

export function digest(d) {
  const lines = [
    `# Keyword digest, ${d.date} (format: ${d.format})`,
    '',
    `Fetched ${d.fetchedAt}. Seeds: ${d.seeds.join('; ')}.`,
    `Engines answering: ${Object.entries(d.engineHealth).map(([e, n]) => `${e} ${n}`).join(', ')}.`,
    '',
    '## Keyword candidates',
    'id | keyword | engines agreeing | best rank | seen | bing impressions',
    '---|---|---|---|---|---',
    ...d.candidates.slice(0, 25).map((c) => `${c.id} | ${c.keyword} | ${c.engineCount} (${c.engines.join(', ')}) | ${c.bestRank} | ${c.seen} | ${c.bing?.impressions ?? '-'}`),
    '',
    '## Trend items, last 48 hours',
    ...d.trends.slice(0, 15).map((t) => `- ${t.id}: ${t.title} (${t.source}${t.published ? `, ${t.published}` : ''})`),
    '',
  ];
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const format = arg('format');
  if (process.argv[2] !== 'daily' || !format) { console.error('usage: keyword-lab.mjs daily --format <guide|listicle|comparison|news> [--out dir]'); process.exit(2); }
  const out = arg('out') || runDir('pick');
  runLab({ format, out }).then((d) => {
    console.log(JSON.stringify({ out, candidates: d.candidates.length, trends: d.trends.length, engineHealth: d.engineHealth }));
    if (d.candidates.length < 5) { console.error('fewer than 5 candidates: sources may be blocked'); process.exit(3); }
  }).catch((e) => { console.error(e); process.exit(1); });
}
