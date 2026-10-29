import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSameOrigin, jsonError, readJson } from '../../src/lib/security';
import { storeOriginal, verifyUploadedImage } from '../../src/lib/storage';

vi.mock('../../src/lib/db', () => ({ db: {} }));
const originalOrigin = process.env.BETTER_AUTH_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = originalOrigin;
  if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = originalSecret;
  vi.restoreAllMocks();
});

describe('HTTP and uploaded-image trust boundaries', () => {
  it('accepts only the configured exact origin for mutations', () => {
    process.env.BETTER_AUTH_URL = 'https://shop.example';
    expect(() => assertSameOrigin(new Request('https://shop.example/api/orders', { headers: { origin: 'https://shop.example', 'sec-fetch-site': 'same-origin' } }))).not.toThrow();
    for (const headers of [{}, { origin: 'https://evil.example' }, { origin: 'https://shop.example', 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      expect(() => assertSameOrigin(new Request('https://shop.example/api/orders', { headers }))).toThrow();
    }
  });
  it('rejects malformed and oversized JSON', async () => {
    await expect(readJson(new Request('https://shop.example/api/orders', { method: 'POST', body: '{' }))).rejects.toThrow();
    await expect(readJson(new Request('https://shop.example/api/orders', { method: 'POST', body: JSON.stringify({ notes: 'x'.repeat(70_000) }) }))).rejects.toThrow();
    expect(await readJson(new Request('https://shop.example/api/orders', { method: 'POST', body: '{"quantity":2}' }))).toEqual({ quantity: 2 });
  });
  it('does not return internal exceptions to a customer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = jsonError(new Error('database-password=PRIVATE_DO_NOT_EXPOSE'));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE_DO_NOT_EXPOSE');
  });
  it('rejects attaching an image without a signed upload receipt', () => {
    process.env.BETTER_AUTH_SECRET = 'test-only-secret-at-least-thirty-two-characters';
    expect(() => verifyUploadedImage({ url: 'https://evil.example/forged.webp', originalKey: 'originals/forged.png' })).toThrow();
    expect(() => verifyUploadedImage({ url: 'https://evil.example/forged.webp', originalKey: 'originals/forged.png', proof: 'a'.repeat(64) })).toThrow();
  });
  it('rejects empty/oversized, SVG and disguised non-image uploads', async () => {
    await expect(storeOriginal(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow();
    await expect(storeOriginal(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow();
    await expect(storeOriginal(new File(['<svg onload="alert(1)"/>'], 'unsafe.svg', { type: 'image/svg+xml' }))).rejects.toThrow();
    await expect(storeOriginal(new File(['<script>alert(1)</script>'], 'fake.png', { type: 'image/png' }))).rejects.toThrow();
  });
});
