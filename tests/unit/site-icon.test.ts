import { afterEach, describe, expect, it, vi } from 'vitest';
const { setting } = vi.hoisted(() => ({ setting: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: { siteSetting: { findUnique: setting } } }));
import { GET } from '../../src/app/api/site-icon/route';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('original favicon behind a deployment proxy', () => {
  it('uses the configured public origin rather than an internal standalone bind host', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://store.example');
    setting.mockResolvedValue({ value: { logoUrl: '/brand/rokn-alhenna-logo-transparent.webp' } });
    const response = await GET(new Request('http://0.0.0.0:10000/api/site-icon'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://store.example/brand/rokn-alhenna-logo-transparent.webp');
  });
  it('preserves an approved absolute HTTPS media URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://store.example');
    setting.mockResolvedValue({ value: { logoUrl: 'https://media.example/products/original.webp' } });
    expect((await GET(new Request('http://0.0.0.0:10000/api/site-icon'))).headers.get('location')).toBe('https://media.example/products/original.webp');
  });
  it('does not redirect to script protocols', async () => {
    setting.mockResolvedValue({ value: { logoUrl: 'javascript:alert(1)' } });
    expect((await GET(new Request('http://localhost:3000/api/site-icon'))).status).toBe(204);
  });
  it('serves no invented icon if the logo lookup is unavailable', async () => {
    setting.mockRejectedValue(new Error('database unavailable'));
    expect((await GET(new Request('http://localhost:3000/api/site-icon'))).status).toBe(204);
  });
});
