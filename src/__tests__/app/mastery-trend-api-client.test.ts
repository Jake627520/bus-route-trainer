import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError, type MasteryTrendPoint } from '@/app/_lib/api-client';

/**
 * Change 17 Task 6: api-client.getMasteryTrend 契約測試（mock fetch）。
 */
describe('Change 17: ApiClient.getMasteryTrend', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });

  const res = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  it('unwraps { data } into MasteryTrendPoint[]', async () => {
    const trend: MasteryTrendPoint[] = [
      { date: '2026-01-01', masteredCount: 1 },
      { date: '2026-01-02', masteredCount: 3 },
    ];
    mockFetch.mockResolvedValueOnce(res(200, { data: trend }));

    const result = await client.getMasteryTrend();

    expect(result).toEqual(trend);
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/review/mastery-trend', undefined);
  });

  it('maps { error } into a typed ApiError', async () => {
    mockFetch.mockResolvedValueOnce(res(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
    const err = await client.getMasteryTrend().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
  });
});
