// fetch with a timeout and a polite user agent. Never throws: returns { ok, status, text, error }.
export const UA = 'Mozilla/5.0 (compatible; UNBOUND-blog-autopilot/1.0; +https://weunbound.com)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, { timeoutMs = 15000, headers = {}, method = 'GET', body } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method, body, signal: ctl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, 'accept-language': 'en-IN,en;q=0.9', ...headers },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url: res.url };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, opts);
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.text) }; } catch { return { ...r, ok: false, json: null, error: 'bad json' }; }
}
