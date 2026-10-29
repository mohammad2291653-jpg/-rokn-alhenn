import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../src/lib/db', () => ({ db: {} }));
import { parseCatalogMediaReview } from '../../src/lib/catalog-media-review';

const manifest: unknown = JSON.parse(readFileSync(new URL('../../config/catalog-media-review-2026-10-29.json', import.meta.url), 'utf8'));
const validImage = {
  page: 1,
  url: '/catalog-media/2026-10-29/page-01.webp',
  originalKey: 'product-assets/originals/2026-10-29/page-01.jpeg',
  sha256: 'a'.repeat(64),
  width: 2016,
  height: 3024,
};

function reviewWithImages(images: unknown) {
  return parseCatalogMediaReview({ products: [], unassigned: [], images });
}

describe('private catalog media review parser trust boundaries', () => {
  it('retains the genuine 26-image manifest and the owner-resolved Sidr/red Mashat mappings', () => {
    const parsed = parseCatalogMediaReview(manifest);
    expect(parsed).not.toBeNull();
    expect(parsed?.invalidRecords).toBe(false);
    expect(parsed?.products).toHaveLength(7);
    expect(parsed?.images).toHaveLength(26);
    const sidr = parsed?.products.find((product) => product.slug === 'sidr-mask');
    expect(sidr?.usageConflict?.status).toBe('RESOLVED');
    expect(sidr?.usageConflict?.ownerResolution).toContain('ساعة إلى ساعتين');
    expect(sidr?.usageConflict?.sources.map((source) => source.page)).toEqual([4, 9]);
    expect(parsed?.products.find((product) => product.slug === 'red-mashat-mask')?.pages).toEqual([21, 15, 17, 19]);
    expect(parsed?.products.find((product) => product.slug === 'red-mashat-powder')?.pages).toEqual([2]);
    expect(parsed?.products.some((product) => product.slug.includes('green-mashat'))).toBe(false);
    expect(parsed?.unassigned.flatMap((group) => group.pages)).toEqual([20, 22]);
  });

  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml,<svg onload="alert(1)"/>',
    'https://foreign.example/catalog-media/2026-10-29/page-01.webp',
    '//foreign.example/catalog-media/2026-10-29/page-01.webp',
    '/catalog-media/2026-10-29/../../secret.webp',
    '/catalog-media/2026-10-29/%2e%2e/secret.webp',
    '/catalog-media/2026-10-29/page-01.webp?redirect=https://foreign.example',
    '/catalog-media/2026-10-29/page-01.webp#fragment',
    '/catalog-media/2026-10-29/page-01.svg',
  ])('removes an unsafe or non-canonical image URL: %s', (url) => {
    const parsed = reviewWithImages([{ ...validImage, url }]);
    expect(parsed?.images).toEqual([]);
    expect(parsed?.invalidRecords).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain(url);
  });

  it.each([
    { label: 'null', value: null }, { label: 'undefined', value: undefined },
    { label: 'array', value: [] }, { label: 'string', value: 'untrusted-json' },
    { label: 'number', value: 42 }, { label: 'boolean', value: true },
  ])('rejects an invalid review root: $label', ({ value }) => {
    expect(parseCatalogMediaReview(value)).toBeNull();
  });

  it('keeps a valid sibling while hiding malformed dimensions and page records', () => {
    const parsed = reviewWithImages([
      validImage,
      { ...validImage, page: 0 },
      { ...validImage, width: -1 },
      { ...validImage, height: 50_001 },
      { ...validImage, sha256: 'invalid' },
      { ...validImage, page: '2' },
    ]);
    expect(parsed?.images).toEqual([validImage]);
    expect(parsed?.invalidRecords).toBe(true);
  });

  it('bounds an oversized image list and reports that records were ignored', () => {
    const parsed = reviewWithImages(Array.from({ length: 501 }, (_, index) => ({ ...validImage, page: index + 1 })));
    expect(parsed?.images).toHaveLength(500);
    expect(parsed?.invalidRecords).toBe(true);
  });

  it('does not return arbitrary JSON fields at the root or inside records', () => {
    const parsed = parseCatalogMediaReview({
      arbitraryRoot: 'DO_NOT_RENDER_ROOT',
      products: [{ slug: 'sidr-mask', catalogName: 'ماسك السدر', pages: [4], notes: [], arbitraryProduct: 'DO_NOT_RENDER_PRODUCT' }],
      images: [{ ...validImage, arbitraryImage: 'DO_NOT_RENDER_IMAGE' }],
      unassigned: [],
    });
    expect(parsed?.products).toHaveLength(1);
    expect(parsed?.images).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toMatch(/DO_NOT_RENDER|arbitraryRoot|arbitraryProduct|arbitraryImage/);
  });

  it('hides malformed collections and limits top-level text fields', () => {
    const parsed = parseCatalogMediaReview({ sourceName: 's'.repeat(501), receivedAt: 't'.repeat(101), summary: 'd'.repeat(10001), products: {}, images: 'bad', unassigned: null });
    expect(parsed?.products).toEqual([]);
    expect(parsed?.images).toEqual([]);
    expect(parsed?.unassigned).toEqual([]);
    expect(parsed?.invalidRecords).toBe(true);
    expect(parsed?.sourceName).toHaveLength(500);
    expect(parsed?.receivedAt).toHaveLength(100);
    expect(parsed?.summary).toHaveLength(10000);
  });
});
