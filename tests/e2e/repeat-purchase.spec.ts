import { expect, test } from '@playwright/test';
import { createShopFixture } from './fixtures';

test.describe('successful purchase idempotency lifecycle', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn and a matching QA server.');
  let fixture: Awaited<ReturnType<typeof createShopFixture>>;
  test.beforeAll(async () => { fixture = await createShopFixture(); });
  test.afterAll(async () => { await fixture?.cleanup(); });

  test('a deliberate identical second purchase gets a new order after the first succeeds', async ({ page }) => {
    const west = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'west-bank' } });
    const numbers: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(`/products/${fixture.product.slug}`);
      await page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true }).first().click();
      await page.getByRole('link', { name: 'عرض السلة', exact: true }).click();
      await expect(page).toHaveURL(/\/cart$/);
      await page.getByRole('link', { name: 'الانتقال لإتمام الطلب' }).click();
      await page.getByLabel('الاسم الكامل', { exact: true }).fill('زبونة اختبار شراء متكرر');
      await page.getByLabel('رقم الهاتف', { exact: true }).fill('0599123456');
      await page.getByLabel('منطقة التوصيل', { exact: true }).selectOption(west.id);
      await page.getByLabel('المدينة أو البلدة', { exact: true }).selectOption('رام الله');
      await page.getByLabel('العنوان التفصيلي', { exact: true }).fill('رام الله شارع الاختبار بناية ١');
      await expect(page.locator('.summary-total')).toContainText(new Intl.NumberFormat('ar-PS').format(95));
      await page.getByRole('checkbox').check();
      const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'تأكيد الطلب — الدفع عند الاستلام', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const order = await response.json();
      numbers.push(order.number);
      await expect(page.getByRole('heading', { name: 'وصلنا طلبكِ، بكل عناية' })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem('rokn-pending-order'))).toBeNull();
    }
    expect(numbers[1]).not.toBe(numbers[0]);
    expect(await fixture.db.order.count({ where: { number: { in: numbers }, items: { some: { productId: fixture.product.id } } } })).toBe(2);
  });
});
