// Credential-shaped text: scan and redact. Applied to every Claude output before it reaches an issue or the repo.
const PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|CLOUDFLARE_API_TOKEN|BING_WEBMASTER_KEY)\s*[=:]\s*\S{8,}/g,
];

export function findSecrets(text) {
  const hits = [];
  for (const re of PATTERNS) for (const m of String(text).matchAll(re)) hits.push(m[0].slice(0, 8) + '…');
  return hits;
}

export function redact(text) {
  let out = String(text ?? '');
  for (const re of PATTERNS) out = out.replace(re, () => '[redacted]');
  return out;
}
