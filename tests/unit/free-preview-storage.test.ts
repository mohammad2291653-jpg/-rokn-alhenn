import { afterEach, describe, expect, it, vi } from 'vitest';

const { imageProcessor, objectStorage } = vi.hoisted(() => ({ imageProcessor: vi.fn(), objectStorage: vi.fn() }));
vi.mock('sharp', () => ({ default: imageProcessor }));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: objectStorage, PutObjectCommand: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: {} }));
import { storeOriginal } from '../../src/lib/storage';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('free preview cannot persist uploaded files', () => {
  it.each(['local', 's3'])('blocks %s image uploads before reading or processing bytes', async (driver) => {
    vi.stubEnv('RENDER_FREE_PREVIEW', 'true');
    vi.stubEnv('STORAGE_DRIVER', driver);
    vi.stubEnv('NODE_ENV', 'production');
    const arrayBuffer = vi.fn();
    const file = { size: 1024, type: 'image/png', arrayBuffer } as unknown as File;
    await expect(storeOriginal(file)).rejects.toMatchObject({ status: 503, code: 'PREVIEW_READ_ONLY' });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(imageProcessor).not.toHaveBeenCalled();
    expect(objectStorage).not.toHaveBeenCalled();
  });
});
