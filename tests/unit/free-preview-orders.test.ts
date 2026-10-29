import { afterEach, describe, expect, it, vi } from 'vitest';

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: { $transaction: transaction } }));
import { createOrder, lookupOrder, quoteOrder } from '../../src/lib/order-service';

afterEach(() => { vi.unstubAllEnvs(); transaction.mockClear(); });

describe('free preview cannot process customer orders', () => {
  function previewWithConflictingLaunchFlag() {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COMMERCIAL_LAUNCH_APPROVED', 'true');
  }

  it('blocks order creation before input handling or database transactions, even with launch approved', async () => {
    previewWithConflictingLaunchFlag();
    await expect(createOrder({})).rejects.toMatchObject({ status: 503, code: 'PREVIEW_READ_ONLY' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks shipping quotations rather than processing checkout inputs', async () => {
    previewWithConflictingLaunchFlag();
    await expect(quoteOrder({})).rejects.toMatchObject({ status: 503, code: 'PREVIEW_READ_ONLY' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks order tracking without looking up even a well-formed tracking token', async () => {
    previewWithConflictingLaunchFlag();
    await expect(lookupOrder('a'.repeat(43))).rejects.toMatchObject({ status: 503, code: 'PREVIEW_READ_ONLY' });
    expect(transaction).not.toHaveBeenCalled();
  });
});
