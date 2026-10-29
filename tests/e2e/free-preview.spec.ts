import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PREVIEW_COOKIE, PREVIEW_SESSION_SECONDS, previewTokenValid } from '../../src/lib/preview-access';

const enabled = Boolean(process.env.PLAYWRIGHT_FREE_PREVIEW_BASE_URL)
  && Boolean(process.env.PREVIEW_TEST_DATABASE_URL)
  && previewTokenValid(process.env.PREVIEW_TEST_ACCESS_TOKEN, process.env.PREVIEW_TEST_ACCESS_TOKEN);

// File-level worker options keep access capabilities out of traces and screenshots.
test.use({
  baseURL: process.env.PLAYWRIGHT_FREE_PREVIEW_BASE_URL, trace: 'off', screenshot: 'off',
  // Only this isolated local QA endpoint uses a temporary self-signed certificate.
  ignoreHTTPSErrors: process.env.PLAYWRIGHT_FREE_PREVIEW_BASE_URL === 'https://127.0.0.1:3443',
});

test.describe('authenticated read-only free hosting preview', () => {
  test.skip(!enabled, 'Supply the dedicated loopback preview QA URL, QA access token, and test_rokn_preview database.');
  test.setTimeout(120_000);
  let db: PrismaClient;
  let categoryId: string | undefined;
  let published: { id: string; slug: string; name: string } | undefined;
  let settingsBefore: Awaited<ReturnType<PrismaClient['siteSetting']['findMany']>> = [];
  let ratesBefore: Awaited<ReturnType<PrismaClient['rateLimit']['findMany']>> = [];
  let zonesBefore: Awaited<ReturnType<PrismaClient['deliveryZone']['findMany']>> = [];
  let citiesBefore: Awaited<ReturnType<PrismaClient['city']['findMany']>> = [];
  let countsBefore: { products: number; users: number; orders: number } | undefined;
  let snapshotReady = false;
  let draft: { id: string; slug: string; name: string };
  let missingPhoto: { id: string; slug: string; name: string };
  let uiChecksPassed = false;
  let apiChecksPassed = false;
  const evidence: Record<string, unknown> = {
    at: new Date().toISOString(), database: 'test_rokn_preview', mainDatabaseMutated: false,
    credentialsRecorded: false, previewTokenRecorded: false, result: 'not_completed',
  };

  async function enterPreview(request: APIRequestContext) {
    // Do not allow an error message to quote a secret-bearing URL.
    let response;
    try {
      response = await request.get(`/preview-access?token=${encodeURIComponent(process.env.PREVIEW_TEST_ACCESS_TOKEN!)}`, { maxRedirects: 0 });
    } catch {
      throw new Error('The isolated preview QA access endpoint could not be reached.');
    }
    expect(response.status()).toBe(303);
    expect(new URL(response.headers().location, 'http://localhost').pathname).toBe('/');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  }

  test.beforeAll(async ({ baseURL }) => {
    const url = process.env.PREVIEW_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/test_rokn_preview') throw new Error('Refusing any database except isolated test_rokn_preview.');
    const host = baseURL ? new URL(baseURL).hostname : '';
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error('Preview business fixtures may target only a loopback QA server.');
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    [settingsBefore, ratesBefore, zonesBefore, citiesBefore] = await Promise.all([
      db.siteSetting.findMany({ orderBy: { key: 'asc' } }),
      db.rateLimit.findMany({ orderBy: { key: 'asc' } }), db.deliveryZone.findMany({ orderBy: { id: 'asc' } }), db.city.findMany({ orderBy: { id: 'asc' } }),
    ]);
    countsBefore = { products: await db.product.count(), users: await db.user.count(), orders: await db.order.count() };
    snapshotReady = true;
    const marker = randomUUID();
    categoryId = (await db.category.create({ data: { name: 'اختبار معاينة معزول', slug: `qa-preview-category-${marker}` } })).id;
    // This deliberately enables checkout/policies and creates a valid published product:
    // free-preview protection must still prevent an actual order.
    published = await db.product.create({ data: {
      categoryId, slug: `qa-preview-published-${marker}`, name: `منتج اختبار منشور ${marker.slice(0, 8)}`,
      status: 'PUBLISHED', nameNeedsConfirmation: false, weightGrams: 500, priceAgorot: 7500, available: true,
      images: { create: { url: '/final-product-images/2026-10-29/03_complete_henna_mix.jpeg', originalKey: 'qa-free-preview-only', alt: 'صورة في اختبار معزول فقط' } },
    }, select: { id: true, slug: true, name: true } });
    for (const key of ['returns', 'privacy', 'terms']) await db.siteSetting.upsert({ where: { key }, create: { key, value: { approved: true, body: 'سياسة اختبار معزول فقط' } }, update: { value: { approved: true, body: 'سياسة اختبار معزول فقط' } } });
    await db.siteSetting.upsert({ where: { key: 'checkoutEnabled' }, create: { key: 'checkoutEnabled', value: true }, update: { value: true } });
    const zone = await db.deliveryZone.upsert({ where: { code: 'west-bank' }, create: { code: 'west-bank', name: 'الضفة الغربية', feeAgorot: 2000, approved: true, enabled: true }, update: { feeAgorot: 2000, approved: true, enabled: true } });
    await db.city.upsert({ where: { zoneId_name: { zoneId: zone.id, name: 'رام الله' } }, create: { zoneId: zone.id, name: 'رام الله', enabled: true }, update: { enabled: true } });
    draft = await db.product.create({ data: {
      categoryId, slug: `qa-free-draft-${marker}`,
      name: `مسودة معاينة معزولة ${marker.slice(0, 8)}`, status: 'DRAFT', nameNeedsConfirmation: true,
      weightGrams: 500, priceAgorot: 7500, available: true, stockTracked: true, stockQuantity: 0,
      usage: 'تعليمات اختبارية معزولة للمراجعة فقط.',
      images: { create: { url: '/final-product-images/2026-10-29/03_complete_henna_mix.jpeg', originalKey: 'qa-free-preview-only', alt: 'صورة أصلية في اختبار معاينة معزول' } },
    }, select: { id: true, slug: true, name: true } });
    missingPhoto = await db.product.create({ data: {
      categoryId, slug: `qa-free-no-photo-${marker}`,
      name: `مسودة بلا صورة للاختبار ${marker.slice(0, 8)}`, status: 'DRAFT', nameNeedsConfirmation: true,
      weightGrams: 200, priceAgorot: 6000, available: true,
    }, select: { id: true, slug: true, name: true } });
  });

  test('protects drafts and metadata, then previews real images without purchases or admin authority', async ({ page }) => {
    for (const path of ['/', '/products', `/products/${draft.slug}`, `/products/${draft.slug}?preview=true`]) {
      const response = await page.request.get(path);
      expect(response.status()).toBe(404);
      const body = await response.text();
      expect(body.includes(draft.name)).toBe(false);
      expect(body.includes(missingPhoto.name)).toBe(false);
    }
    const anonymousRsc = await page.request.get(`/products/${draft.slug}`, { headers: { RSC: '1' } });
    expect((await anonymousRsc.text()).includes(draft.name)).toBe(false);
    await page.context().clearCookies();
    const invalid = await page.request.get('/preview-access?token=invalid', { maxRedirects: 0 });
    expect(invalid.status()).toBe(404);
    expect((await page.context().cookies()).some(cookie => cookie.name === PREVIEW_COOKIE)).toBe(false);
    let duplicated;
    try {
      const token = encodeURIComponent(process.env.PREVIEW_TEST_ACCESS_TOKEN!);
      duplicated = await page.request.get(`/preview-access?token=${token}&token=${token}`, { maxRedirects: 0 });
    } catch {
      throw new Error('The isolated preview QA duplicate-token request could not be reached.');
    }
    expect(duplicated.status()).toBe(404);
    expect((await page.context().cookies()).some(cookie => cookie.name === PREVIEW_COOKIE)).toBe(false);

    await enterPreview(page.request);
    const cookie = (await page.context().cookies()).find(value => value.name === PREVIEW_COOKIE);
    expect(Boolean(cookie)).toBe(true);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');
    expect(cookie!.value.includes(process.env.PREVIEW_TEST_ACCESS_TOKEN!)).toBe(false);
    const remaining = cookie!.expires - Date.now() / 1000;
    expect(remaining > PREVIEW_SESSION_SECONDS - 60 && remaining <= PREVIEW_SESSION_SECONDS + 5).toBe(true);

    await page.goto('/');
    await expect(page.getByText('معاينة خاصة للمراجعة', { exact: true })).toBeVisible();
    await expect(page.locator('main .hero h1')).toBeVisible();
    expect((await page.content()).includes(process.env.PREVIEW_TEST_ACCESS_TOKEN!)).toBe(false);
    const response = await page.goto('/products');
    expect(response!.headers()['cache-control']).toContain('no-store');
    expect(response!.headers()['referrer-policy']).toBe('no-referrer');
    expect(response!.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByText('معاينة خاصة للمراجعة', { exact: true })).toBeVisible();
    const draftCard = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: draft.name, exact: true }) });
    const noPhotoCard = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: missingPhoto.name, exact: true }) });
    await expect(draftCard).toContainText('500 غرام');
    await expect(draftCard.locator('.product-price strong')).toHaveText(`${new Intl.NumberFormat('ar-PS').format(75)} ₪`);
    await expect(draftCard.locator('.availability')).toHaveText('غير متوفر');
    await expect(noPhotoCard).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true })).toHaveCount(0);
    await expect(page.locator('.product-card-actions, .quantity-control, .site-header a[href="/cart"]')).toHaveCount(0);
    const html = await page.content();
    const rsc = await page.request.get('/products', { headers: { RSC: '1' } });
    const payload = await rsc.text();
    expect(html.includes(process.env.PREVIEW_TEST_ACCESS_TOKEN!)).toBe(false);
    expect(payload.includes(process.env.PREVIEW_TEST_ACCESS_TOKEN!)).toBe(false);
    for (const key of ['stockQuantity', 'stockTracked', 'originalKey']) expect(payload.includes(key)).toBe(false);
    const viewports = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await draftCard.scrollIntoViewIfNeeded();
      await expect.poll(() => draftCard.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      viewports.push({ width, ...dimensions });
    }
    const cartMarker = JSON.stringify([{ id: published!.id, quantity: 1, name: published!.name, slug: published!.slug, weightGrams: 500, priceAgorot: 7500, image: null }]);
    await page.evaluate(value => localStorage.setItem('rokn-cart-v1', value), cartMarker);
    await page.goto(`/products/${draft.slug}`);
    await expect(page.locator('.product-detail h1')).toHaveText(draft.name);
    await expect(page.locator('.status-dot')).toHaveText('غير متوفر');
    await expect(page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'اطلبي عبر واتساب', exact: true })).toHaveCount(0);
    await expect(page.locator('.detail-add, .quantity-control')).toHaveCount(0);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'تكبير صورة المنتج', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'صورة المنتج مكبّرة', exact: true })).toBeVisible();
    const zoomImage = page.getByRole('dialog', { name: 'صورة المنتج مكبّرة', exact: true }).locator('img');
    await expect.poll(() => zoomImage.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(1122);
    expect(new URL(await zoomImage.getAttribute('src') || '', page.url()).pathname).toBe('/final-product-images/2026-10-29/03_complete_henna_mix.jpeg');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'صورة المنتج مكبّرة', exact: true })).not.toBeVisible();
    for (const path of ['/cart', '/checkout', '/order-status']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'الطلبات غير متاحة في المعاينة', exact: true })).toBeVisible();
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    }
    expect(await page.evaluate(() => localStorage.getItem('rokn-cart-v1'))).toBe(cartMarker);
    const admin = await page.request.get('/admin/store-preview');
    expect(new URL(admin.url()).pathname).toBe('/admin');
    const adminResponse = await page.request.get('/api/admin/orders/export');
    expect(adminResponse.status()).toBe(401);
    expect((await db.product.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
    uiChecksPassed = true;
    evidence.ui = { draftsBlockedWithoutCookie: true, duplicateAndInvalidTokensRejected: true, derivedHttpOnlyLaxCookie: true, eightHourCookie: true, fullStoreHomeAvailable: true, stockFieldsNotSerialized: true, zeroStockShownUnavailable: true, missingUnpicturedProductHidden: true, originalPhotoLoaded: true, draftStructuredDataSuppressed: true, noPurchaseControlsOrForms: true, localCartPreserved: true, previewCookieDoesNotGrantAdmin: true, viewports };
  });

  test('rejects orders, quotes and tracking despite enabled checkout and policies', async ({ request, baseURL }) => {
    await enterPreview(request);
    expect((await db.siteSetting.findUniqueOrThrow({ where: { key: 'checkoutEnabled' } })).value).toBe(true);
    const zone = await db.deliveryZone.findUniqueOrThrow({ where: { code: 'west-bank' } });
    const origin = new URL(baseURL!).origin;
    const headers = { origin, 'sec-fetch-site': 'same-origin' };
    const quote = { items: [{ productId: published!.id, quantity: 1 }], zoneId: zone.id, city: 'رام الله', address: 'رام الله شارع الاختبار بناية ١' };
    const order = { ...quote, customerName: 'زبونة اختبار معزول', phone: '0599123456', idempotencyKey: randomUUID(), acceptPolicies: true };
    for (const [path, data] of [
      ['/api/orders', order], ['/api/checkout/quote', quote], ['/api/order-status', { token: randomBytes(32).toString('base64url') }],
    ] as const) {
      const response = await request.post(path, { headers, data });
      expect(response.status()).toBe(503);
      expect((await response.json()).code).toBe('PREVIEW_READ_ONLY');
    }
    expect(await db.order.count()).toBe(countsBefore!.orders);
    apiChecksPassed = true;
    evidence.api = { validPublishedProductCannotBeOrdered: true, approvedPoliciesAndEnabledCheckoutCannotBypassPreview: true, orderQuoteAndTrackingReturnPreviewReadOnly: true, ordersUnchanged: true };
  });

  test.afterAll(async ({}, testInfo) => {
    if (!db) return;
    try {
      if (!snapshotReady) return;
      const ownIds = [published?.id, draft?.id, missingPhoto?.id].filter((id): id is string => Boolean(id));
      const ownOrderIds = (await db.order.findMany({ where: { items: { some: { productId: { in: ownIds } } } }, select: { id: true } })).map(order => order.id);
      await db.orderStatusHistory.deleteMany({ where: { orderId: { in: ownOrderIds } } });
      await db.orderItem.deleteMany({ where: { orderId: { in: ownOrderIds } } });
      await db.order.deleteMany({ where: { id: { in: ownOrderIds } } });
      await db.productImage.deleteMany({ where: { productId: { in: ownIds } } });
      await db.product.deleteMany({ where: { id: { in: ownIds } } });
      if (categoryId) await db.category.delete({ where: { id: categoryId } });
      await db.siteSetting.deleteMany({ where: { key: { notIn: settingsBefore.map(setting => setting.key) } } });
      for (const setting of settingsBefore) {
        const value = setting.value === null ? Prisma.JsonNull : setting.value as Prisma.InputJsonValue;
        await db.siteSetting.upsert({ where: { key: setting.key }, create: { key: setting.key, value, updatedAt: setting.updatedAt }, update: { value, updatedAt: setting.updatedAt } });
      }
      await db.rateLimit.deleteMany({ where: { key: { notIn: ratesBefore.map(rate => rate.key) } } });
      for (const rate of ratesBefore) await db.rateLimit.upsert({ where: { key: rate.key }, create: rate, update: { count: rate.count, expiresAt: rate.expiresAt } });
      await db.city.deleteMany({ where: { id: { notIn: citiesBefore.map(city => city.id) } } });
      for (const city of citiesBefore) await db.city.upsert({ where: { id: city.id }, create: city, update: { zoneId: city.zoneId, name: city.name, enabled: city.enabled } });
      await db.deliveryZone.deleteMany({ where: { id: { notIn: zonesBefore.map(zone => zone.id) } } });
      for (const zone of zonesBefore) await db.deliveryZone.upsert({ where: { id: zone.id }, create: zone, update: { code: zone.code, name: zone.name, feeAgorot: zone.feeAgorot, enabled: zone.enabled, approved: zone.approved, createdAt: zone.createdAt, updatedAt: zone.updatedAt } });
      const countsAfter = { products: await db.product.count(), users: await db.user.count(), orders: await db.order.count() };
      const cleanup = {
        countsRestored: JSON.stringify(countsAfter) === JSON.stringify(countsBefore),
        settingsRestored: JSON.stringify(await db.siteSetting.findMany({ orderBy: { key: 'asc' } })) === JSON.stringify(settingsBefore),
        rateLimitsRestored: JSON.stringify(await db.rateLimit.findMany({ orderBy: { key: 'asc' } })) === JSON.stringify(ratesBefore),
        deliveryZonesRestored: JSON.stringify(await db.deliveryZone.findMany({ orderBy: { id: 'asc' } })) === JSON.stringify(zonesBefore),
        citiesRestored: JSON.stringify(await db.city.findMany({ orderBy: { id: 'asc' } })) === JSON.stringify(citiesBefore),
        noTemporaryAdminCreated: true,
      };
      const restored = Object.values(cleanup).every(Boolean);
      evidence.cleanup = cleanup;
      evidence.result = uiChecksPassed && apiChecksPassed && restored ? 'passed' : 'not_completed';
      await mkdir('artifacts', { recursive: true });
      const browser = testInfo.project.name.replace(/[^a-z0-9_-]/gi, '_');
      await writeFile(`artifacts/free-preview-verification-${browser}.json`, JSON.stringify(evidence, null, 2) + '\n');
      expect(restored).toBe(true);
    } finally {
      await db.$disconnect();
    }
  });
});
