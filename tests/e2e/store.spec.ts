import { expect, test } from '@playwright/test';

const routes = ['/', '/products', '/cart', '/checkout', '/about', '/contact', '/faq', '/shipping', '/returns', '/privacy', '/terms', '/blog', '/order-status'];

test('Arabic RTL pages render and stay within the viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('main').first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll, `${route} horizontal overflow`).toBeLessThanOrEqual(dimensions.width + 1);
  }
  expect(errors).toEqual([]);
});

test('home navigation and permitted contact links work without tracking scripts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('من أصالة التراث');
  await page.getByRole('link', { name: 'تسوّقي الآن', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  expect(await page.locator('a[href*="wa.me/970599373380"]').count()).toBeGreaterThan(0);
  expect(await page.locator('script[src*="googletagmanager"], script[src*="connect.facebook.net"]').count()).toBe(0);
  expect(await page.locator('input[autocomplete="cc-number"]').count()).toBe(0);
});

test('administration and order APIs enforce trust boundaries', async ({ page, request, baseURL }) => {
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  const exportResponse = await request.get('/api/admin/orders/export');
  expect([401, 403]).toContain(exportResponse.status());
  const adminResponse = await request.post('/api/admin/product', { headers: { origin: baseURL! }, data: { operation: 'save', name: 'unauthorized' } });
  expect([401, 403]).toContain(adminResponse.status());
  const foreign = await request.post('/api/orders', { headers: { origin: 'https://foreign.example' }, data: {} });
  expect(foreign.status()).toBe(403);
  const signup = await request.post('/api/auth/sign-up/email', { headers: { origin: baseURL! }, data: { name: 'Uninvited', email: 'uninvited@example.invalid', password: 'NeverUseThisInProduction123!' } });
  expect([400, 403, 404]).toContain(signup.status());
  const lookup = await request.get('/api/order-status?token=RA-1');
  expect([400, 404, 405]).toContain(lookup.status());
});

test('missing pages and product drafts do not expose data', async ({ page }) => {
  const response = await page.goto('/products/not-a-published-product');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('غير مدفوع', { exact: true })).toHaveCount(0);
  const unknown = await page.goto('/this-page-does-not-exist');
  expect(unknown?.status()).toBe(404);
});

test('login never places a password in the URL when JavaScript is unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/admin');
    await page.getByLabel('البريد الإداري', { exact: true }).fill('offline-qa@example.invalid');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('qa-only-not-a-real-secret-9876');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    expect(page.url()).not.toContain('password');
    expect(page.url()).not.toContain('9876');
    expect(new URL(page.url()).search).toBe('');
  } finally { await context.close(); }
});
