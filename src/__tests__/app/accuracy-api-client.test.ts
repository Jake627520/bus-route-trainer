import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError, type PracticeAccuracy } from '@/app/_lib/api-client';

describe('Change 20: ApiClient.getPracticeAccuracy', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });

  const res = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  it('unwraps { data } into PracticeAccuracy', async () => {
    const acc: PracticeAccuracy = { totalAttempts: 4, passedAttempts: 3, accuracy: 0.75 };
    mockFetch.mockResolvedValueOnce(res(200, { data: acc }));
    expect(await client.getPracticeAccuracy()).toEqual(acc);
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/review/accuracy', undefined);
  });

  it('appends ?variantKey= when a variantKey is given', async () => {
    mockFetch.mockResolvedValueOnce(res(200, { data: { totalAttempts: 0, passedAttempts: 0, accuracy: 0 } }));
    await client.getPracticeAccuracy('V1:d0');
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/review/accuracy?variantKey=V1%3Ad0', undefined);
  });

  it('maps { error } into a typed ApiError', async () => {
    mockFetch.mockResolvedValueOnce(res(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
    const err = await client.getPracticeAccuracy().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
  });
});
