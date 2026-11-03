# Learnings

Every blocker, what it cost and the fix. Read this before changing the bot, and add a row for every new blocker.

## Adapting the blueprint to this site

The blueprint was written for an Astro site on Vercel. weunbound.com is plain HTML on Cloudflare Pages, so:

| Blueprint | Here | Why |
|---|---|---|
| Vercel CLI preview and production deploys, `VERCEL_TOKEN` | Push a branch for the preview, push `main` for production | Cloudflare Pages builds every push through its GitHub app. No deploy credential exists anywhere in the workflows. |
| Push master only after the live URL answers | Push main, then poll the live URL for 8 minutes | The push is the deploy. A failed poll comments on the issue instead of closing it. |
| Astro page per post, Claude edits the page | Claude writes Markdown + JSON; `lib/render.mjs` builds the HTML | The site has no build step, and Claude never writing page code removes a whole class of injection risks. |
| Draft flag + `BLOG_DRAFTS=1` | `published` on each row in `blog/posts.json`; `render.mjs --drafts` | Same idea, script-only. |
| Merge the draft branch at publish | Rebuild a package from the branch's source files, re-check it, render on main | No merge conflicts on shared lists, and the branch's HTML is never trusted. |
| Images rendered in the draft job | Images rendered in the verify job (no secrets, pristine scripts) | Claude never shares a runner with the scripts that make images. |
| Vercel Hobby needs the owner's git identity | Bot commits as github-actions[bot] with an `Automated-by` trailer | Cloudflare Pages has no commit-author rule. |
| Vendored third-party writing skills | `rules/CONTENT_CORE.md` and the banned list in `lint.mjs` cover the same ground | Avoids copying unreviewed third-party files into a bot that runs unattended. |
| `--permission-mode auto` | `--permission-mode dontAsk` | Only the listed tools run; anything else is refused without a prompt. |
| Listicles name companies | Listicles name tools and platforms, never rival agencies | An agency blog should not rank its competitors. |

## Blockers

| Date | Blocker | Cost | Fix |
|---|---|---|---|
| 2026-11-03 | `git status --porcelain` output was trimmed before parsing, so the first path lost its first letter (`ontact/index.html`) and every publish would have been refused | Caught in the local end-to-end run | Parse the raw output (`lib/gitops.mjs`) |
| 2026-11-03 | The file guard used `statSync`, which follows symlinks, so a symlink passed as a normal file | Caught by a guard test | `lstatSync` |
| 2026-11-03 | `sk-ant-` keys matched two secret patterns | Caught by a guard test | The generic `sk-` pattern skips `sk-ant-` |
| 2026-11-03 | Importing `pick.mjs` or `write.mjs` from another script ran its command line | Caught by the tests | Every entry point checks `import.meta.url` before running |
| 2026-11-03 | The overlap filter divided by the shorter phrase, so "how to do brand positioning" counted as covered by any post about brand positioning | Caught in a scoring test | Divide by the longer phrase |
| 2026-11-03 | The lint merged list items into the previous sentence and reported 45-word sentences that did not exist | Caught on the sample post | Split paragraphs and list items before sentences |

## Inherited from the blueprint (already handled)

- One concurrency group per issue for the write workflow.
- CRLF-tolerant state reader; refuse to overwrite an unreadable state block; replacer functions in `String.replace`.
- Quoted lines stripped before parsing replies; a hold must be a short reply that starts with the word.
- `--setting-sources project,local --strict-mcp-config` on every headless Claude run.
- Bash sandbox needs bubblewrap, socat and unprivileged user namespaces on the runner.
- One writer agent, no subagents; quote-only WebFetch; research limits in `budget.json`.
- `run-stage` refuses to call Claude for a pick with no digest.
- Cover scenes reserved in the issue state so parallel posts never share one.
- The author's facts come only from `config/author.json`.

## Costs

| Date | Stage | Turns | API-equivalent | Minutes | Notes |
|---|---|---|---|---|---|
| | | | | | Fill in from the preview comments after the first real days. |
