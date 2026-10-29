import { isIP } from 'node:net';

export type PreflightMode = 'launch' | 'preview';
export type PreflightEnvironment = Record<string, string | undefined>;
export type PreflightDatabaseSnapshot = {
  administratorCount: number;
  checkoutEnabled: boolean;
  logoUrl: string | null;
  policiesApproved: { returns: boolean; privacy: boolean; terms: boolean };
  products: {
    total: number;
    draft: number;
    published: number;
    incompletePublished: number;
    missingImages: number;
    pendingNames: number;
    missingUsage: number;
    missingIngredients: number;
  };
  zones: { code: string; enabled: boolean; approved: boolean; feeAgorot: number | null }[];
};
type Check = { id: string; passed: boolean; message: string };
type ContentNotice = { id: string; message: string; count: number };

/** Validate configuration without echoing URLs, credentials, or supplied values. */
export function secureHttpsUrl(value: string | undefined | null, originOnly = false): URL | null {
  if (!value || /[\s\\]/u.test(value) || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (originOnly && url.pathname !== '/') return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname || !hostname.includes('.') && !hostname.includes(':')) return null;
    const addressVersion = isIP(hostname);
    if (!addressVersion && (hostname.length > 253 || hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(label)))) return null;
    if (hostname === 'localhost' || /\.(localhost|local|internal|invalid|test|example)$/u.test(hostname)) return null;
    if (addressVersion === 4 && /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(hostname)) return null;
    if (addressVersion === 6 && (hostname === '::' || hostname === '::1' || /^(?:fc|fd|fe[89ab]|ff|::ffff:)/u.test(hostname))) return null;
    return url;
  } catch { return null; }
}

export function strongSecret(value: string | undefined, minimum = 48): boolean {
  return Boolean(value && value.length >= minimum && !/\s/u.test(value) && new Set(value).size >= 10 && !/^(?:change[-_]?me|replace[-_]?me|your[-_]|example[-_]|test[-_]secret)/iu.test(value));
}

export function parsePreflightArgs(args: string[]) {
  const supported = new Set(['--preview', '--json', '--help']);
  if (args.some(arg => !supported.has(arg)) || new Set(args).size !== args.length) throw new Error('Use preflight [--preview] [--json] or --help.');
  return { mode: args.includes('--preview') ? 'preview' as const : 'launch' as const, json: args.includes('--json'), help: args.includes('--help') };
}

