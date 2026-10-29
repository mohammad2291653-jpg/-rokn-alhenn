import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createShopFixture } from './fixtures';

test.describe('customer purchase flow in the isolated QA database', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn database and matching QA web server.');
  let fixture: Awaited<ReturnType<typeof createShopFixture>>;
  test.beforeAll(async () => { fixture = await createShopFixture(); });
  test.afterAll(async () => { await fixture?.cleanup(); });

  test('searches, persists cart quantities, changes delivery zone and saves a COD order after a connection failure', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('searchbox', { name: 'ابحثي عن منتج', exact: true }).fill('غير موجود بالكتالوج');
    await expect(page.locator('.product-card')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'ابحثي عن منتج', exact: true }).fill(fixture.product.name);
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.locator('.product-card').getByRole('heading', { name: fixture.product.name }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${fixture.product.slug}$`));
    await page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true }).first().click();
    await page.getByRole('link', { name: 'عرض السلة', exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByLabel('الكمية', { exact: true })).toHaveValue('1');
    await page.getByRole('button', { name: 'زيادة الكمية', exact: true }).click();
    await expect(page.getByLabel('الكمية', { exact: true })).toHaveValue('2');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rokn-cart-v1') || '[]')[0]?.quantity)).toBe(2);
    await page.reload();
    await expect(page.getByLabel('الكمية', { exact: true })).toHaveValue('2');
    await page.getByRole('link', { name: 'الانتقال لإتمام الطلب' }).click();
    await page.getByLabel('الاسم الكامل', { exact: true }).fill('زبونة اختبار المتصفح');
    await page.getByLabel('رقم الهاتف', { exact: true }).fill('0599123456');
    const west = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'west-bank' } });
    const interior = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'interior' } });
    const jerusalem = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'jerusalem' } });
    await page.getByLabel('منطقة التوصيل', { exact: true }).selectOption(interior.id);
    await page.getByLabel('المدينة أو البلدة', { exact: true }).selectOption('الناصرة');
    await page.getByLabel('العنوان التفصيلي', { exact: true }).fill('الناصرة شارع الاختبار بناية ١');
    await expect(page.locator('.summary-total')).toContainText(new Intl.NumberFormat('ar-PS').format(180));
    await page.getByLabel('منطقة التوصيل', { exact: true }).selectOption(jerusalem.id);
    await expect(page.locator('.form-error[role="alert"]')).toContainText('القدس');
    const submit = page.getByRole('button', { name: 'تأكيد الطلب — الدفع عند الاستلام', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('منطقة التوصيل', { exact: true }).selectOption(west.id);
    await page.getByLabel('المدينة أو البلدة', { exact: true }).selectOption('رام الله');
    await page.getByLabel('العنوان التفصيلي', { exact: true }).fill('رام الله شارع الاختبار بناية ١');
    await expect(page.locator('.summary-total')).toContainText(new Intl.NumberFormat('ar-PS').format(170));
    await page.getByRole('checkbox').check();
    await page.route('**/api/orders', (route) => route.abort('failed'));
    await submit.click();
    await expect(page.locator('.form-error[role="alert"]')).toBeVisible();
    expect(await fixture.db.order.count({ where: { items: { some: { productId: fixture.product.id } } } })).toBe(0);
    await page.unroute('**/api/orders');
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await submit.click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const order = await response.json();
    expect(order.totalAgorot).toBe(17000);
    expect(order.deliveryAgorot).toBe(2000);
    expect(order.paymentStatus).toBe('UNPAID');
    await expect(page.getByRole('heading', { name: 'وصلنا طلبكِ، بكل عناية' })).toBeVisible();
    await expect(page.getByText('غير مدفوع', { exact: true })).toBeVisible();
    expect(await fixture.db.order.count({ where: { number: order.number } })).toBe(1);
    const whatsApp = page.getByRole('link', { name: 'مشاركة الرقم عبر واتساب' });
    const href = await whatsApp.getAttribute('href');
    expect(decodeURIComponent(href!)).toContain(order.number);
    expect(href).not.toContain('0599123456');
    await page.locator('main').getByRole('link', { name: 'متابعة الطلب', exact: true }).click();
    await expect(page.getByLabel('رمز المتابعة الآمن', { exact: true })).toHaveValue(order.trackingToken);
    await page.getByRole('button', { name: 'عرض حالة الطلب', exact: true }).click();
    await expect(page.locator('.status-summary')).toContainText(order.number);
    expect(await page.locator('.status-summary').innerText()).not.toContain('0599123456');
    expect(await page.locator('.status-summary').innerText()).not.toContain('شارع الاختبار');
    await page.goto('/cart');
    await expect(page.getByText('سلتكِ تنتظر اختياراتكِ', { exact: true })).toBeVisible();
  });

  test('rejects Gaza and forged fees in direct HTTP requests', async ({ request, baseURL }) => {
    const west = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'west-bank' } });
    const jerusalem = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'jerusalem' } });
    const base = { items: [{ productId: fixture.product.id, quantity: 1 }], zoneId: west.id, city: 'رام الله', address: 'رام الله شارع الاختبار بناية ١', customerName: 'زبونة اختبار HTTP', phone: '0599123456', acceptPolicies: true };
    for (const overrides of [{ zoneId: 'gaza' }, { address: 'غزة شارع الاختبار بناية ١' }, { city: 'غزة' }, { deliveryAgorot: 0 }, { zoneId: jerusalem.id, city: 'القدس', address: 'القدس شارع الاختبار بناية ١' }]) {
      const response = await request.post('/api/orders', { headers: { origin: baseURL! }, data: { ...base, ...overrides, idempotencyKey: randomUUID() } });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBeTruthy();
    }
    expect(await fixture.db.order.count({ where: { customerName: 'زبونة اختبار HTTP', items: { some: { productId: fixture.product.id } } } })).toBe(0);
  });

  test('deletes a cart line and rejects an unavailable product at checkout', async ({ page }) => {
    await page.goto(`/products/${fixture.product.slug}`);
    await page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true }).first().click();
    await page.getByRole('link', { name: 'عرض السلة', exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.getByRole('button', { name: `حذف ${fixture.product.name}`, exact: true }).click();
    await expect(page.getByText('سلتكِ تنتظر اختياراتكِ', { exact: true })).toBeVisible();
    await page.goto(`/products/${fixture.product.slug}`);
    await page.getByRole('button', { name: 'أضيفي إلى السلة', exact: true }).first().click();
    await expect(page.getByRole('link', { name: 'عرض السلة', exact: true })).toBeVisible();
    await fixture.db.product.update({ where: { id: fixture.product.id }, data: { available: false } });
    await page.goto('/checkout');
    const west = await fixture.db.deliveryZone.findUniqueOrThrow({ where: { code: 'west-bank' } });
    await page.getByLabel('منطقة التوصيل', { exact: true }).selectOption(west.id);
    await page.getByLabel('المدينة أو البلدة', { exact: true }).selectOption('رام الله');
    await page.getByLabel('العنوان التفصيلي', { exact: true }).fill('رام الله شارع الاختبار بناية ١');
    await expect(page.locator('.form-error[role="alert"]')).toContainText('غير متوفر');
    await expect(page.getByRole('button', { name: 'تأكيد الطلب — الدفع عند الاستلام', exact: true })).toBeDisabled();
  });
});
