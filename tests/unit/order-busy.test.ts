import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { TRANSACTION_MAX_ATTEMPTS } from '../../src/lib/transaction-retry';

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: { $transaction: transaction } }));
import { createOrder } from '../../src/lib/order-service';

afterEach(() => { vi.unstubAllEnvs(); transaction.mockReset(); });

it('returns a retryable service response after bounded database contention', async () => {
  vi.stubEnv('RENDER_FREE_PREVIEW', 'false');
  vi.stubEnv('NODE_ENV', 'test');
  transaction.mockRejectedValue(Object.assign(new Error('Synthetic write conflict'), { name: 'PrismaClientKnownRequestError', code: 'P2034' }));
  await expect(createOrder({
    items: [{ productId: 'synthetic-product', quantity: 1 }], zoneId: 'synthetic-zone', city: 'رام الله',
    customerName: 'اختبار ازدحام قاعدة البيانات', phone: '0599123456', address: 'رام الله شارع الاختبار بناية ١',
    idempotencyKey: randomUUID(), acceptPolicies: true,
  })).rejects.toMatchObject({ status: 503, code: 'ORDER_BUSY' });
  expect(transaction).toHaveBeenCalledTimes(TRANSACTION_MAX_ATTEMPTS);
});
