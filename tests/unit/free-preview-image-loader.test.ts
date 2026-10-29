import { describe, expect, it } from 'vitest';
import imageLoader from '../../src/lib/free-preview-image-loader';

const source = '/catalog-media/2026-10-29/page-23.webp';

describe('precomputed free preview image sources', () => {
  it.each([[160, 320], [320, 320], [321, 640], [640, 640], [641, 960], [960, 960]])('serves the smallest existing derivative for %ipx', (width, size) => {
    expect(imageLoader({ src: source, width })).toBe(`/catalog-media/2026-10-29/responsive/page-23-${size}.webp`);
  });

  it.each([961, 1200, 1600, 3200, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('preserves the original for full-size or invalid width %#', width => {
    expect(imageLoader({ src: source, width })).toBe(source);
  });

  it.each([
    '/brand/rokn-alhenna-logo-transparent.webp', '/icon.svg',
    'https://cdn.example.com/products/page-23.webp',
    '/catalog-media/2026-10-29/page-27.webp', '/catalog-media/2026-10-30/page-23.webp',
    '/catalog-media/2026-10-29/page-23.webp?version=1',
    '/catalog-media/2026-10-29/../page-23.webp',
  ])('leaves assets without prepared derivatives unchanged: %s', src => {
    expect(imageLoader({ src, width: 320 })).toBe(src);
  });

  it.each(['01', '09', '10', '19', '20', '26'])('maps only original photos within the prepared manifest range: page-%s', page => {
    expect(imageLoader({ src: `/catalog-media/2026-10-29/page-${page}.webp`, width: 640 })).toBe(`/catalog-media/2026-10-29/responsive/page-${page}-640.webp`);
  });
});
