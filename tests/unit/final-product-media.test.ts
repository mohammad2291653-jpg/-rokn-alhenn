import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from '../../config/final-product-media-2026-10-29.json';

const expectedSlugs = [
  'ground-henna', 'sidr-powder', 'integrated-henna',
  'dark-color-powder', 'red-mashat-mask', 'red-mashat-powder', 'sidr-mask',
];

describe('owner approved original JPEGs', () => {
  it('contains seven unique mappings and no old public catalog media', () => {
    expect(manifest.images).toHaveLength(7);
    expect(manifest.images.map(x => x.slug).sort()).toEqual([...expectedSlugs].sort());
    expect(new Set(manifest.images.map(x => x.url)).size).toBe(7);
    expect(existsSync('public/catalog-media/2026-10-29')).toBe(false);
    expect(readdirSync('public/final-product-images/2026-10-29').sort()).toEqual(manifest.images.map(x => x.file).sort());
  });

  it('serves original image files without edits, compression, or resolution loss', async () => {
    for (const photo of manifest.images) {
      const path = 'public' + photo.url;
      const bytes = readFileSync(path);
      expect(bytes.length).toBe(photo.sizeBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256);
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(1122);
      expect(meta.height).toBe(1402);
    }
  });
});
