import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { toPublicProduct } from '@/lib/availability';
// Server-side selection only; toPublicProduct strips inventory before serialization.
export const publicProductSelect = {
  id: true, slug: true, name: true, weightGrams: true, priceAgorot: true, available: true, stockTracked: true, stockQuantity: true, featured: true, description: true, ingredients: true, usage: true, warnings: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductSelect;
export const visibleProducts = { status: 'PUBLISHED' as const, nameNeedsConfirmation: false, images: { some: {} } };
export async function getStoreSettings() {
  // Keep administrative source audits out of public-page queries and payloads.
  const rows = await db.siteSetting.findMany({ where: { key: { in: ['store','checkoutEnabled','returns','privacy','terms','analytics'] } } });
  const map = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const raw = (map.store && typeof map.store === 'object' && !Array.isArray(map.store) ? map.store : {}) as Record<string, Prisma.JsonValue>;
  const url = (value: Prisma.JsonValue | undefined, fallback: string) => { if (typeof value !== 'string') return fallback; try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : fallback; } catch { return fallback; } };
  const whatsapp = typeof raw.whatsapp === 'string' && /^\+?\d[\d\s-]{7,18}$/.test(raw.whatsapp) ? `https://wa.me/${raw.whatsapp.replace(/\D/g, '')}` : url(raw.whatsapp, 'https://wa.me/970599373380');
  const rawLogo = typeof raw.logoUrl === 'string' ? raw.logoUrl : '';
  const logoUrl = (['/brand/rokn-alhenna-logo.webp','/brand/rokn-alhenna-logo-transparent.webp'].includes(rawLogo) || rawLogo.startsWith('/uploads/products/')) ? rawLogo : url(raw.logoUrl, '');
  return { map, logoUrl, instagram: url(raw.instagram, 'https://www.instagram.com/rokn_alhenna/'), whatsapp, facebook: url(raw.facebook, ''), checkoutEnabled: map.checkoutEnabled === true };
}
export async function getProducts() { return (await db.product.findMany({ where: visibleProducts, select: publicProductSelect, orderBy: [{ featured: 'desc' }, { createdAt: 'asc' }] })).map(toPublicProduct); }
