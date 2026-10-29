import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

// Offline preparation only. Keep source JPEGs and existing 1600px WebP files
// untouched; the free host only serves the checked-in responsive derivatives.
const manifest = JSON.parse(await readFile('config/catalog-media-review-2026-10-29.json', 'utf8'));
const directory = 'public/catalog-media/2026-10-29/responsive';
const widths = [320, 640, 960];
await mkdir(directory, { recursive: true });
let count = 0;
for (const image of manifest.images) {
  const photo = /^\/catalog-media\/2026-10-29\/(page-(?:0[1-9]|1[0-9]|2[0-6]))\.webp$/.exec(image.url);
  if (!photo || image.originalKey !== `product-assets/originals/2026-10-29/${photo[1]}.jpeg`) throw new Error('Unexpected source media path.');
  const bytes = await readFile(image.originalKey);
  if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error('Original media checksum mismatch.');
  for (const width of widths) {
    await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 92 }).toFile(`${directory}/${photo[1]}-${width}.webp`);
    count++;
  }
}
console.log(`Prepared ${count} responsive photo derivatives without crop, recoloring or rewritten labels; original files unchanged.`);
