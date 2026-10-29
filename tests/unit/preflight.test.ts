import { describe, expect, it } from 'vitest';
import { assessPreflight, parsePreflightArgs, secureHttpsUrl, strongSecret, type PreflightDatabaseSnapshot } from '../../scripts/preflight-checks';

const env = {
  NEXT_PUBLIC_SITE_URL: 'https://preview.roknalhenna.com', BETTER_AUTH_URL: 'https://preview.roknalhenna.com/',
  BETTER_AUTH_SECRET: '8dLx54ZM0F3vK9aR2B6wE7uN1pS5hJ4gC0tQ9yV3rX6mA2kH',
  STORAGE_DRIVER: 's3', S3_REGION: 'region-1', S3_BUCKET: 'private-store-media',
  S3_ACCESS_KEY_ID: 'fixture-access-key', S3_SECRET_ACCESS_KEY: 'fixture-secret-key', S3_PUBLIC_URL: 'https://media.roknalhenna.com/bucket',
  COMMERCIAL_LAUNCH_APPROVED: 'false', ALLOW_INDEXING: 'false',
};
function snapshot(): PreflightDatabaseSnapshot {
  return { administratorCount: 1, checkoutEnabled: false, logoUrl: '/brand/rokn-alhenna-logo-transparent.webp', policiesApproved: { returns: false, privacy: false, terms: false }, products: { total: 9, draft: 9, published: 0, incompletePublished: 0, missingImages: 2, pendingNames: 9, missingUsage: 4, missingIngredients: 4 }, zones: [{ code: 'west-bank', enabled: true, approved: true, feeAgorot: 2000 }, { code: 'interior', enabled: true, approved: true, feeAgorot: 3000 }, { code: 'jerusalem', enabled: true, approved: false, feeAgorot: null }] };
}
const failures = (report: ReturnType<typeof assessPreflight>) => report.checks.filter(check => !check.passed).map(check => check.id);

describe('hosted preview and launch readiness boundaries', () => {
  it('allows unpublished content for a safe hosted preview and reports content gaps separately without mutating input', () => {
    const data = snapshot();
    const before = structuredClone(data);
    const report = assessPreflight(env, data, 'preview', '2026-10-29T00:00:00.000Z');
    expect(report.ready).toBe(true);
    expect(report.content.notices.map(notice => notice.id)).toEqual(expect.arrayContaining(['draft-products', 'products-missing-images', 'policy-returns']));
    expect(data).toEqual(before);
  });
  it('blocks commercial launch for the exact same preview settings', () => {
    expect(failures(assessPreflight(env, snapshot(), 'launch'))).toEqual(expect.arrayContaining(['commercial-launch-approved', 'checkout-setting', 'policy-returns-approved', 'published-products']));
  });
  it.each(['COMMERCIAL_LAUNCH_APPROVED', 'ALLOW_INDEXING'] as const)('blocks hosted preview when %s is true or not explicit', (key) => {
    expect(assessPreflight({ ...env, [key]: 'true' }, snapshot(), 'preview').ready).toBe(false);
    expect(assessPreflight({ ...env, [key]: undefined }, snapshot(), 'preview').ready).toBe(false);
  });
  it('blocks a preview whose database checkout is enabled', () => {
    expect(failures(assessPreflight(env, { ...snapshot(), checkoutEnabled: true }, 'preview'))).toContain('checkout-setting');
  });
  it('keeps database failure generic and does not pretend missing rows were checked', () => {
    const report = assessPreflight(env, null, 'preview');
    expect(failures(report)).toEqual(['database-readable']);
    expect(report.content.counts).toBeNull();
    expect(report.checks.some(check => check.id === 'private-administrator')).toBe(false);
  });
  it('requires an administrator and permanent media rather than a local development setup', () => {
    const data = { ...snapshot(), administratorCount: 0, logoUrl: '/uploads/products/logo.webp' };
    expect(failures(assessPreflight({ ...env, STORAGE_DRIVER: 'local' }, data, 'preview'))).toEqual(expect.arrayContaining(['private-administrator', 'official-logo', 'permanent-storage-driver']));
  });
  it('rejects enabled Gaza, unknown regions, and approved zones with missing or negative fees', () => {
    for (const zone of [{ code: 'gaza', enabled: true, approved: true, feeAgorot: 2000 }, { code: 'unknown', enabled: true, approved: true, feeAgorot: 2000 }, { code: 'jerusalem', enabled: true, approved: true, feeAgorot: null }, { code: 'west-bank', enabled: true, approved: true, feeAgorot: -1 }]) {
      expect(assessPreflight(env, { ...snapshot(), zones: [zone] }, 'preview').ready).toBe(false);
    }
  });
  it('accepts launch only with explicit authorization, checkout, policies, and a complete published catalog', () => {
    const data = snapshot();
    data.checkoutEnabled = true;
    data.policiesApproved = { returns: true, privacy: true, terms: true };
    data.products = { total: 1, draft: 0, published: 1, incompletePublished: 0, missingImages: 0, pendingNames: 0, missingUsage: 0, missingIngredients: 0 };
    expect(assessPreflight({ ...env, COMMERCIAL_LAUNCH_APPROVED: 'true' }, data, 'launch').ready).toBe(true);
    data.products.incompletePublished = 1;
    expect(failures(assessPreflight({ ...env, COMMERCIAL_LAUNCH_APPROVED: 'true' }, data, 'launch'))).toContain('published-products-complete');
  });
  it('does not include supplied secrets, URLs, storage names, or administrator identifiers in output', () => {
    const report = JSON.stringify(assessPreflight({ ...env, ADMIN_PASSWORD: 'do-not-print-this-password' }, snapshot(), 'preview'));
    for (const value of Object.values(env).filter(value => value.length > 15)) expect(report).not.toContain(value);
    expect(report).not.toContain('do-not-print-this-password');
  });
});

