// Query normalising, format fit and overlap scoring.
const STOP = new Set('a an the and or of for to in on with your you is are what how why best top vs which do does can i my me it its by from at as be this that'.split(' '));

export const normalize = (q) => String(q || '').toLowerCase()
  .replace(/[’']/g, '').replace(/[^a-z0-9+#.\s-]/g, ' ').replace(/\s+/g, ' ').trim();

export const tokens = (q) => normalize(q).split(' ').filter((w) => w && !STOP.has(w));

export function overlap(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}

export function slugify(s, max = 60) {
  let out = normalize(s).replace(/[+#.]/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (out.length > max) out = out.slice(0, max).replace(/-[^-]*$/, '');
  return out;
}

export function inferFormat(keyword, fallback) {
  const k = normalize(keyword);
  if (/\b(vs|versus)\b/.test(k)) return 'comparison';
  if (/^(best|top)\b|\b(best|top) \d|\btools\b|\balternatives?\b|\bplatforms\b|\bapps\b/.test(k)) return 'listicle';
  return fallback || 'guide';
}

export function fitsFormat(keyword, format) {
  const k = normalize(keyword);
  const words = k.split(' ');
  if (words.length < 2 || words.length > 9) return false;
  switch (format) {
    case 'comparison': return /\b(vs|versus)\b/.test(k) && k.split(/\b(?:vs|versus)\b/).every((s) => s.trim().length > 1);
    case 'listicle': return !/\bvs\b/.test(k) && /\b(best|top|tools|alternatives?|platforms|apps|software|agencies)\b/.test(k) && !/\bagenc(y|ies)\b/.test(k);
    case 'guide': return !/\bvs\b/.test(k) && !/^(best|top)\b/.test(k) && !/\b(login|price list|near me|jobs?|salary|course|pdf|download)\b/.test(k);
    case 'news': return !/\bvs\b/.test(k);
    default: return true;
  }
}

export const onTopic = (text, lexicon) => {
  const t = ` ${normalize(text)} `;
  return lexicon.some((w) => t.includes(` ${normalize(w)} `) || t.includes(` ${normalize(w)}s `));
};

export const words = (s) => (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g) || []).length;
