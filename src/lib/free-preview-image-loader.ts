'use client';

import type { ImageLoaderProps } from 'next/image';

// Only these checked-in originals have precomputed derivatives. Unknown assets,
// logos, SVGs and remote uploads keep their exact source; no image server runs.
const catalogPhoto = /^\/catalog-media\/2026-10-29\/(page-(?:0[1-9]|1[0-9]|2[0-6]))\.webp$/;
const derivativeWidths = [320, 640, 960] as const;

export default function freePreviewImageLoader({ src, width }: ImageLoaderProps): string {
  const photo = catalogPhoto.exec(src);
  if (!photo || !Number.isFinite(width) || width <= 0 || width > 960) return src;
  const size = derivativeWidths.find(candidate => candidate >= width);
  return `/catalog-media/2026-10-29/responsive/${photo[1]}-${size}.webp`;
}
