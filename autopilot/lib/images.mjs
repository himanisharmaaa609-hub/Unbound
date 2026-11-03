// Shared image helpers: one browser, PNG -> WebP under a size cap.
import sharp from 'sharp';
import { chromium } from 'playwright';

export async function launch() {
  return chromium.launch({ args: ['--font-render-hinting=none'] });
}

// Encode to WebP at `width`, lowering quality until the file is under maxKB.
export async function toWebp(buf, { width, maxKB = 100 } = {}) {
  let img = sharp(buf);
  if (width) img = img.resize({ width, withoutEnlargement: true });
  const base = await img.png().toBuffer();
  for (const q of [82, 74, 66, 58, 50, 42, 34]) {
    const out = await sharp(base).webp({ quality: q, effort: 5 }).toBuffer();
    if (out.length <= maxKB * 1024) return out;
  }
  return sharp(base).resize({ width: Math.round((width || 1200) * 0.8) }).webp({ quality: 40 }).toBuffer();
}

export const isWebp = (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
