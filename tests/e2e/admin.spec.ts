import { expect, test } from '@playwright/test';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { createShopFixture } from './fixtures';

test.describe('authorized administration using isolated test records', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn database and matching QA web server.');
  let fixture: Awaited<ReturnType<typeof createShopFixture>>;
  test.beforeAll(async () => { fixture = await createShopFixture(); });
  test.afterAll(async () => { await fixture?.cleanup(); });

  test('logs in, changes product price/availability, audits and logs out', async ({ page, request, baseURL }) => {
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill(fixture.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await page.goto(`/admin/products/${fixture.product.id}`);
    await page.getByLabel('سعر البيع بالشيكل', { exact: true }).fill('80');
    await page.getByLabel('متوفر', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'حفظ المنتج', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'تم الحفظ' })).toBeVisible();
    const saved = await fixture.db.product.findUniqueOrThrow({ where: { id: fixture.product.id } });
    expect(saved.priceAgorot).toBe(8000);
    expect(saved.available).toBe(false);
    expect(await fixture.db.auditLog.count({ where: { actorId: fixture.userId } })).toBeGreaterThan(0);
    const csv = await page.request.get('/api/admin/orders/export');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    const denied = await page.request.post('/api/admin/product', { headers: { origin: baseURL! }, data: { operation: 'save' } });
    expect(denied.status()).toBe(401);
    const separate = await request.get('/api/admin/orders/export');
    expect(separate.status()).toBe(401);
  });

  test('uploads an original image, preserves its bytes and requires name review before publishing', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill(fixture.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await page.goto(`/admin/products/${fixture.product.id}`);
    const original = await sharp({ create: { width: 16, height: 24, channels: 3, background: '#64283c' } }).png().toBuffer();
    const uploadPromise = page.waitForResponse((r) => r.url().endsWith('/api/admin/uploads'));
    await page.getByLabel('رفع صورة أصلية', { exact: true }).setInputFiles({ name: 'qa-technical-fixture.png', mimeType: 'image/png', buffer: original });
    const uploadResponse = await uploadPromise;
    expect(uploadResponse.status()).toBe(200);
    const receipt = await uploadResponse.json();
    expect(receipt.originalKey).toMatch(/^originals\/[a-f0-9-]+\.png$/);
    expect(receipt.url).toMatch(/^\/uploads\/products\/[a-f0-9-]+\.webp$/);
    const originalPath = join(process.cwd(), 'public', 'uploads', receipt.originalKey);
    const optimizedPath = join(process.cwd(), 'public', receipt.url);
    try {
      expect((await readFile(originalPath)).equals(original)).toBe(true);
      const optimized = await sharp(await readFile(optimizedPath)).metadata();
      expect(optimized.width).toBe(16);
      expect(optimized.height).toBe(24);
      await page.getByLabel('بحاجة لتأكيد الاسم', { exact: true }).check();
      await page.getByRole('button', { name: 'حفظ المنتج', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'لن يُنشر المنتج' })).toBeVisible();
      await page.getByLabel('بحاجة لتأكيد الاسم', { exact: true }).uncheck();
      await page.getByLabel('اسم المنتج', { exact: true }).fill('منتج اختبار بعد مراجعة الاسم');
      await page.getByRole('button', { name: 'حفظ المنتج', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'تم الحفظ' })).toBeVisible();
      const saved = await fixture.db.product.findUniqueOrThrow({ where: { id: fixture.product.id }, include: { images: true } });
      expect(saved.name).toBe('منتج اختبار بعد مراجعة الاسم');
      expect(saved.nameNeedsConfirmation).toBe(false);
      expect(saved.images.some((image) => image.originalKey === receipt.originalKey)).toBe(true);
    } finally { await unlink(originalPath).catch(() => {}); await unlink(optimizedPath).catch(() => {}); }
  });

  test('expired sessions cannot call an admin mutation', async ({ page, baseURL }) => {
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill(fixture.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await fixture.db.session.updateMany({ where: { userId: fixture.userId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const response = await page.request.post('/api/admin/product', { headers: { origin: baseURL! }, data: { operation: 'save' } });
    expect(response.status()).toBe(401);
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  });
});
