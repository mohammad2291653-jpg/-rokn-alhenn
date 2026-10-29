import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const source = process.env.TEST_DATABASE_URL;
if (source && new URL(source).pathname !== '/test_rokn') throw new Error('Bootstrap integration tests require the isolated test_rokn connection.');

describe.skipIf(!source)('dedicated free-preview database bootstrap', () => {
  const name = `rokn_free_bootstrap_${randomUUID().replaceAll('-', '')}`;
  const bootstrap = resolve('scripts/bootstrap-free-preview.mjs');
  let admin: Client | undefined;
  let db: PrismaClient | undefined;
  let url: string;
  let originalMediaProof: Buffer;
  let created = false;

  function execute(overrides: Record<string, string | undefined> = {}) {
    const env: NodeJS.ProcessEnv = {
      ...process.env, DATABASE_URL: url, FREE_PREVIEW_DATABASE_NAME: name,
      RENDER_FREE_PREVIEW: 'true', COMMERCIAL_LAUNCH_APPROVED: 'false', ALLOW_INDEXING: 'false',
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), STORAGE_DRIVER: 'disabled',
      NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', ...overrides,
    };
    return spawnSync(process.execPath, [bootstrap], { env, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
  }

  function resultOf(result: ReturnType<typeof execute>) {
    expect(result.error?.message).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    return JSON.parse(result.stdout.trim()) as { result: string; initialized: boolean; products: number; images: number; checkoutDisabled: boolean };
  }

  beforeAll(async () => {
    if (!source || new URL(source).pathname !== '/test_rokn') throw new Error('Refusing an unapproved source connection.');
    const target = new URL(source);
    target.pathname = `/${name}`;
    url = target.toString();
    const direct = new URL(source);
    direct.searchParams.delete('schema');
    admin = new Client({ connectionString: direct.toString() });
    await admin.connect();
    // name consists exclusively of this test's fixed prefix and random hex.
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    originalMediaProof = await readFile('artifacts/catalog-media-import-verification.json');
  }, 30_000);

  it('initializes the nine real draft products, 24 photographs, logo and disabled checkout in a new database', async () => {
    const result = resultOf(execute());
    expect(result).toMatchObject({ result: 'passed', initialized: true, products: 9, images: 24, checkoutDisabled: true });
    expect(await db!.product.count({ where: { status: 'DRAFT', nameNeedsConfirmation: true } })).toBe(9);
    expect(await db!.productImage.count()).toBe(24);
    expect(await db!.order.count()).toBe(0);
    expect(await db!.user.count()).toBe(0);
    expect((await db!.siteSetting.findUniqueOrThrow({ where: { key: 'checkoutEnabled' } })).value).toBe(false);
    const store = (await db!.siteSetting.findUniqueOrThrow({ where: { key: 'store' } })).value;
    expect(store).toMatchObject({ logoUrl: '/brand/rokn-alhenna-logo-transparent.webp' });
    expect((await db!.product.findUniqueOrThrow({ where: { slug: 'integrated-henna' } })).usage).toContain('شامبو أو ماسك خالٍ من الأملاح');
    expect(await readFile('artifacts/catalog-media-import-verification.json')).toEqual(originalMediaProof);
  }, 120_000);

  it('preserves later price/name/status/image changes and does not repeat successful imports or their audit records', async () => {
    const product = await db!.product.findUniqueOrThrow({ where: { slug: 'integrated-henna' } });
    await db!.product.update({ where: { id: product.id }, data: { name: 'اسم مراجعة اختبارية معزولة', priceAgorot: 8900, status: 'HIDDEN', available: false, nameNeedsConfirmation: false } });
    await db!.productImage.create({ data: { productId: product.id, url: '/catalog-media/2026-10-29/page-23.webp', originalKey: 'qa-free-preview-owned-extra', alt: 'صورة أصلية في اختبار معزول', position: 99 } });
    const before = await db!.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: { orderBy: { id: 'asc' } } } });
    const auditCount = await db!.auditLog.count();
    const checkpoint = await db!.siteSetting.findUniqueOrThrow({ where: { key: 'renderFreePreviewBootstrap' } });
    expect(resultOf(execute())).toMatchObject({ initialized: false, products: 9, images: 25, checkoutDisabled: true });
    expect(await db!.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: { orderBy: { id: 'asc' } } } })).toEqual(before);
    expect(await db!.auditLog.count()).toBe(auditCount);
    expect(await db!.siteSetting.findUniqueOrThrow({ where: { key: 'renderFreePreviewBootstrap' } })).toEqual(checkpoint);
    expect(await readFile('artifacts/catalog-media-import-verification.json')).toEqual(originalMediaProof);
  }, 120_000);

  it('rejects missing safety flags and a mismatched database name without exposing its connection', async () => {
    const productCount = await db!.product.count();
    for (const overrides of [
      { RENDER_FREE_PREVIEW: 'false' },
      { COMMERCIAL_LAUNCH_APPROVED: 'true' },
      { ALLOW_INDEXING: 'true' },
      { FREE_PREVIEW_DATABASE_NAME: `${name}_wrong` },
    ]) {
      const result = execute(overrides);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain(url);
      expect(result.stderr).not.toContain(decodeURIComponent(new URL(url).password));
      expect(JSON.parse(result.stderr.trim()).result).toBe('failed');
    }
    expect(await db!.product.count()).toBe(productCount);
  }, 30_000);

  it('refuses a populated-order database and leaves its existing records unchanged', async () => {
    const id = randomUUID();
    const order = await db!.order.create({ data: {
      id, number: `qa-free-${id}`, customerName: 'سجل اختبار معزول', phone: '0599123456',
      zoneId: 'zone-west-bank', zoneName: 'الضفة الغربية', city: 'رام الله', address: 'عنوان اختبار معزول',
      subtotalAgorot: 7500, deliveryAgorot: 2000, totalAgorot: 9500,
      trackingTokenHash: randomBytes(32).toString('hex'), trackingTokenSealed: 'isolated-bootstrap-test-only',
      idempotencyKey: id, requestHash: randomBytes(32).toString('hex'),
    } });
    try {
      const result = execute();
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr.trim())).toMatchObject({ code: 'PREVIEW_EXISTING_ORDERS', result: 'failed' });
      expect(await db!.order.findUniqueOrThrow({ where: { id } })).toEqual(order);
      expect(await db!.productImage.count()).toBe(25);
    } finally { await db!.order.delete({ where: { id } }); }
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (admin && created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name]);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin?.end();
  });
});
