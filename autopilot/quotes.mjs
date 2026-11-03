#!/usr/bin/env node
// Re-downloads every source in facts.json and checks each quote appears word for word.
// node autopilot/quotes.mjs <factsFile> [--json]
import { readFileSync } from 'node:fs';
import { fetchText, sleep } from './lib/net.mjs';

const norm = (s) => String(s).toLowerCase()
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&#x27;/g, "'").replace(/&[a-z]+;/g, ' ')
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

export async function checkQuotes(facts) {
  const pages = new Map();
  const out = [];
  for (const f of facts) {
    if (!pages.has(f.url)) { pages.set(f.url, await fetchText(f.url, { timeoutMs: 20000 })); await sleep(500); }
    const page = pages.get(f.url);
    if (!page.ok) { out.push({ id: f.id, status: 'unreachable', detail: page.status || page.error }); continue; }
    const hay = norm(page.text);
    const needle = norm(f.quote).replace(/^"|"$/g, '');
    if (hay.includes(needle)) { out.push({ id: f.id, status: 'verified' }); continue; }
    // Allow a match of the quote's longest run of 8 words, for pages that split text across tags.
    const w = needle.split(' ');
    let part = false;
    for (let i = 0; i + 8 <= w.length && !part; i++) part = hay.includes(w.slice(i, i + 8).join(' '));
    out.push({ id: f.id, status: part ? 'partial' : 'not found' });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const facts = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  checkQuotes(facts).then((r) => console.log(JSON.stringify(r, null, 2)));
}
