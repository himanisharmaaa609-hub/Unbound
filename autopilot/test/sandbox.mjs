// Makes a throwaway copy of the site for tests: node test/sandbox.mjs <dir>
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function makeSandbox(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ['index.html', 'llms.txt', 'sitemap.xml', 'robots.txt', 'contact', 'team', 'css', 'js', 'assets/logo-512.png', 'assets/favicon.svg', 'favicon.ico', 'blog']) {
    try { cpSync(path.join(repo, f), path.join(dir, f), { recursive: true }); } catch {}
  }
  mkdirSync(path.join(dir, 'autopilot', 'content'), { recursive: true });
  mkdirSync(path.join(dir, 'blog'), { recursive: true });
  return dir;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(makeSandbox(process.argv[2]));
