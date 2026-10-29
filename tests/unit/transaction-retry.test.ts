import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { isRetryableTransactionError, TRANSACTION_MAX_ATTEMPTS, withTransactionRetry } from '../../src/lib/transaction-retry';

function conflict(code = 'P2034') {
  return Object.assign(new Error('Synthetic database conflict'), { name: 'PrismaClientKnownRequestError', code });
}

describe('bounded retries of complete database transactions', () => {
  it('recognizes a Prisma serialization error from another realm', async () => {
    const foreign = runInNewContext('Object.assign(new Error("synthetic"), { name: "PrismaClientKnownRequestError", code: "P2034" })');
    expect(foreign instanceof Error).toBe(false);
    const operation = vi.fn().mockRejectedValueOnce(foreign).mockResolvedValue('saved');
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(withTransactionRetry(operation, wait)).resolves.toBe('saved');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('returns a successful result without retrying or waiting', async () => {
    const result = { number: 'synthetic-order' };
    const operation = vi.fn().mockResolvedValue(result);
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(withTransactionRetry(operation, wait)).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it.each(['P2034', 'P2002'])('retries %s with new operation calls and increasing bounded backoff', async code => {
    const operation = vi.fn().mockRejectedValueOnce(conflict(code)).mockRejectedValueOnce(conflict(code)).mockResolvedValue('saved');
    const waits: number[] = [];
    await expect(withTransactionRetry(operation, async milliseconds => { waits.push(milliseconds); })).resolves.toBe('saved');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits.reduce((total, value) => total + value, 0)).toBeLessThan(1000);
  });

  it('stops after a bounded number of failures and preserves the final error', async () => {
    const error = conflict();
    const operation = vi.fn().mockRejectedValue(error);
    const waits: number[] = [];
    await expect(withTransactionRetry(operation, async milliseconds => { waits.push(milliseconds); })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(TRANSACTION_MAX_ATTEMPTS);
    expect(waits).toHaveLength(TRANSACTION_MAX_ATTEMPTS - 1);
    expect(waits.reduce((total, value) => total + value, 0)).toBeLessThan(1000);
  });

  it.each([
    new Error('Business failure'),
    Object.assign(new Error('Business code'), { code: 'P2034' }),
    conflict('P2003'),
    { name: 'PrismaClientKnownRequestError', code: 'P1001' },
    null,
  ])('does not retry a business error, unrelated database failure, or invalid error', async error => {
    expect(isRetryableTransactionError(error)).toBe(false);
    const operation = vi.fn().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(withTransactionRetry(operation, wait)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
