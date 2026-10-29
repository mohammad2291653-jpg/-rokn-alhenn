import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { expect, test } from '@playwright/test';

type Manifest = {
  products: { slug: string; catalogName: string; ingredients?: string | null; usage?: string | null; warnings?: string | null; pages: number[] }[];
};
type FinalMedia = { images: { slug: string; url: string; alt: string }[] };

test.describe('private storefront preview', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn and matching QA server.');
  test.setTimeout(120_000);
  let db: PrismaClient;
  let categoryId: string | undefined;
  const products: { id: string; slug: string; name: string; usage: string | null; priceAgorot: number }[] = [];
  const userId = randomUUID();
  const email = `qa-preview-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  let ratesBefore: Awaited<ReturnType<PrismaClient['rateLimit']['findMany']>> = [];
  let settingsBefore: Awaited<ReturnType<PrismaClient['siteSetting']['findMany']>> = [];
  let countsBefore: { products: number; users: number; orders: number } | undefined;
  const evidence: Record<string, unknown> = { at: new Date().toISOString(), database: 'test_rokn', mainDatabaseMutated: false, credentialsRecorded: false, sampleProducts: 'temporary isolated QA records with owner-supplied source images' };

  test.beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/test_rokn') throw new Error('Refusing any database except test_rokn.');
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    [ratesBefore, settingsBefore] = await Promise.all([
      db.rateLimit.findMany(),
      db.siteSetting.findMany({ orderBy: { key: 'asc' } }),
    ]);
    countsBefore = { products: await db.product.count(), users: await db.user.count(), orders: await db.order.count() };
    const manifest = JSON.parse(await readFile('config/catalog-media-review-2026-10-29.json', 'utf8')) as Manifest;
    const finalMedia = JSON.parse(await readFile('config/final-product-media-2026-10-29.json', 'utf8')) as FinalMedia;
    const category = await db.category.create({ data: { name: 'معاينة اختبارية معزولة', slug: `qa-preview-${randomUUID()}` } });
    categoryId = category.id;
    for (const [sourceSlug, priceAgorot, weightGrams, zeroTrackedStock] of [
      ['integrated-henna', 7500, 500, false],
      ['dark-color-powder', 6000, 100, true],
    ] as const) {
      const source = manifest.products.find(p => p.slug === sourceSlug);
      if (!source) throw new Error(`Missing approved source for ${sourceSlug}.`);
      const photo = finalMedia.images.find(image => image.slug === sourceSlug);
      if (!photo) throw new Error('Missing final approved photo for the source product.');
      const sourceImages = [{ url: photo.url, alt: photo.alt, originalKey: 'qa-preview-isolated', position: 0 }];
      const product = await db.product.create({ data: {
        categoryId, slug: `qa-preview-${randomUUID()}`, name: `${source.catalogName} — اختبار معاينة معزول`,
        status: 'DRAFT', nameNeedsConfirmation: true, available: true, priceAgorot, weightGrams,
        stockTracked: zeroTrackedStock, stockQuantity: zeroTrackedStock ? 0 : null,
        ingredients: source.ingredients, usage: source.usage, warnings: source.warnings,
        images: { create: sourceImages.map((image, position) => ({ ...image, position })) },
      } });
      products.push({ id: product.id, slug: product.slug, name: product.name, usage: product.usage, priceAgorot: product.priceAgorot });
    }
    await db.user.create({ data: { id: userId, name: 'مدير معاينة اختبارية مؤقت', email, emailVerified: true, role: 'ADMIN', accounts: { create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: await hashPassword(password) } } } });
  });

  test('keeps drafts private, previews real data and images without purchases or cart changes', async ({ page, request }) => {
    const [henna, dark] = products;
    for (const path of ['/admin/store-preview', `/admin/store-preview/${henna.slug}`]) {
      const response = await request.get(path);
      expect(new URL(response.url()).pathname).toBe('/admin');
      const html = await response.text();
      expect(html).not.toContain(henna.name);
      expect(html).not.toContain(dark.name);
    }
    // No public query switch is allowed to turn a draft into a public product.
    const publicListing = await request.get(`/products?preview=true&status=DRAFT&q=${henna.slug}`);
    expect(await publicListing.text()).not.toContain(henna.name);
    expect((await request.get(`/products/${henna.slug}?preview=true`)).status()).toBe(404);
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill(email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    const cartMarker = '[{"qaReadOnlyMarker":true}]';
    await page.evaluate(marker => localStorage.setItem('rokn-cart-v1', marker), cartMarker);
    const response = await page.goto('/admin/store-preview');
    expect(response).not.toBeNull();
    expect(response!.headers()['cache-control']).toContain('no-store');
    expect(response!.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { name: 'معاينة المتجر', exact: true })).toBeVisible();
    const hennaCard = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: henna.name, exact: true }) });
    const darkCard = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: dark.name, exact: true }) });
    await expect(hennaCard).toContainText('500 غرام');
    await expect(hennaCard.locator('.product-price strong')).toHaveText(`${new Intl.NumberFormat('ar-PS', { maximumFractionDigits: 2 }).format(75)} ₪`);
    await expect(darkCard.locator('.availability')).toHaveText('غير متوفر');
    await expect(page.getByRole('button', { name: /أضيفي إلى السلة/ })).toHaveCount(0);
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.locator('.quantity-control')).toHaveCount(0);
    const rsc = await page.request.get('/admin/store-preview', { headers: { RSC: '1' } });
    const payload = await rsc.text();
    expect(payload).not.toContain('stockQuantity');
    expect(payload).not.toContain('stockTracked');
    expect(payload).not.toContain('originalKey');
    const viewports = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await hennaCard.scrollIntoViewIfNeeded();
      const image = hennaCard.locator('.product-image img');
      await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      viewports.push({ width, imageLoaded: true, ...dimensions });
      await page.evaluate(() => scrollTo(0, 0));
      if (width !== 320) await page.screenshot({ path: width === 1440 ? 'artifacts/private-store-preview-desktop.png' : 'artifacts/private-store-preview-mobile.png', fullPage: true });
    }
    await hennaCard.locator(`a[href="/admin/store-preview/${henna.slug}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/store-preview/${henna.slug}$`));
    await expect(page.locator('.product-detail h1')).toHaveText(henna.name);
    await expect(page.locator('.detail-meta')).toContainText('500 غرام');
    await page.getByText('طريقة الاستخدام', { exact: true }).click();
    await expect(page.locator('.detail-tabs')).toContainText('الماء الفاتر ثم بشامبو أو ماسك خالٍ من الأملاح');
    await expect(page.getByRole('button', { name: /أضيفي إلى السلة/ })).toHaveCount(0);
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.locator('.quantity-control')).toHaveCount(0);
    await page.getByRole('button', { name: 'تكبير صورة المنتج', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'صورة المنتج مكبّرة', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'صورة المنتج مكبّرة', exact: true })).not.toBeVisible();
    await expect(page.locator('.gallery-thumbs')).toHaveCount(0);
    const detailViewports = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      detailViewports.push({ width, ...dimensions });
      if (width === 1440) await page.screenshot({ path: 'artifacts/private-store-preview-detail.png', fullPage: true });
    }
    expect(await page.evaluate(() => localStorage.getItem('rokn-cart-v1'))).toBe(cartMarker);
    expect(await db.product.findMany({ where: { id: { in: products.map(p => p.id) } }, select: { status: true, nameNeedsConfirmation: true } })).toEqual(products.map(() => ({ status: 'DRAFT', nameNeedsConfirmation: true })));
    expect(await db.order.count()).toBe(countsBefore!.orders);
    expect(await db.siteSetting.findMany({ orderBy: { key: 'asc' } })).toEqual(settingsBefore);
    evidence.viewports = viewports;
    evidence.detailViewports = detailViewports;
    evidence.checks = { anonymousListAndDetailBlocked: true, publicPreviewQueryCannotExposeDrafts: true, noStoreAndNoIndex: true, databasePriceAndWeightDisplayed: true, zeroTrackedStockShownUnavailableWithoutCount: true, internalInventoryAndOriginalKeysNotSerialized: true, originalImagesLoad: true, confirmedHennaUsageDisplayed: true, oneImageAndZoomWork: true, purchaseAndWhatsAppActionsAbsent: true, localCartUnchanged: true, productsRemainDraft: true, settingsAndOrdersUnchanged: true };
    evidence.result = 'passed';
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.session.deleteMany({ where: { userId } });
    await db.account.deleteMany({ where: { userId } });
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.productImage.deleteMany({ where: { productId: { in: products.map(p => p.id) } } });
    await db.product.deleteMany({ where: { id: { in: products.map(p => p.id) } } });
    if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
    await db.rateLimit.deleteMany({ where: { key: { notIn: ratesBefore.map(r => r.key) } } });
    for (const rate of ratesBefore) await db.rateLimit.upsert({ where: { key: rate.key }, create: rate, update: { count: rate.count, expiresAt: rate.expiresAt } });
    const countsAfter = { products: await db.product.count(), users: await db.user.count(), orders: await db.order.count() };
    const settingsUnchanged = JSON.stringify(await db.siteSetting.findMany({ orderBy: { key: 'asc' } })) === JSON.stringify(settingsBefore);
    evidence.cleanup = { before: countsBefore, after: countsAfter, countsRestored: JSON.stringify(countsBefore) === JSON.stringify(countsAfter), settingsUnchanged, temporaryCredentialsRemoved: await db.user.count({ where: { id: userId } }) === 0 };
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/private-store-preview-verification.json', JSON.stringify(evidence, null, 2) + '\n');
    await db.$disconnect();
  });
});
