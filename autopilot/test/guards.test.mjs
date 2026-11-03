// node --test autopilot/test/   (no network, no Claude, no GitHub)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, cpSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'sample');
const SLUG = 'what-is-a-fractional-cmo';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(18)]);

const { validatePackage, allowedChange } = await import('../lib/postfiles.mjs');
const { renderMarkdown } = await import('../lib/md.mjs');
const { readDecisions, patchBody, readState, stateBlock, cleanReply } = await import('../lib/github.mjs');
const { redact, findSecrets } = await import('../lib/secrets.mjs');
const { validateOptions } = await import('../pick.mjs');
const { moneyGuard, childEnv, parseJsonResult, fill } = await import('../run-stage.mjs');
const { score } = await import('../keyword-lab.mjs');
const { eligible } = await import('../publish.mjs');
const { previewBase, branchFor } = await import('../write.mjs');
const { fitsFormat, inferFormat, overlap } = await import('../lib/text.mjs');

function pkg(mut = () => {}) {
  const dir = path.join(tmpdir(), `ap-pkg-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(dir, 'content'), { recursive: true });
  cpSync(FIX, path.join(dir, 'content', SLUG), { recursive: true });
  mkdirSync(path.join(dir, 'blog', SLUG), { recursive: true });
  writeFileSync(path.join(dir, 'blog', SLUG, 'cover.webp'), WEBP);
  mut(dir);
  return dir;
}
const errs = (dir, opts) => { const v = validatePackage(dir, opts); rmSync(dir, { recursive: true, force: true }); return v.errors.join(' | '); };

// ---------------------------------------------------------------- file guard
test('a clean package passes', () => assert.equal(errs(pkg()), ''));
test('a path outside the allowlist is refused', () => assert.match(errs(pkg((d) => { mkdirSync(path.join(d, 'js'), { recursive: true }); writeFileSync(path.join(d, 'js', 'site.js'), 'x'); })), /js\/site\.js: path not allowed/));
test('a rendered HTML page in the package is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'blog', SLUG, 'index.html'), '<p>'))), /path not allowed/));
test('posts.json in the package is refused (no edits to other rows)', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'blog', 'posts.json'), '[]'))), /path not allowed/));
test('a <script> in a figure is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'figures', 'x.html'), '<svg><script>alert(1)</script></svg>'))), /forbidden content/));
test('an external URL in a figure is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'figures', 'x.html'), '<img src="https://evil.example/x.png">'))), /forbidden content/));
test('an inline event handler in a figure is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'figures', 'x.html'), '<svg onload="x()"></svg>'))), /forbidden content/));
test('a fake token in the post is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'post.md'), `Hello ghp_${'a'.repeat(36)}\n`))), /credential-shaped/));
test('a <script> in post.md is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'post.md'), '<script>x</script>'))), /forbidden content/));
test('a fake WebP is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'blog', SLUG, 'og.webp'), 'GIF89a'))), /not a real WebP/));
test('two posts in one package are refused', () => assert.match(errs(pkg((d) => cpSync(FIX, path.join(d, 'content', 'another-post'), { recursive: true }))), /exactly one post/));
test('a symlink is refused', () => assert.match(errs(pkg((d) => symlinkSync('/etc/passwd', path.join(d, 'content', SLUG, 'brief.md.link')))), /symlinks/));
test('an oversized file is refused', () => assert.match(errs(pkg((d) => writeFileSync(path.join(d, 'content', SLUG, 'cover.json'), JSON.stringify({ x: 'a'.repeat(5000) })))), /limit/));
test('a slug that is already live is refused', () => {
  const root = path.join(tmpdir(), `ap-root-${Date.now()}`);
  mkdirSync(path.join(root, 'blog'), { recursive: true });
  writeFileSync(path.join(root, 'blog', 'posts.json'), JSON.stringify([{ slug: SLUG, published: true }]));
  assert.match(errs(pkg(), { root }), /already a live post/);
});
test('meta slug must match its folder', () => assert.match(errs(pkg((d) => { const f = path.join(d, 'content', SLUG, 'meta.json'); const m = JSON.parse(readFileSync(f)); m.slug = 'other'; writeFileSync(f, JSON.stringify(m)); })), /does not match/));
test('ship and publish may only change this post and shared lists', () => {
  assert.ok(allowedChange(`autopilot/content/${SLUG}/post.md`, SLUG));
  assert.ok(allowedChange('sitemap.xml', SLUG));
  assert.ok(!allowedChange('js/site.js', SLUG));
  assert.ok(!allowedChange('.github/workflows/autopilot-write.yml', SLUG));
  assert.ok(!allowedChange('autopilot/content/other/post.md', SLUG));
});

// ---------------------------------------------------------------- renderer
test('markdown escapes raw HTML', () => {
  const r = renderMarkdown('Hi <script>alert(1)</script> <img src=x onerror=y>');
  assert.ok(!r.html.includes('<script'));
  assert.ok(!r.html.includes('<img'));
});
test('javascript: and http: links are rejected', () => {
  assert.equal(renderMarkdown('[a](javascript:alert)').errors.length, 1);
  assert.equal(renderMarkdown('[a](http://x.com)').errors.length, 1);
  assert.equal(renderMarkdown('[a](https://x.com)').errors.length, 0);
});
test('external links get nofollow and a new tab', () => assert.match(renderMarkdown('[a](https://x.com)').html, /rel="nofollow noopener noreferrer"/));

// ---------------------------------------------------------------- replies
const c = (body, login = 'owner', createdAt = '2026-11-04T05:00:00Z') => ({ body, author: { login }, createdAt });
test('a plain number is a pick', () => assert.equal(readDecisions([c('3')], ['owner']).pick, 3));
test('a mobile quote reply still finds the number', () => assert.equal(readDecisions([c('> 3. some option\n> more\n\n2')], ['owner']).pick, 2));
test('a short custom keyword is taken', () => assert.equal(readDecisions([c('best crm for startups in india')], ['owner']).custom, 'best crm for startups in india'));
test('comments from anyone else are ignored', () => assert.equal(readDecisions([c('1', 'stranger')], ['owner']).pick, null));
test('hold must be a short reply that starts with the word', () => {
  assert.equal(readDecisions([c('hold')], ['owner']).hold, true);
  assert.equal(readDecisions([c('Hold.')], ['owner']).hold, true);
  assert.equal(readDecisions([c('Goes live at 20:00 IST today unless you reply hold.')], ['owner']).hold, false);
});
test('go lifts a hold', () => assert.equal(readDecisions([c('hold'), c('go')], ['owner']).hold, false));
test('the bot cannot hold its own post', () => assert.equal(readDecisions([c('hold', 'github-actions')], ['owner']).hold, false));
test('cleanReply drops quotes and comments', () => assert.equal(cleanReply('> quoted\n<!-- x -->\n4'), '4'));

// ---------------------------------------------------------------- state block
test('state survives CRLF bodies', () => {
  const body = `text\r\n\r\n${stateBlock({ date: '2026-11-04', stage: 'picked' }).replace(/\n/g, '\r\n')}`;
  assert.equal(readState(body).date, '2026-11-04');
  assert.equal(patchBody(body, { stage: 'writing' }).state.date, '2026-11-04');
});
test('an unreadable state is never overwritten', () => assert.throws(() => patchBody('x\n<!-- autopilot-state\n{broken\n-->', { a: 1 }), /refusing/));
test('a $ in text does not corrupt the state', () => {
  const { body } = patchBody(`x\n\n${stateBlock({ date: 'd' })}`, { angle: 'costs $& and $1 per month' });
  assert.equal(readState(body).angle, 'costs $& and $1 per month');
  assert.equal(readState(body).date, 'd');
});
test('a --> inside state text cannot end the block early', () => {
  const { body } = patchBody(`x\n\n${stateBlock({ date: 'd' })}`, { angle: 'a --> b' });
  assert.equal(readState(body).angle, 'a --> b');
});

// ---------------------------------------------------------------- pick
const cands = [{ id: 'K1', keyword: 'what is a fractional cmo', engines: ['bing', 'google'], engineCount: 2, bestRank: 1 }, { id: 'K2', keyword: 'fractional cmo cost', engines: ['google'], engineCount: 1, bestRank: 2 }];
test('Claude cannot invent or edit keywords', () => {
  const o = validateOptions({ options: [{ id: 'K1', keyword: 'what is a fractional cmo in 2026', angle: 'a', why: 'b' }, { id: 'K9', keyword: 'made up', angle: '', why: '' }, { id: 'K2', keyword: 'Fractional CMO cost', angle: 'x', why: 'y' }] }, cands);
  assert.equal(o[0].id, 'K2');
  assert.ok(o.every((x) => cands.some((cc) => cc.keyword === x.keyword)));
});
test('scoring keeps multi-engine terms and drops covered topics', () => {
  const s = score({
    suggestions: [{ seed: 'seo', engine: 'google', list: ['seo for startups', 'seo checklist'] }, { seed: 'seo', engine: 'bing', list: ['seo for startups'] }],
    format: 'guide', lexicon: ['seo'], seeds: ['seo'], existing: ['SEO checklist'],
  });
  assert.deepEqual(s.map((x) => x.keyword), ['seo for startups']);
});
test('format fit', () => {
  assert.ok(fitsFormat('hubspot vs zoho', 'comparison'));
  assert.ok(!fitsFormat('best digital marketing agencies in delhi', 'listicle'));
  assert.ok(fitsFormat('best crm for startups', 'listicle'));
  assert.equal(inferFormat('semrush vs ahrefs'), 'comparison');
  assert.ok(overlap('brand positioning examples', 'Brand positioning examples for startups') >= 0.75);
});

// ---------------------------------------------------------------- runner
test('money guard stops API-key billing on a subscription setup', () => {
  assert.equal(moneyGuard('subscription', 'none'), null);
  assert.match(moneyGuard('subscription', 'ANTHROPIC_API_KEY'), /money guard/);
  assert.equal(moneyGuard('api', 'ANTHROPIC_API_KEY'), null);
});
test('the Claude process never sees deploy or GitHub credentials', () => {
  const env = childEnv({ PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 't', GITHUB_TOKEN: 'g', GH_TOKEN: 'g', ANTHROPIC_API_KEY: 'k', CLOUDFLARE_API_TOKEN: 'c', ACTIONS_RUNTIME_TOKEN: 'a', BING_WEBMASTER_KEY: 'b' });
  assert.deepEqual(Object.keys(env).filter((k) => !k.startsWith('CLAUDE_CODE_') && k !== 'DISABLE_AUTOUPDATER').sort(), ['PATH']);
  assert.equal(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB, '1');
});
test('final JSON is parsed out of a fenced reply', () => assert.equal(parseJsonResult('```json\n{"a":1}\n```').a, 1));
test('placeholders fill and unknown ones stay', () => assert.equal(fill('{{A}} {{B}}', { A: 'x' }), 'x {{B}}'));

// ---------------------------------------------------------------- secrets, publish, preview
test('secrets are redacted', () => {
  const t = `token ghp_${'b'.repeat(36)} and sk-ant-${'c'.repeat(30)}`;
  assert.equal(findSecrets(t).length, 2);
  assert.ok(!/ghp_|sk-ant-/.test(redact(t)));
});
test('publish skips held posts and future dates', () => {
  const issue = (n, s, comments = []) => ({ number: n, body: stateBlock(s), comments });
  const { ready, holds } = eligible([
    issue(1, { stage: 'drafted', branch: 'b', slug: 's', date: '2026-11-04' }),
    issue(2, { stage: 'drafted', branch: 'b', slug: 's', date: '2026-11-04' }, [c('hold')]),
    issue(3, { stage: 'held', branch: 'b', slug: 's', date: '2026-11-03' }, [c('hold'), c('go')]),
    issue(4, { stage: 'drafted', branch: 'b', slug: 's', date: '2026-11-05' }),
    issue(5, { stage: 'writing', date: '2026-11-04' }),
  ], '2026-11-04', ['owner']);
  assert.deepEqual(ready.map((r) => r.number), [3, 1]);
  assert.deepEqual(holds.map((r) => r.number), [2]);
});
test('preview URL follows the Cloudflare branch alias', () => {
  process.env.CF_PAGES_DOMAIN = 'unbound.pages.dev';
  assert.equal(previewBase(branchFor('2026-11-04', 12)), 'https://ap-20261104-12.unbound.pages.dev');
  delete process.env.CF_PAGES_DOMAIN;
  assert.equal(previewBase('x'), null);
});
