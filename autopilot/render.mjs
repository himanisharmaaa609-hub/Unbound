#!/usr/bin/env node
// node autopilot/render.mjs [--drafts]     rebuild every blog file from the sources
// node autopilot/render.mjs post <slug> [--drafts]
import { renderAll, renderPost } from './lib/render.mjs';
const args = process.argv.slice(2);
const drafts = args.includes('--drafts');
try {
  if (args[0] === 'post') {
    const r = renderPost(args[1], { drafts });
    console.log(JSON.stringify({ ok: true, ...r }, null, 2));
  } else {
    const r = renderAll({ drafts });
    console.log(JSON.stringify({ ok: true, posts: r.map((x) => ({ slug: x.slug, missingImages: x.missing })) }, null, 2));
  }
} catch (e) {
  console.error(`render failed: ${e.message}`);
  process.exit(1);
}