describe('strict configuration parsing', () => {
  it.each(['https://', 'https://user:password@store.roknalhenna.com', 'https://store.roknalhenna.com/?secret=x', 'https://store.roknalhenna.com/#x', 'https://store.roknalhenna.com/path', 'http://store.roknalhenna.com', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://10.0.0.1', 'https://store.invalid', ' https://store.roknalhenna.com', 'https:\\store.roknalhenna.com', 'https://store.roknalhenna.com\0'])('rejects invalid, non-public, or non-origin store URL: %s', value => {
    expect(secureHttpsUrl(value, true)).toBeNull();
  });
  it('allows a media path and compares equivalent HTTPS origins without requiring identical strings', () => {
    expect(secureHttpsUrl(env.S3_PUBLIC_URL)?.pathname).toBe('/bucket');
    expect(secureHttpsUrl('https://fdb.roknalhenna.com')?.hostname).toBe('fdb.roknalhenna.com');
    expect(assessPreflight(env, snapshot(), 'preview').ready).toBe(true);
    expect(failures(assessPreflight({ ...env, BETTER_AUTH_URL: 'https://another.roknalhenna.com' }, snapshot(), 'preview'))).toContain('auth-origin-matches');
  });
  it('rejects absent, short, repetitive, whitespace, and obvious placeholder secrets', () => {
    for (const value of [undefined, 'short', 'a'.repeat(96), env.BETTER_AUTH_SECRET + ' ', 'replace-me-with-a-real-secret-0123456789abcdef0123456789']) expect(strongSecret(value)).toBe(false);
    expect(strongSecret(env.BETTER_AUTH_SECRET)).toBe(true);
  });
  it('defaults to launch, accepts preview and JSON, and rejects ambiguous unsupported arguments', () => {
    expect(parsePreflightArgs([])).toMatchObject({ mode: 'launch', json: false });
    expect(parsePreflightArgs(['--preview', '--json'])).toMatchObject({ mode: 'preview', json: true });
    expect(() => parsePreflightArgs(['--approve'])).toThrow();
    expect(() => parsePreflightArgs(['--preview', '--preview'])).toThrow();
  });
});
