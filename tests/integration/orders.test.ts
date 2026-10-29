import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
if (testUrl && new URL(testUrl).pathname !== '/test_rokn') {
  throw new Error('Integration tests require the isolated database test_rokn. Refusing another database.');
}

// Deliberately opt in: no test ever mutates the shop database from .env.
describe.skipIf(!enabled)('PostgreSQL order transactions and delivery controls', () => {
  let db: PrismaClient;
  let service: typeof import('../../src/lib/order-service');
  let productId: string;
  let westId: string;
  let interiorId: string;
  let jerusalemId: string;
  const marker = `qa-${randomUUID()}`;
  const fixtures: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.ORDER_TOKEN_SECRET ??= 'qa-only-random-secret-6436e5066940f50a4d324445';
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
    service = await import('../../src/lib/order-service');
    const category = await db.category.create({ data: { name: 'فئة اختبار معزولة', slug: marker } });
    const p = await db.product.create({ data: {
      name: 'منتج اختبار قاعدة بيانات', slug: marker, weightGrams: 500, priceAgorot: 7500,
      categoryId: category.id, status: 'PUBLISHED', available: true, nameNeedsConfirmation: false,
      images: { create: { url: 'https://example.invalid/qa-only.webp', originalKey: 'qa-only', alt: 'اختبار داخلي فقط' } },
    } });
    productId = p.id;
    for (const zone of [
      { code: 'west-bank', name: 'الضفة الغربية', feeAgorot: 2000, approved: true, city: 'رام الله' },
      { code: 'interior', name: 'الداخل الفلسطيني', feeAgorot: 3000, approved: true, city: 'الناصرة' },
      { code: 'jerusalem', name: 'القدس', feeAgorot: null, approved: false, city: 'القدس' },
    ]) {
      const z = await db.deliveryZone.upsert({ where: { code: zone.code }, update: { enabled: true, approved: zone.approved, feeAgorot: zone.feeAgorot }, create: { code: zone.code, name: zone.name, enabled: true, approved: zone.approved, feeAgorot: zone.feeAgorot } });
      await db.city.upsert({ where: { zoneId_name: { zoneId: z.id, name: zone.city } }, update: { enabled: true }, create: { zoneId: z.id, name: zone.city } });
      if (zone.code === 'west-bank') westId = z.id;
      if (zone.code === 'interior') interiorId = z.id;
      if (zone.code === 'jerusalem') jerusalemId = z.id;
    }
    await db.siteSetting.upsert({ where: { key: 'checkoutEnabled' }, update: { value: true }, create: { key: 'checkoutEnabled', value: true } });
    for (const key of ['privacy', 'terms']) await db.siteSetting.upsert({ where: { key }, update: { value: { approved: true } }, create: { key, value: { approved: true } } });
    await db.siteSetting.upsert({ where: { key: 'returns' }, update: { value: { approved: true, body: 'سياسة اختبار معتمدة' } }, create: { key: 'returns', value: { approved: true, body: 'سياسة اختبار معتمدة' } } });
  });

  const input = (overrides: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 1 }], zoneId: westId, city: 'رام الله',
    customerName: 'زبونة اختبار', phone: '0599123456', address: 'رام الله شارع الاختبار بناية ١',
    idempotencyKey: randomUUID(), acceptPolicies: true, ...overrides,
  });
  const order = async (overrides: Record<string, unknown> = {}) => {
    const result = await service.createOrder(input(overrides));
    fixtures.push(result.number);
    return result;
  };

  it('charges 20 ILS once for the West Bank and 30 ILS once for the Interior', async () => {
    const west = await order();
    const interior = await order({ zoneId: interiorId, city: 'الناصرة', address: 'الناصرة شارع الاختبار بناية ١' });
    expect(west.subtotalAgorot).toBe(7500);
    expect(west.deliveryAgorot).toBe(2000);
    expect(west.totalAgorot).toBe(9500);
    expect(interior.deliveryAgorot).toBe(3000);
    expect(interior.totalAgorot).toBe(10500);
    const multiple = await order({ items: [{ productId, quantity: 3 }] });
    expect(multiple.deliveryAgorot).toBe(2000);
    expect(multiple.totalAgorot).toBe(24500);
  });

  it('stores COD as unpaid and creates the initial status history', async () => {
    const created = await order();
    const persisted = await db.order.findUniqueOrThrow({ where: { number: created.number }, include: { history: true } });
    expect(persisted.paymentMethod).toBe('COD');
    expect(persisted.paymentStatus).toBe('UNPAID');
    expect(persisted.status).toBe('NEW');
    expect(persisted.history).toHaveLength(1);
    expect(persisted.totalAgorot).toBe(9500);
  });

  it('rejects Gaza via zone or conflicting city/address', async () => {
    for (const changes of [
      { zoneId: 'gaza' }, { city: 'غزة' }, { address: 'غزة شارع الاختبار بناية ١' },
      { address: 'Gaza City main street building 1' }, { address: 'خان يونس شارع الاختبار' },
    ]) await expect(service.createOrder(input(changes))).rejects.toThrow();
  });

  it('does not quote an unapproved Jerusalem fee or permit a Jerusalem address under another zone', async () => {
    await expect(service.createOrder(input({ zoneId: jerusalemId, city: 'القدس', address: 'القدس شارع الاختبار' }))).rejects.toThrow();
    await expect(service.createOrder(input({ address: 'القدس شارع الاختبار بناية ١' }))).rejects.toThrow();
  });

  it('rejects forged prices, delivery and totals instead of trusting the client', async () => {
    await expect(service.createOrder(input({ deliveryAgorot: 0, totalAgorot: 1 }))).rejects.toThrow();
    await expect(service.createOrder(input({ items: [{ productId, quantity: 1, priceAgorot: 1 }] }))).rejects.toThrow();
  });

  it('rejects invalid quantities, non-existing or unavailable products', async () => {
    for (const quantity of [0, -1, 1.5, 100, Infinity]) {
      await expect(service.createOrder(input({ items: [{ productId, quantity }] }))).rejects.toThrow();
    }
    await expect(service.createOrder(input({ items: [{ productId: 'missing', quantity: 1 }] }))).rejects.toThrow();
    await db.product.update({ where: { id: productId }, data: { available: false } });
    await expect(service.createOrder(input())).rejects.toThrow();
    await db.product.update({ where: { id: productId }, data: { available: true } });
  });

  it('retries the same idempotency key without a duplicate and rejects changed payloads', async () => {
    const request = input();
    const first = await service.createOrder(request);
    fixtures.push(first.number);
    const retry = await service.createOrder(request);
    expect(retry.number).toBe(first.number);
    expect(retry.trackingToken).toBe(first.trackingToken);
    expect(await db.order.count({ where: { idempotencyKey: request.idempotencyKey } })).toBe(1);
    await expect(service.createOrder({ ...request, items: [{ productId, quantity: 2 }] })).rejects.toThrow();
  });

  it('concurrent duplicate submissions yield a single persisted order', async () => {
    const request = input();
    const results = await Promise.all([service.createOrder(request), service.createOrder(request)]);
    fixtures.push(results[0].number);
    expect(results[0].number).toBe(results[1].number);
    expect(await db.order.count({ where: { idempotencyKey: request.idempotencyKey } })).toBe(1);
  });

  it('retains the price, product name and shipping fee captured when ordered', async () => {
    const created = await order();
    await db.product.update({ where: { id: productId }, data: { priceAgorot: 9000, name: 'اسم معدل بعد الطلب' } });
    await db.deliveryZone.update({ where: { id: westId }, data: { feeAgorot: 2500 } });
    const old = await db.order.findUniqueOrThrow({ where: { number: created.number }, include: { items: true } });
    expect(old.items[0].unitPriceAgorot).toBe(7500);
    expect(old.items[0].productName).toBe('منتج اختبار قاعدة بيانات');
    expect(old.deliveryAgorot).toBe(2000);
    await db.product.update({ where: { id: productId }, data: { priceAgorot: 7500, name: 'منتج اختبار قاعدة بيانات' } });
    await db.deliveryZone.update({ where: { id: westId }, data: { feeAgorot: 2000 } });
  });

  it('exposes no personal address or phone through a random-token lookup', async () => {
    const created = await order();
    const publicOrder = await service.lookupOrder(created.trackingToken);
    expect(publicOrder).toBeTruthy();
    expect(JSON.stringify(publicOrder)).not.toContain('0599123456');
    expect(JSON.stringify(publicOrder)).not.toContain('شارع الاختبار');
    expect(JSON.stringify(publicOrder)).not.toContain('زبونة اختبار');
    await expect(service.lookupOrder(created.number)).rejects.toThrow();
    await expect(service.lookupOrder(randomUUID())).rejects.toThrow();
    const stored = await db.order.findUniqueOrThrow({ where: { number: created.number } });
    expect(stored.trackingTokenHash).not.toBe(created.trackingToken);
    expect(stored.trackingTokenSealed).not.toContain(created.trackingToken);
  });

  it('prevents overselling when real inventory tracking is enabled', async () => {
    await db.product.update({ where: { id: productId }, data: { stockTracked: true, stockQuantity: 1 } });
    const results = await Promise.allSettled([order(), order()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(0);
    await db.product.update({ where: { id: productId }, data: { stockTracked: false, stockQuantity: null } });
  });

  it('keeps checkout disabled until the owner approves launch requirements', async () => {
    await db.siteSetting.update({ where: { key: 'checkoutEnabled' }, data: { value: false } });
    await expect(service.createOrder(input())).rejects.toThrow();
    await db.siteSetting.update({ where: { key: 'checkoutEnabled' }, data: { value: true } });
    for (const key of ['returns', 'privacy', 'terms']) {
      await db.siteSetting.update({ where: { key }, data: { value: { approved: false } } });
      await expect(service.createOrder(input())).rejects.toThrow();
      await db.siteSetting.update({ where: { key }, data: { value: { approved: true } } });
    }
  });

  it('requires an explicit deployment approval before accepting commercial production orders', async () => {
    try {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('COMMERCIAL_LAUNCH_APPROVED', 'false');
      await expect(service.createOrder(input())).rejects.toThrow();
    } finally { vi.unstubAllEnvs(); }
  });

  afterAll(async () => {
    if (!db) return;
    const ids = (await db.order.findMany({ where: { number: { in: fixtures } }, select: { id: true } })).map((o) => o.id);
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.productImage.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.category.deleteMany({ where: { slug: marker } });
    await db.$disconnect();
  });
});
