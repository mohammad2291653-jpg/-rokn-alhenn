import { randomUUID } from 'node:crypto';
import { expect, test, type Route } from '@playwright/test';
import { createShopFixture } from './fixtures';

test.describe('catalog search while the page becomes interactive', () => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Requires isolated test_rokn and matching QA server.');
  let fixture: Awaited<ReturnType<typeof createShopFixture>>;
  test.beforeAll(async () => { fixture = await createShopFixture(); });
  test.afterAll(async () => { await fixture?.cleanup(); });

  test('enables search only when input can be handled, then filters without losing the query', async ({ page }) => {
    let releaseScripts!: () => void;
    const scriptsMayLoad = new Promise<void>(resolve => { releaseScripts = resolve; });
    let heldScripts = 0;
    const isAppScript = (url: URL) => url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js');
    const holdScript = async (route: Route) => {
      heldScripts += 1;
      await scriptsMayLoad;
      await route.continue();
    };
    await page.route(isAppScript, holdScript);
    try {
      // The HTML can render while the browser is still waiting for application JavaScript.
      await page.goto('/products', { waitUntil: 'commit' });
      const search = page.getByRole('searchbox', { name: 'ابحثي عن منتج', exact: true });
      await expect(search).toBeVisible();
      await expect.poll(() => heldScripts).toBeGreaterThan(0);
      await expect(search).toBeDisabled();

      releaseScripts();
      await expect(search).toBeEnabled();
      await search.fill(`لا يوجد منتج ${randomUUID()}`);
      await expect(page.locator('.product-card')).toHaveCount(0);
      await search.fill(fixture.product.name);
      await expect(page.locator('.product-card')).toHaveCount(1);
      await expect(page.locator('.product-card').getByRole('heading', { name: fixture.product.name, exact: true })).toBeVisible();
      await expect(search).toHaveValue(fixture.product.name);
    } finally {
      // Also unblock pending requests when an assertion fails before JavaScript is released.
      releaseScripts();
      await page.unroute(isAppScript, holdScript);
    }
  });
});
