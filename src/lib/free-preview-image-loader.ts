'use client';
import type { ImageLoaderProps } from 'next/image';
// Preserve exact original image bytes; Next's proxy must not resize or recompress them.
export default function freePreviewImageLoader({ src }: ImageLoaderProps): string { return src; }
