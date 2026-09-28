import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError, type PracticeStreak } from '@/app/_lib/api-client';

describe('Change 22: ApiClient.getPracticeStreak', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });
  const res = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  it('unwraps { data } into PracticeStreak', async () => {
    const streak: PracticeStreak = { currentStreak: 3, longestStreak: 5, lastPracticedOn: '2026-03-10' };
    mockFetch.mockResolvedValueOnce(res(200, { data: streak }));
    expect(await client.getPracticeStreak()).toEqual(streak);
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/review/streak', undefined);
  });

  it('maps { error } into a typed ApiError', async () => {
    mockFetch.mockResolvedValueOnce(res(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
    const err = await client.getPracticeStreak().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
  });
});
