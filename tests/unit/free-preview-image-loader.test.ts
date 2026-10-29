import { describe, expect, it } from 'vitest';
import imageLoader from '../../src/lib/free-preview-image-loader';

describe('owner-approved final photo loader', () => {
  it.each([
    ['/final-product-images/2026-10-29/01_ground_henna.jpeg', 320],
    ['/final-product-images/2026-10-29/03_complete_henna_mix.jpeg', 640],
    ['/final-product-images/2026-10-29/07_mask_al_sidr_al_moazzaz.jpg', 1200],
    ['/brand/rokn-alhenna-logo-transparent.webp', 200],
  ])('preserves original source bytes without redirecting %s', (src, width) => {
    expect(imageLoader({src,width})).toBe(src);
  });
});
