// Free keyword and trend sources. Public but unofficial endpoints: keep queries few and spaced.
// Every function returns [] on failure, so one blocked source never stops the run.
import { fetchText, fetchJson, sleep } from './net.mjs';
import { parseFeed } from './rss.mjs';

const enc = encodeURIComponent;

// ---------- trends (last 48 hours)
export async function googleNews(q, { hl = 'en-IN', gl = 'IN', ceid = 'IN:en' } = {}) {
  const r = await fetchText(`https://news.google.com/rss/search?q=${enc(`${q} when:2d`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`);
  return r.ok ? parseFeed(r.text).slice(0, 15).map((i) => ({ title: i.title, url: i.link, published: i.published, source: `Google News: ${i.source || 'news'}` })) : [];
}

export async function googleTrends(geo = 'IN') {
  const r = await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
  return r.ok ? parseFeed(r.text).map((i) => ({ title: i.title, url: `https://trends.google.com/trending?geo=${geo}`, published: i.published, source: `Google Trends ${geo}${i.traffic ? ` (${i.traffic} searches)` : ''}` })) : [];
}

export async function hackerNews(minPoints = 80) {
  const since = Math.floor(Date.now() / 1000) - 2 * 86400;
  const r = await fetchJson(`https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${since},points>${minPoints}&hitsPerPage=60`);
  return (r.json?.hits || []).map((h) => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, published: h.created_at, source: `Hacker News (${h.points} points)` }));
}

export async function redditTop(subs) {
  const out = [];
  for (const sub of subs) {
    const r = await fetchText(`https://www.reddit.com/r/${enc(sub)}/top/.rss?t=day`, { headers: { accept: 'application/atom+xml' } });
    if (r.ok) out.push(...parseFeed(r.text).slice(0, 10).map((i) => ({ title: i.title, url: i.link, published: i.published, source: `Reddit r/${sub}` })));
    await sleep(6000);
  }
  return out;
}

// ---------- autocomplete (4 engines)
const suggest = {
  async google(q, m) {
    const r = await fetchJson(`https://suggestqueries.google.com/complete/search?client=firefox&hl=${m.hl}&gl=${m.gl}&q=${enc(q)}`);
    return Array.isArray(r.json?.[1]) ? r.json[1] : [];
  },
  async youtube(q, m) {
    const r = await fetchJson(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=${m.hl}&gl=${m.gl}&q=${enc(q)}`);
    return Array.isArray(r.json?.[1]) ? r.json[1] : [];
  },
  async bing(q, m) {
    const r = await fetchJson(`https://api.bing.com/osjson.aspx?market=${m.hl}&query=${enc(q)}`);
    return Array.isArray(r.json?.[1]) ? r.json[1] : [];
  },
  async duckduckgo(q) {
    const r = await fetchJson(`https://duckduckgo.com/ac/?type=list&q=${enc(q)}`);
    return Array.isArray(r.json?.[1]) ? r.json[1] : Array.isArray(r.json) ? r.json.map((x) => x.phrase).filter(Boolean) : [];
  },
};
export const ENGINES = Object.keys(suggest);

export async function autocomplete(q, market, gapMs = 350) {
  const out = {};
  for (const e of ENGINES) {
    try { out[e] = (await suggest[e](q, market)).map(String).slice(0, 10); } catch { out[e] = []; }
    await sleep(gapMs);
  }
  return out;
}

// ---------- optional real volume: Bing Webmaster Tools (free key, verified site)
export async function bingKeywordStats(q, key) {
  if (!key) return null;
  const r = await fetchJson(`https://ssl.bing.com/webmaster/api.svc/json/GetKeywordStats?q=${enc(q)}&country=in&language=en-IN&apikey=${enc(key)}`);
  const rows = r.json?.d;
  if (!Array.isArray(rows) || !rows.length) return null;
  const last = rows[rows.length - 1];
  return { impressions: last.BroadImpressions ?? last.Impressions ?? null, period: last.Date || null, source: 'Bing Webmaster Tools' };
}
