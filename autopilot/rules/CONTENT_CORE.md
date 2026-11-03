# UNBOUND content rulebook

The house rules for every article on weunbound.com/blog. Rule IDs are referenced by the writer prompt and by `lint.mjs`. The lint enforces what a script can check; the writer enforces the rest in its pre-publish checklist.

## F: facts

- **F1.** Every number, percentage, price, date of a release and named statistic traces to an entry in `facts.json` and carries its citation in the sentence, like `[F3]`. Years on their own and list counts in headings are fine.
- **F2.** A fact entry is `{ "id": "F1", "claim": "≤20 words", "quote": "≤40 words copied word for word from the page", "url": "https://...", "title": "page title", "publisher": "who published it", "date": "YYYY-MM-DD or as printed" }`. A script re-downloads every page and checks each quote word for word, so never paraphrase inside `quote`.
- **F3.** Prefer primary sources: the vendor's own docs and pricing pages, official announcements, government data and named research. Use a news report only for news.
- **F4.** For a comparison, check every claimed difference against both vendors' own docs, including whether the other product has a mirror feature. A difference you cannot confirm on both sides does not go in the post.
- **F5.** Prices change. State a price only with its source date, and say it was the listed price on that date.
- **F6.** Facts about the authors and UNBOUND come only from `autopilot/config/author.json`. Nothing else about them is ever written.
- **F7.** No hands-on claims. Never write that the founders or UNBOUND tested, used, reviewed or ran a tool, campaign or product. Never name a client or a client result.

## V: voice

- **V1.** Plain, confident and specific. Write for a founder or marketing lead in India who is busy and smart.
- **V2.** One idea per sentence. Aim for under 20 words on average. 30 words is the soft ceiling and 45 the hard one.
- **V3.** The one-line test: every sentence must make sense read alone. It names its subject instead of leaning on "this", "it" or "they" from the previous sentence.
- **V4.** No em dashes and no en dashes. Use a full stop, a comma, a colon or the word "to".
- **V5.** No idioms, no jargon without an explanation, no hype. Explain an abbreviation the first time it appears, like "search engine optimisation (SEO)". Common ones such as AI, CMO, PR, B2B and D2C are fine.
- **V6.** The banned list in `lint.mjs` (delve, landscape, unlock, leverage, seamless, game-changer, crucial, journey and the rest) never appears. These words make text read as machine-written.
- **V7.** Indian English spelling (optimise, organisation, colour) and Indian context where it helps: rupee prices when a source gives them, Indian platforms and examples.
- **V8.** No "we" for UNBOUND except in the final section that connects the topic to UNBOUND's service. Never address the reader as "dear reader" or close with a sign-off.

## S: structure

- **S1.** The title is the searcher's question or the plain answer to it, at most 60 characters. No vague tails such as "explained" or "and who each fits".
- **S2.** The description is 110 to 165 characters and answers the question in one or two sentences.
- **S3.** The first paragraph answers the title's question directly in two or three sentences. An AI answer engine should be able to quote it on its own.
- **S4.** H2 headings answer the questions searchers ask next: definition, how it works, best options, cost, comparison, mistakes, how to choose. At least four H2s. H3s only inside an H2. No links in headings.
- **S5.** Definitions follow the pattern "X is Y that does Z." Steps are a numbered list, each starting with a verb.
- **S6.** A listicle names tools or platforms, never other agencies. Each pick gets: what it is, who it suits, one standout feature with a source, the listed price with its date if public, and its official homepage link on first mention.
- **S7.** A comparison has at least one table. Tables are Markdown pipe tables, never images, because crawlers and AI answers can read a table but not text inside an image.
- **S8.** A news post says what happened, when, who announced it, and what it changes for a marketer in India. It cites the announcement itself.
- **S9.** FAQ: three to six questions in `meta.json`, each a real follow-up question with a two or three sentence answer. The FAQ is not repeated in `post.md`.
- **S10.** The last H2 connects the topic to how an outsourced marketing team handles it, in at most 120 words, with one link to `/#book` or `/contact/`. No hard sell.

## L: links

- **L1.** Official homepage link on each named product's first mention in the body, never in headings. External links are https only. The renderer adds `nofollow noopener noreferrer` and opens them in a new tab.
- **L2.** Internal links only to `/`, `/team/`, `/contact/`, `/#book`, `/#services`, `/blog/` and live posts listed in `blog/posts.json` with `"published": true`. At least one internal link per post.
- **L3.** No affiliate links and no tracking parameters.

## I: images

- **I1.** Covers and social cards are drawn by a script from `cover.json`. The headline is at most 6 words and the chips are at most 3 short labels.
- **I2.** Listicle and comparison picks get a homepage screenshot: list them in `shots.json` as `{ "key", "name", "url", "alt" }` and put `{{SHOT:key}}` on its own line after the pick's first paragraph. Screenshots are taken by a script and never faked.
- **I3.** Optional diagrams: `figures/<name>.html` (a small inline SVG or HTML snippet, under 20 KB, no scripts, no external links, no images from the web) plus `figures/<name>.json` with `alt` and `caption`. Place `{{FIG:name}}` on its own line. Use the site colours: ink #0A0A0B, flame #FF4A1C, violet #4F2BF5, saffron #FFC23A, lilac #CBBEFF, mint #2DD4A7, grey line #E6E6E2.
- **I4.** Charts only for news posts with sourced numbers: `figures/<name>.chart.json` with `title`, `unit`, `alt`, `caption` and `bars: [{ "label", "value", "fact": "F2" }]`. A script draws the bars to scale. A paragraph under each chart explains what it shows.
- **I5.** Every image has descriptive alt text of at least 20 characters.

## M: metadata

- **M1.** `meta.json`: `slug`, `title`, `description`, `category` (Guide, Listicle, Comparison or News), `format`, `keyword`, `coverAlt`, `faq`, optional `cta: { heading, text }`.
- **M2.** The slug is the keyword in lowercase words joined by hyphens, at most 60 characters, without stop words where possible.
