import { setTimeout as delay } from "node:timers/promises";

export const TRANSACTION_MAX_ATTEMPTS = 5;

/** Prisma errors can cross module/realm boundaries; constructor identity is not stable. */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "PrismaClientKnownRequestError"
    && (candidate.code === "P2034" || candidate.code === "P2002");
}

/** Retry the entire rolled-back transaction, with less than one second of total backoff. */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt >= TRANSACTION_MAX_ATTEMPTS - 1) throw error;
      // The rejected transaction has finished before waiting or taking a new snapshot.
      await wait(50 * 2 ** attempt + Math.floor(Math.random() * 50));
    }
  }
}
