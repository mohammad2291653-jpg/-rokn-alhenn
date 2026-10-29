import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest, readBody } from '../../src/lib/security';
import { verifyUploadedImage } from '../../src/lib/storage';
import { addressArea } from '../../src/lib/delivery';
vi.mock('../../src/lib/db', () => ({ db: {} }));
const secret = process.env.BETTER_AUTH_SECRET;
afterEach(() => { if (secret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = secret; });

function streamingRequest(chunks: Uint8Array[], cancelled: () => void = () => {}) {
  let index = 0;
  return new Request('https://shop.example/api/orders', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); },
      cancel() { cancelled(); },
    }),
    duplex: 'half',
  } as RequestInit);
}

describe('security regression boundaries', () => {
  it('cancels a chunked stream that exceeds the limit without trusting Content-Length', async () => {
    let cancelled = false;
    const request = streamingRequest([new Uint8Array(3), new Uint8Array(3), new Uint8Array(8)], () => { cancelled = true; });
    await expect(readBody(request, 4)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
  });
  it('accepts the exact byte limit, including multibyte Arabic content', async () => {
    const bytes = new TextEncoder().encode('غزة');
    const result = await readBody(streamingRequest([bytes.slice(0, 2), bytes.slice(2)]), bytes.byteLength);
    expect(new TextDecoder().decode(result)).toBe('غزة');
  });
  it('rebuilds a bounded request without losing multipart content type', async () => {
    const request = new Request('https://shop.example/api/admin/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=qa' }, body: '--qa--' });
    const bounded = await boundedRequest(request, 100);
    expect(bounded.headers.get('content-type')).toBe('multipart/form-data; boundary=qa');
    expect(await bounded.text()).toBe('--qa--');
  });
  it('rejects signed-upload receipt substitution of either URL or original storage key', () => {
    process.env.BETTER_AUTH_SECRET = 'test-secret-valid-length-exclusively-for-regressions';
    const original = { url: 'https://media.example/products/qa.webp', originalKey: 'originals/qa.png' };
    const proof = createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(JSON.stringify(original)).digest('hex');
    expect(verifyUploadedImage({ ...original, proof })).toBe(true);
    expect(() => verifyUploadedImage({ ...original, url: 'https://evil.example/qa.webp', proof })).toThrow();
    expect(() => verifyUploadedImage({ ...original, originalKey: 'originals/another.png', proof })).toThrow();
    expect(() => verifyUploadedImage({ ...original, proof: proof.slice(1) })).toThrow();
  });
  it.each(['بغزة', 'لغزة', 'وغزة', 'غ\u200bزة', 'غ\u200dزة'])('blocks explicit Gaza destinations even with common prefixes or invisible characters: %s', (place) => {
    expect(addressArea(`التوصيل ${place} شارع السوق`)).toBe('gaza');
  });
});
