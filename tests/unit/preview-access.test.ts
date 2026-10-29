import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPreviewSession, isFreePreview, PREVIEW_COOKIE, PREVIEW_SESSION_SECONDS, previewSessionValid, previewTokenValid } from '../../src/lib/preview-access';

const secret = randomBytes(48).toString('base64url');
const wrongSecret = randomBytes(48).toString('base64url');
const now = Date.UTC(2026, 9, 29, 12, 0, 0);

describe('read-only preview access boundary', () => {
  it('requires the explicit free-preview flag', () => {
    expect(isFreePreview({ RENDER_FREE_PREVIEW: 'true' })).toBe(true);
    for (const flag of [undefined, '', 'false', 'TRUE', '1', ' true ']) expect(isFreePreview({ RENDER_FREE_PREVIEW: flag })).toBe(false);
    expect(PREVIEW_COOKIE).toBe('rokn_preview');
  });

  it('accepts only the exact strong configured access token', () => {
    expect(previewTokenValid(secret, secret)).toBe(true);
    expect(previewTokenValid(wrongSecret, secret)).toBe(false);
    expect(previewTokenValid('A' + secret, 'a' + secret)).toBe(false);
    expect(previewTokenValid(secret + 'x', secret)).toBe(false);
  });

  it.each([undefined, null, '', 'short', 'x'.repeat(257), ' bad-token-' + secret, secret + '\n', 'ا'.repeat(48)])('rejects a missing or malformed provided token %#', token => {
    expect(previewTokenValid(token, secret)).toBe(false);
  });

  it.each([undefined, '', 'short', 'a'.repeat(64), 'x'.repeat(257), secret + ' '])('fails closed with a missing or weak configured secret %#', value => {
    expect(previewTokenValid(secret, value)).toBe(false);
    expect(previewSessionValid(createPreviewSession(secret, now), value, now)).toBe(false);
  });

  it('creates a distinct signed cookie without embedding the raw access token', () => {
    const cookie = createPreviewSession(secret, now);
    const expiry = Math.floor(now / 1000) + PREVIEW_SESSION_SECONDS;
    expect(cookie).toMatch(new RegExp(`^v1\\.${expiry}\\.[A-Za-z0-9_-]{43}$`));
    expect(cookie).not.toContain(secret);
    expect(previewSessionValid(cookie, secret, now)).toBe(true);
    expect(previewSessionValid(cookie, wrongSecret, now)).toBe(false);
    expect(previewTokenValid(cookie, secret)).toBe(false);
  });

  it('rejects expiry exactly at the deadline and thereafter', () => {
    const cookie = createPreviewSession(secret, now);
    const expiry = (Math.floor(now / 1000) + PREVIEW_SESSION_SECONDS) * 1000;
    expect(previewSessionValid(cookie, secret, expiry - 1)).toBe(true);
    expect(previewSessionValid(cookie, secret, expiry)).toBe(false);
    expect(previewSessionValid(cookie, secret, expiry + 1)).toBe(false);
  });

  it('rejects a legitimately signed expiry beyond the maximum session lifetime', () => {
    const expiry = String(Math.floor(now / 1000) + PREVIEW_SESSION_SECONDS + 1);
    const signature = createHmac('sha256', secret).update('rokn-preview-v1:session:' + expiry).digest('base64url');
    expect(previewSessionValid(`v1.${expiry}.${signature}`, secret, now)).toBe(false);
  });

  it('rejects signatures made for another purpose', () => {
    const expiry = String(Math.floor(now / 1000) + PREVIEW_SESSION_SECONDS);
    const signature = createHmac('sha256', secret).update('order-tracking:' + expiry).digest('base64url');
    expect(previewSessionValid(`v1.${expiry}.${signature}`, secret, now)).toBe(false);
  });

  it('rejects a tampered timestamp or signature', () => {
    const cookie = createPreviewSession(secret, now);
    const [version, expiry, signature] = cookie.split('.');
    expect(previewSessionValid(`${version}.${Number(expiry) - 1}.${signature}`, secret, now)).toBe(false);
    const altered = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    expect(previewSessionValid(`${version}.${expiry}.${altered}`, secret, now)).toBe(false);
  });

  it.each([undefined, null, '', secret, 'v2.1000000000.' + 'a'.repeat(43), 'v1.01000000000.' + 'a'.repeat(43), 'v1.1.' + 'a'.repeat(42), 'x'.repeat(257)])('rejects malformed cookies %#', cookie => {
    expect(previewSessionValid(cookie, secret, now)).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('rejects an invalid clock %#', clock => {
    expect(() => createPreviewSession(secret, clock)).toThrow('Preview access is not configured.');
    expect(previewSessionValid(createPreviewSession(secret, now), secret, clock)).toBe(false);
  });

  it('does not mint a session from a weak secret', () => {
    for (const value of ['', 'too-short', 'z'.repeat(64)]) expect(() => createPreviewSession(value, now)).toThrow('Preview access is not configured.');
  });
});
