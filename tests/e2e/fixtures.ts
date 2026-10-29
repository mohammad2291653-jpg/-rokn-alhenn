import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

export async function createShopFixture() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/test_rokn') throw new Error('E2E business fixtures require isolated test_rokn database.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await db.rateLimit.deleteMany();
  const slug = `qa-browser-${randomUUID()}`;
  const email = `${slug}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const userId = randomUUID();
  const category = await db.category.create({ data: { name: 'اختبار معزول', slug } });
  // A technical pixel in the isolated QA database is not a merchant product image.
  const product = await db.product.create({ data: {
    name: 'منتج اختبار آلي معزول', slug, categoryId: category.id,
    weightGrams: 500, priceAgorot: 7500, status: 'PUBLISHED', available: true, nameNeedsConfirmation: false,
    images: { create: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP4cAAAAASUVORK5CYII=', alt: 'صورة تقنية للاختبار فقط', originalKey: 'qa-only' } },
  } });
  await db.user.create({ data: { id: userId, name: 'مدير اختبار معزول', email, emailVerified: true, role: 'ADMIN', accounts: { create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: await hashPassword(password) } } } });
  for (const zone of [
    { code: 'west-bank', name: 'الضفة الغربية', feeAgorot: 2000, approved: true, city: 'رام الله' },
    { code: 'interior', name: 'الداخل الفلسطيني', feeAgorot: 3000, approved: true, city: 'الناصرة' },
    { code: 'jerusalem', name: 'القدس', feeAgorot: null, approved: false, city: 'القدس' },
  ]) {
    const z = await db.deliveryZone.upsert({ where: { code: zone.code }, update: { enabled: true, approved: zone.approved, feeAgorot: zone.feeAgorot }, create: { code: zone.code, name: zone.name, feeAgorot: zone.feeAgorot, approved: zone.approved, enabled: true } });
    await db.city.upsert({ where: { zoneId_name: { zoneId: z.id, name: zone.city } }, update: { enabled: true }, create: { zoneId: z.id, name: zone.city } });
  }
  for (const key of ['returns', 'privacy', 'terms']) await db.siteSetting.upsert({ where: { key }, update: { value: { approved: true, body: 'سياسة اختبار فقط' } }, create: { key, value: { approved: true, body: 'سياسة اختبار فقط' } } });
  await db.siteSetting.upsert({ where: { key: 'checkoutEnabled' }, update: { value: true }, create: { key: 'checkoutEnabled', value: true } });
  return { db, product, email, password, userId, async cleanup() {
    const orderIds = (await db.order.findMany({ where: { items: { some: { productId: product.id } } }, select: { id: true } })).map((o) => o.id);
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
    await db.category.delete({ where: { id: category.id } });
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  } };
}
