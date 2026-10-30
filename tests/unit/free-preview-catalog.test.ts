import { afterEach, describe, expect, it, vi } from 'vitest';

const { cookieValue, findProducts } = vi.hoisted(() => ({ cookieValue: vi.fn(), findProducts: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieValue }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('REDIRECT:' + path); } }));
vi.mock('../../src/lib/db', () => ({ db: { product: { findMany: findProducts } } }));
import { getProducts, visibleProducts } from '../../src/components/store/data';
import { createPreviewSession } from '../../src/lib/preview-access';

const secret = 'fixture_preview_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('catalog read capability', () => {
  it('keeps normal storefront queries limited to approved published products', async () => {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'false');
    findProducts.mockResolvedValueOnce([]);
    await expect(getProducts()).resolves.toEqual([]);
    expect(findProducts).toHaveBeenCalledWith(expect.objectContaining({ where: visibleProducts }));
    expect(cookieValue).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated preview before any product database query', async () => {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'true');
    vi.stubEnv('PREVIEW_ACCESS_TOKEN', secret);
    cookieValue.mockReturnValue(undefined);
    await expect(getProducts()).rejects.toThrow('REDIRECT:/preview-login');
    expect(findProducts).not.toHaveBeenCalled();
  });

  it('fails closed when the access secret is missing, even with a previously valid cookie', async () => {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'true');
    vi.stubEnv('PREVIEW_ACCESS_TOKEN', '');
    cookieValue.mockReturnValue({ value: createPreviewSession(secret) });
    await expect(getProducts()).rejects.toThrow('REDIRECT:/preview-login');
    expect(findProducts).not.toHaveBeenCalled();
  });

  it('allows the owner to review drafts without sending internal inventory to the browser', async () => {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'true');
    vi.stubEnv('PREVIEW_ACCESS_TOKEN', secret);
    cookieValue.mockReturnValue({ value: createPreviewSession(secret) });
    findProducts.mockResolvedValueOnce([{ id: 'draft', available: true, stockTracked: true, stockQuantity: 0 }]);
    await expect(getProducts()).resolves.toEqual([{ id: 'draft', available: false }]);
    expect(findProducts).toHaveBeenCalledWith(expect.objectContaining({ where: { images: { some: {} } } }));
  });
});
