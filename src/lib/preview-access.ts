import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const PREVIEW_COOKIE = 'rokn_preview';
export const PREVIEW_SESSION_SECONDS = 8 * 60 * 60;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,256}$/;
const SESSION_FORMAT = /^v1\.([0-9]{1,16})\.([A-Za-z0-9_-]{43})$/;
const SESSION_PURPOSE = 'rokn-preview-v1:session:';

type PreviewEnvironment = Readonly<Record<string, string | undefined>>;

export function isFreePreview(env: PreviewEnvironment = process.env): boolean {
  return env.RENDER_FREE_PREVIEW === 'true';
}

function validSecret(value: string | undefined): value is string {
  return typeof value === 'string' && TOKEN_FORMAT.test(value) && new Set(value).size >= 10;
}

/** Compare fixed-size digests without normalizing or exposing the access token. */
export function previewTokenValid(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!validSecret(expected) || typeof provided !== 'string' || !TOKEN_FORMAT.test(provided)) return false;
  const actual = createHash('sha256').update(provided).digest();
  const wanted = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

function clockSeconds(now: number): number | null {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  return Math.floor(now / 1000);
}

function sessionSignature(secret: string, expiry: string): string {
  return createHmac('sha256', secret).update(SESSION_PURPOSE + expiry).digest('base64url');
}

/** now is milliseconds; the signed cookie stores a canonical Unix-seconds expiry. */
export function createPreviewSession(secret: string, now = Date.now()): string {
  const seconds = clockSeconds(now);
  if (!validSecret(secret) || seconds === null) throw new Error('Preview access is not configured.');
  const expiry = String(seconds + PREVIEW_SESSION_SECONDS);
  return `v1.${expiry}.${sessionSignature(secret, expiry)}`;
}

/** This cookie authorizes only the separate read-only preview, never an admin role. */
export function previewSessionValid(cookie: string | null | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!validSecret(secret) || typeof cookie !== 'string' || cookie.length > 256) return false;
  const seconds = clockSeconds(now);
  const parts = SESSION_FORMAT.exec(cookie);
  if (seconds === null || !parts) return false;
  const expiry = Number(parts[1]);
  if (!Number.isSafeInteger(expiry) || String(expiry) !== parts[1] || expiry <= seconds || expiry > seconds + PREVIEW_SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(parts[2], 'ascii'), Buffer.from(sessionSignature(secret, parts[1]), 'ascii'));
}
