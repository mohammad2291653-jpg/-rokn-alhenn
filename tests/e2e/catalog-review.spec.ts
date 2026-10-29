import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { expect, test } from '@playwright/test';
type FinalPhoto = { slug: string; alt: string; url: string; width: number; height: number; file: string };


test.describe('final owner-approved single-photo catalog review', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn and matching QA server.');
  test.setTimeout(120_000);

  const userId = randomUUID();
  const email = `qa-final-media-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  let db: PrismaClient;
  const evidence: Record<string, unknown> = { database: 'test_rokn', images: 7, result: 'not_completed' };

  test.beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/test_rokn') throw new Error('Refusing nonisolated test database.');
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await db.user.create({ data: {
      id: userId, name: 'مدير صور المنتجات مؤقت', email, emailVerified: true, role: 'ADMIN',
      accounts: { create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: await hashPassword(password) } },
    } });
  });

  test('shows seven exact approved JPEGs without old assets, galleries or unpictured products', async ({ page, request }) => {
    const finalMedia = JSON.parse(await readFile('config/final-product-media-2026-10-29.json', 'utf8')) as { images: FinalPhoto[] };
    expect(finalMedia.images).toHaveLength(7);
    const anonymous = await request.get('/admin/catalog-review');
    expect(new URL(anonymous.url()).pathname).toBe('/admin');
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill(email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await page.goto('/admin/catalog-review');
    await expect(page.getByRole('heading', { name: 'صور منتجات ركن الحناء النهائية' })).toBeVisible();
    const photos = page.locator('img[src^="/final-product-images/2026-10-29/"]');
    await expect(photos).toHaveCount(7);
    await expect(page.locator('img[src^="/catalog-media/"]')).toHaveCount(0);
    await expect(page.getByText('ماسك المشاط الأخضر', { exact: true })).toBeVisible();
    await expect(page.getByText('بودرة المشاط الأخضر', { exact: true })).toBeVisible();

    const viewports = [];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const entry of finalMedia.images) {
        const img = page.locator(`img[src="${entry.url}"]`);
        await expect(img).toHaveCount(1);
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1122);
        await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalHeight)).toBe(1402);
      }
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
      viewports.push({ width, ...dimensions, verifiedPhotos: 7 });
    }
    expect((await request.get('/catalog-media/2026-10-29/page-23.webp')).status()).toBe(404);
    evidence.result = 'passed';
    evidence.viewports = viewports;
    evidence.oldImageHttp404 = true;
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.session.deleteMany({ where: { userId } });
    await db.account.deleteMany({ where: { userId } });
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/admin-final-media-verification.json', JSON.stringify(evidence, null, 2) + '\n');
  });
});