export function assessPreflight(env: PreflightEnvironment, snapshot: PreflightDatabaseSnapshot | null, mode: PreflightMode, checkedAt = new Date().toISOString()) {
  const checks: Check[] = [];
  const notices: ContentNotice[] = [];
  const need = (id: string, passed: unknown, message: string) => checks.push({ id, passed: Boolean(passed), message });
  const site = secureHttpsUrl(env.NEXT_PUBLIC_SITE_URL, true);
  const auth = secureHttpsUrl(env.BETTER_AUTH_URL, true);
  need('site-https-origin', site, 'Configure a public HTTPS origin without a path, credentials, query, or fragment.');
  need('auth-origin-matches', site && auth && site.origin === auth.origin, 'Authentication must use the same public HTTPS origin as the store.');
  need('auth-secret', strongSecret(env.BETTER_AUTH_SECRET), 'Provide a private strong authentication secret of at least 48 characters.');
  need('order-token-secret', !env.ORDER_TOKEN_SECRET || strongSecret(env.ORDER_TOKEN_SECRET, 32), 'If configured, the order-token secret must be strong and at least 32 characters.');
  need('bootstrap-password-removed', !env.ADMIN_PASSWORD, 'Remove the administrator bootstrap password from the running environment.');
  need('permanent-storage-driver', env.STORAGE_DRIVER === 's3', 'Hosted environments require permanent S3-compatible storage.');
  need('storage-configuration', ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].every(name => Boolean(env[name]?.trim())), 'Configure the S3 region, bucket, and private write credentials.');
  need('storage-public-https', secureHttpsUrl(env.S3_PUBLIC_URL), 'Configure a public HTTPS media base URL without embedded credentials, query, or fragment.');
  if (mode === 'preview') {
    need('commercial-launch-disabled', env.COMMERCIAL_LAUNCH_APPROVED === 'false', 'Hosted previews must explicitly set COMMERCIAL_LAUNCH_APPROVED=false.');
    need('indexing-disabled', env.ALLOW_INDEXING === 'false', 'Hosted previews must explicitly set ALLOW_INDEXING=false.');
  } else {
    need('commercial-launch-approved', env.COMMERCIAL_LAUNCH_APPROVED === 'true', 'Commercial launch requires explicit owner approval and COMMERCIAL_LAUNCH_APPROVED=true.');
  }
  need('database-readable', snapshot, 'The configured database must be reachable and its application schema readable.');
  if (snapshot) {
    need('private-administrator', snapshot.administratorCount > 0, 'Create a private administrator with a password account.');
    const localLogo = ['/brand/rokn-alhenna-logo.webp', '/brand/rokn-alhenna-logo-transparent.webp'].includes(snapshot.logoUrl ?? '');
    need('official-logo', localLogo || secureHttpsUrl(snapshot.logoUrl), 'Configure the original official logo using its bundled asset or permanent HTTPS media.');
    need('checkout-setting', mode === 'preview' ? !snapshot.checkoutEnabled : snapshot.checkoutEnabled, mode === 'preview' ? 'Checkout must remain disabled in the preview database.' : 'Enable checkout only after owner approval and content review.');
    need('gaza-disabled', !snapshot.zones.some(zone => zone.enabled && zone.code === 'gaza'), 'Delivery to Gaza must remain disabled.');
    need('supported-delivery-zones', !snapshot.zones.some(zone => zone.enabled && !['west-bank', 'interior', 'jerusalem'].includes(zone.code)), 'Only approved delivery regions may be enabled.');
    need('delivery-fees-valid', snapshot.zones.filter(zone => zone.enabled && zone.approved).every(zone => Number.isSafeInteger(zone.feeAgorot) && zone.feeAgorot! >= 0), 'Approved delivery zones require a valid nonnegative server-side fee.');
    for (const key of ['returns', 'privacy', 'terms'] as const) {
      if (mode === 'launch') need(`policy-${key}-approved`, snapshot.policiesApproved[key], `The ${key} policy needs owner review and approval.`);
      if (!snapshot.policiesApproved[key]) notices.push({ id: `policy-${key}`, count: 1, message: `The ${key} policy is awaiting owner review; preview does not approve or publish it.` });
    }
    if (mode === 'launch') {
      need('published-products', snapshot.products.published > 0, 'Approve and publish at least one product before commercial launch.');
      need('published-products-complete', snapshot.products.incompletePublished === 0, 'Published products require confirmed names, original photographs, and positive prices and weights.');
    }
    const contentFields = [
      ['draft', 'draft-products', 'Products remain drafts awaiting review.'],
      ['missingImages', 'products-missing-images', 'Products still need original product photographs.'],
      ['pendingNames', 'products-pending-names', 'Product names still need owner confirmation.'],
      ['missingUsage', 'products-missing-usage', 'Confirmed usage instructions are incomplete.'],
      ['missingIngredients', 'products-missing-ingredients', 'Confirmed ingredient information is incomplete.'],
      ['incompletePublished', 'incomplete-published-products', 'Some published products require review before commercial use.'],
    ] as const;
    for (const [field, id, message] of contentFields) if (snapshot.products[field]) notices.push({ id, count: snapshot.products[field], message });
  }
  return {
    schemaVersion: 1,
    mode,
    checkedAt,
    ready: checks.every(check => check.passed),
    checks,
    content: { counts: snapshot?.products ?? null, notices },
    limitations: [
      'Configuration and read-only database checks do not test public reachability, HTTPS certificates, media access, backup restoration, or real-device behavior.',
      'Passing preview checks does not publish draft content or authorize commercial launch.',
    ],
  };
}
