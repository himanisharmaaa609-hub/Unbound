# Blog autopilot for weunbound.com

A daily, unattended blog bot. It runs on GitHub Actions with Claude Code. Your laptop does not need to be on.

## Your day

| Time (IST) | What happens | What you do |
|---|---|---|
| 09:00 | An issue "autopilot YYYY-MM-DD: pick today's …" opens with 5 keyword options and their evidence. GitHub Mobile sends a push notification. | Reply `1` to `5`, or type your own keyword. |
| 13:00 | No reply yet? Option 1 is used. | Nothing. |
| About an hour after the pick | A comment brings the preview link, a fact-check summary and open items. | Read the preview. |
| Before 20:00 | | Reply `hold` to stop the release. `go` lifts a hold. |
| 20:00 | The post goes live on weunbound.com/blog, search engines are notified, the issue closes. | Nothing. |
| Any failure | The bot comments with the run link. Nothing goes live. | Reply the number again, or re-run from the Actions tab. |

Formats by weekday: Monday to Wednesday guide, Thursday news, Friday listicle, Saturday comparison, Sunday listicle. Change them in `config/budget.json`.

## How it works

```
09:00 autopilot pick           reply or 13:00: autopilot write                    20:00 autopilot publish
gate -> keyword lab (free)  ->  prepare (issue) -> draft (Claude token only)   ->  decide (honours hold)
-> Claude picks 5 options       -> verify (no secrets: images, lint, build)        -> take the draft from its branch,
-> issue with evidence          -> ship (push branch, Cloudflare preview,             re-check, flip to published,
                                   quote check, comment)                              push main, check live URL,
                                                                                      IndexNow, close issue
```

- **Scripts do everything deterministic.** Claude only picks the options and writes the post.
- **The GitHub issue is the inbox and the database.** Your comments are the input. A hidden JSON block in the issue body holds the state.
- **Cloudflare Pages does the deploys.** A pushed branch becomes a preview at `https://<branch>.<CF_PAGES_DOMAIN>`. A push to `main` is the production deploy. No deploy token is needed.
- **Claude never shares a runner with a credential that can push.** The draft job has only the Claude token, and the Claude process gets a scrubbed environment. The jobs that push run no code Claude wrote.
- **Claude never writes page code.** It writes Markdown and JSON. `lib/render.mjs` turns them into HTML and escapes every character, so a post cannot carry a script. Diagrams render with JavaScript off and the network blocked.

## Files

```
config/budget.json     model, effort, caps, schedule, formats, word budgets, owner
config/niche.json      seeds, on-topic words, news queries, subreddits
config/author.json     the ONLY source of facts about the founders and UNBOUND
config/scenes.json     cover backgrounds (rotated)
config/indexnow.json   public IndexNow key (the key file sits at the site root)
prompts/               pick.md, write.md, house-overrides.md
rules/CONTENT_CORE.md  the house rulebook the writer follows
lib/                   clock, GitHub issues, sources, Markdown, renderer, guards, secrets, images, git
gate.mjs  keyword-lab.mjs  pick.mjs  run-stage.mjs  write.mjs  collect.mjs  apply.mjs
image.mjs  shots.mjs  figures.mjs  lint.mjs  quotes.mjs  render.mjs  publish.mjs  preflight.mjs
content/<slug>/        post sources (Markdown + JSON), committed when a post goes live
state/queue.json       publish history
test/                  guard tests and the sample post
LEARNINGS.md           every blocker, its cost and its fix: read before changing the bot
```

The blog lives at `/blog/`. Rows in `blog/posts.json` carry `"published": true|false`. The production build only shows published rows. Drafts render on their preview branch with a "Draft preview" bar and `noindex`. The "Insights" nav and footer links appear on their own once the first post is live.

## One-time setup (you do these by hand)

1. **Claude login.** On your computer run `claude setup-token`, then add the token as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN` (Settings, Secrets and variables, Actions). This uses your Claude subscription. Check Anthropic's current terms for automated use on a subscription. The alternative is an API key billed per token: set `"auth": "api"` in `config/budget.json` and add `ANTHROPIC_API_KEY` instead.
2. **Preview links.** In Cloudflare, open the Pages project and copy its `*.pages.dev` address. Add it as a repository **variable** named `CF_PAGES_DOMAIN`, for example `unbound-abc.pages.dev`. Make sure preview deployments are on for all branches (the default).
3. **Workflow permissions.** Settings, Actions, General, Workflow permissions: choose **Read repository contents**. Each job asks for what it needs.
4. **Notifications.** Install GitHub Mobile, Watch this repository, and turn on push notifications for mentions.
5. **Money guards.** On claude.ai, turn **Extra usage off**. On GitHub, set the Actions spending limit to **$0**.
6. **Optional real search volume.** Verify weunbound.com in Bing Webmaster Tools, create an API key, and add it as the secret `BING_WEBMASTER_KEY`.
7. **Turn off GitHub Pages** (Settings, Pages) now that Cloudflare hosts the site.
8. **Consider making the repository private.** It is public today, so the daily issues and the bot's prompts are public too. A private repository gets 2,000 free Actions minutes a month. The bot uses about 25 minutes a day.
9. **Run "autopilot check"** from the Actions tab once, with the Claude box ticked. Every line should say PASS.

## Running things by hand

- **autopilot pick:** `dry` prints the issue without opening it. `format` forces a format. `extra` opens a second issue for today.
- **autopilot write:** `issue` and `pick` force an option. `reuse_run` finishes a draft saved by an earlier run with no Claude call.
- **autopilot publish:** `dry` builds and checks without pushing.
- **autopilot check:** health check.

Locally, with no Claude call and no network:

```
cd autopilot && npm ci && node --test test/*.test.mjs
node autopilot/lint.mjs autopilot/test/fixtures/sample
node autopilot/render.mjs --drafts
```

## Costs (estimates)

The caps live in `config/budget.json`: pick 12 turns, $2.50 and 15 minutes; write 90 turns, $9 and 75 minutes. On a subscription these dollar caps are a usage brake in API-equivalent dollars, not a charge. Each preview comment shows what the writer used.
