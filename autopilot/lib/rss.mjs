// Small RSS/Atom item parser. Enough for Google News, Google Trends and Reddit feeds.
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&')
  .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

export function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  for (const m of xml.matchAll(re)) {
    const b = m[0];
    let link = tag(b, 'link');
    if (!link) { const l = b.match(/<link[^>]*href="([^"]+)"/i); link = l ? decode(l[1]) : ''; }
    items.push({
      title: tag(b, 'title').replace(/<[^>]+>/g, ''),
      link,
      published: tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published'),
      source: tag(b, 'source'),
      traffic: tag(b, 'ht:approx_traffic'),
    });
  }
  return items;
}
