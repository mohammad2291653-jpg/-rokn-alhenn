import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { expect, test } from '@playwright/test';

type ReviewManifest = {
  sourceName: string;
  sourceSha256: string;
  products: { slug: string; catalogName: string; printedName: string; pages: number[]; usageConflict?: { status: string; ownerResolution?: string } }[];
  images: { page: number; url: string }[];
};
const catalog: Record<string, { weightGrams: number; priceAgorot: number }> = {
  'integrated-henna': { weightGrams: 500, priceAgorot: 7500 },
  'sidr-mask': { weightGrams: 200, priceAgorot: 11000 },
  'ground-henna': { weightGrams: 200, priceAgorot: 4000 },
  'sidr-powder': { weightGrams: 100, priceAgorot: 5500 },
  'dark-color-powder': { weightGrams: 100, priceAgorot: 6000 },
  'red-mashat-mask': { weightGrams: 500, priceAgorot: 11000 },
  'red-mashat-powder': { weightGrams: 200, priceAgorot: 5000 },
};

test.describe('private original product media review', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn and matching QA server.');
  test.setTimeout(120_000);
  let db: PrismaClient;
  let manifest: ReviewManifest;
  let checkoutBefore: Awaited<ReturnType<PrismaClient['siteSetting']['findUnique']>>;
  let reviewBefore: typeof checkoutBefore;
  let productsBefore: Awaited<ReturnType<PrismaClient['product']['findMany']>> = [];
  let ratesBefore: Awaited<ReturnType<PrismaClient['rateLimit']['findMany']>> = [];
  let imageIdsBefore: string[] = [];
  let auditIdsBefore: string[] = [];
  const createdProductIds: string[] = [];
  let categoryId: string | undefined;
  let tempDir: string | undefined;
  const userId = randomUUID();
  const email = `qa-media-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const evidence: Record<string, unknown> = { at: new Date().toISOString(), database: 'test_rokn', mainDatabaseMutated: false, credentialsRecorded: false };

  test.beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/test_rokn') throw new Error('Refusing any database except test_rokn.');
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    manifest = JSON.parse(await readFile('config/catalog-media-review-2026-10-29.json', 'utf8'));
    expect(manifest.products).toHaveLength(7);
    expect(manifest.images).toHaveLength(26);
    [checkoutBefore, reviewBefore, productsBefore, ratesBefore] = await Promise.all([
      db.siteSetting.findUnique({ where: { key: 'checkoutEnabled' } }),
      db.siteSetting.findUnique({ where: { key: 'catalogMediaReview' } }),
      db.product.findMany({ where: { slug: { in: manifest.products.map((p) => p.slug) } } }),
      db.rateLimit.findMany(),
    ]);
    // Do not replace or downgrade a pre-existing published record, even in QA.
    expect(productsBefore.every((p) => p.status === 'DRAFT')).toBe(true);
    imageIdsBefore = (await db.productImage.findMany({ where: { product: { slug: { in: manifest.products.map((p) => p.slug) } } }, select: { id: true } })).map((p) => p.id);
    auditIdsBefore = (await db.auditLog.findMany({ where: { entityId: 'catalogMediaReview' }, select: { id: true } })).map((a) => a.id);
    evidence.before = { checkoutEnabled: checkoutBefore?.value, matchingProducts: productsBefore.length, users: await db.user.count(), orders: await db.order.count(), reviewExisted: Boolean(reviewBefore) };
    await db.siteSetting.upsert({ where: { key: 'checkoutEnabled' }, update: { value: false }, create: { key: 'checkoutEnabled', value: false } });
    const category = await db.category.create({ data: { slug: `qa-media-${randomUUID()}`, name: 'فئة مراجعة صور مؤقتة' } });
    categoryId = category.id;
    for (const item of manifest.products) {
      if (productsBefore.some((p) => p.slug === item.slug)) continue;
      const values = catalog[item.slug];
      expect(values).toBeTruthy();
      const product = await db.product.create({ data: { slug: item.slug, name: item.catalogName, categoryId, ...values, status: 'DRAFT', nameNeedsConfirmation: true, available: true } });
      createdProductIds.push(product.id);
    }
    await db.user.create({ data: { id: userId, name: 'مدير مراجعة صور مؤقت', email, emailVerified: true, role: 'ADMIN', accounts: { create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: await hashPassword(password) } } } });
    // Isolate the importer's output artifact, keeping the main-store audit file untouched.
    tempDir = await mkdtemp(join(tmpdir(), 'rokn-media-review-'));
    await mkdir(join(tempDir, 'config'));
    await writeFile(join(tempDir, 'config', 'catalog-media-review-2026-10-29.json'), JSON.stringify(manifest));
    await symlink(join(process.cwd(), 'product-assets'), join(tempDir, 'product-assets'));
    await symlink(join(process.cwd(), 'public'), join(tempDir, 'public'));
    const importer = execFileSync(process.execPath, [join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), join(process.cwd(), 'scripts/import-product-media.ts')], { cwd: tempDir, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 60_000 });
    evidence.import = JSON.parse(importer.trim());
    expect((await db.siteSetting.findUniqueOrThrow({ where: { key: 'checkoutEnabled' } })).value).toBe(false);
    expect(await db.productImage.count({ where: { product: { slug: { in: manifest.products.map((p) => p.slug) } }, originalKey: { startsWith: 'product-assets/originals/2026-10-29/' } } })).toBe(24);
  });

  test('protects original review metadata, shows owner resolutions and loads 26 images at desktop and mobile widths', async ({ page, request }) => {
    const anonymous = await request.get('/admin/catalog-review');
    expect(new URL(anonymous.url()).pathname).toBe('/admin');
    const anonymousHtml = await anonymous.text();
    expect(anonymousHtml).not.toContain(manifest.sourceName);
    expect(anonymousHtml).not.toContain('النصوص الأصلية للتوثيق');
    await page.goto('/admin/catalog-review');
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByLabel('البريد الإداري', { exact: true }).fill(email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await page.goto('/admin/catalog-review');
    await expect(page.getByRole('heading', { name: 'مراجعة صور المنتجات', exact: true })).toBeVisible();
    await expect(page.getByText('26 صورة مقروءة، و7 مجموعات مرتبطة بمنتجات للمراجعة.', { exact: true })).toBeVisible();
    await expect(page.locator('section.admin-card[id]')).toHaveCount(7);
    const photos = page.locator('main img[src^="/catalog-media/"]');
    await expect(photos).toHaveCount(26);
    const sidr = page.locator('#sidr-mask');
    await expect(sidr.getByRole('heading', { name: 'حُسمت تعليمات الاستخدام بتأكيد المالك' })).toBeVisible();
    await expect(sidr).toContainText('مدة ساعة إلى ساعتين');
    await expect(sidr.getByText('اختلاف في تعليمات الاستخدام يحتاج قرار المالك', { exact: true })).toHaveCount(0);
    await sidr.getByText('عرض النصوص الأصلية للتوثيق', { exact: true }).click();
    await expect(sidr).toContainText('نصف ساعة إلى ساعة فقط');
    for (const slug of ['red-mashat-mask', 'red-mashat-powder']) {
      await expect(page.locator(`#${slug}`)).toContainText('الأحمر');
      await expect(page.locator(`#${slug}`)).toContainText('أكد صاحب المتجر');
    }
    const viewportResults = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (let i = 0; i < 26; i++) {
        await photos.nth(i).scrollIntoViewIfNeeded();
        await expect.poll(() => photos.nth(i).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      viewportResults.push({ width, imagesLoaded: 26, ...dimensions });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: width === 1440 ? 'artifacts/admin-catalog-review.png' : 'artifacts/admin-catalog-review-mobile.png', fullPage: true, scale: 'css' });
    }
    evidence.viewports = viewportResults;
    // Capture the owner's received catalog in the protected storefront preview,
    // using this test's existing isolated import and full cleanup.
    await page.goto('/admin/store-preview');
    await expect(page.getByRole('heading', { name: 'معاينة المتجر', exact: true })).toBeVisible();
    const previewCards = page.locator('.store-preview .product-card');
    await expect(previewCards).toHaveCount(await db.product.count());
    await expect(page.locator('.store-preview').getByRole('button', { name: 'أضيفي إلى السلة', exact: true })).toHaveCount(0);
    const previewViewports = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const previewPhotos = page.locator('.store-preview .product-card img');
      for (let i = 0; i < await previewPhotos.count(); i++) {
        await previewPhotos.nth(i).scrollIntoViewIfNeeded();
        await expect.poll(() => previewPhotos.nth(i).evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      previewViewports.push({ width, ...dimensions });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `artifacts/store-preview-${width}.png`, fullPage: true, scale: 'css' });
    }
    await page.goto('/admin/store-preview/integrated-henna');
    await expect(page.getByRole('heading', { name: 'خلطة الحناء المتكاملة', exact: true })).toBeVisible();
    await page.getByText('طريقة الاستخدام', { exact: true }).click();
    await expect(page.locator('.product-detail')).toContainText('شامبو أو ماسك خالٍ من الأملاح');
    await page.screenshot({ path: 'artifacts/henna-product-preview-mobile.png', fullPage: true, scale: 'css' });
    evidence.storefrontPreview = { viewports: previewViewports, ownerPhotosLoaded: true, purchaseActionsHidden: true, hennaOwnerWashSequenceShown: true };
    const sidrProduct = await db.product.findUniqueOrThrow({ where: { slug: 'sidr-mask' } });
    await page.goto(`/admin/products/${sidrProduct.id}`);
    const notice = page.locator('aside.admin-notice').filter({ has: page.getByRole('heading', { name: 'ملاحظات الصور والنصوص المستلمة' }) });
    await expect(notice).toContainText('حُسمت تعليمات الاستخدام بتأكيد المالك.');
    await expect(notice).toContainText('مدة ساعة إلى ساعتين');
    await expect(notice.getByRole('link', { name: 'عرض الصور وملاحظات المصدر' })).toHaveAttribute('href', '/admin/catalog-review#sidr-mask');
    await expect(page.getByRole('combobox', { name: 'حالة النشر', exact: true })).toHaveValue('DRAFT');
    await expect(page.getByRole('checkbox', { name: 'بحاجة لتأكيد الاسم', exact: true })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'طريقة الاستخدام المؤكدة', exact: true })).toHaveValue(/ساعة إلى ساعتين/);
    expect((await db.siteSetting.findUniqueOrThrow({ where: { key: 'checkoutEnabled' } })).value).toBe(false);
    evidence.checks = { unauthenticatedRedirect: true, sourceMetadataNotInLogin: true, groups: 7, images: 26, attachedImages: 24, unassignedImages: 2, sidrConflictResolved: true, originalContradictionPreservedForAudit: true, bothMashatGroupsRed: true, editorNotice: true, productsRemainDraft: true, checkoutRemainsDisabled: true };
    evidence.result = 'passed';
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.session.deleteMany({ where: { userId } });
    await db.account.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.productImage.deleteMany({ where: { product: { slug: { in: manifest.products.map((p) => p.slug) } }, id: { notIn: imageIdsBefore } } });
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
    for (const p of productsBefore) await db.product.update({ where: { id: p.id }, data: { ingredients: p.ingredients, usage: p.usage, warnings: p.warnings, nameNeedsConfirmation: p.nameNeedsConfirmation, updatedAt: p.updatedAt } });
    if (categoryId) await db.category.delete({ where: { id: categoryId } });
    for (const [key, before] of [['checkoutEnabled', checkoutBefore], ['catalogMediaReview', reviewBefore]] as const) {
      if (before) await db.siteSetting.upsert({ where: { key }, create: { key, value: before.value as Prisma.InputJsonValue, updatedAt: before.updatedAt }, update: { value: before.value as Prisma.InputJsonValue, updatedAt: before.updatedAt } });
      else await db.siteSetting.deleteMany({ where: { key } });
    }
    await db.auditLog.deleteMany({ where: { entityId: 'catalogMediaReview', id: { notIn: auditIdsBefore } } });
    await db.rateLimit.deleteMany({ where: { key: { notIn: ratesBefore.map((r) => r.key) } } });
    for (const r of ratesBefore) await db.rateLimit.upsert({ where: { key: r.key }, create: r, update: { count: r.count, expiresAt: r.expiresAt } });
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    evidence.cleanup = { checkoutRestored: JSON.stringify((await db.siteSetting.findUnique({ where: { key: 'checkoutEnabled' } }))?.value) === JSON.stringify(checkoutBefore?.value), usersAfter: await db.user.count(), ordersAfter: await db.order.count(), matchingProductsAfter: await db.product.count({ where: { slug: { in: manifest.products.map((p) => p.slug) } } }), reviewExistedAfter: Boolean(await db.siteSetting.findUnique({ where: { key: 'catalogMediaReview' } })) };
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/admin-catalog-review-verification.json', JSON.stringify(evidence, null, 2));
    await db.$disconnect();
  });
});
