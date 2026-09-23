import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError, type VariantReviewSummary } from '@/app/_lib/api-client';

/**
 * Change 11 Task 6: api-client.getReviewSummary 契約測試（mock fetch）。
 */
describe('Change 11: ApiClient.getReviewSummary', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });

  const res = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  it('unwraps { data } into VariantReviewSummary[]', async () => {
    const summary: VariantReviewSummary[] = [
      {
        routeId: 'R1', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS',
        dueCount: 3, newCount: 1, masteredCount: 4, totalCards: 10, nextReviewAt: '2026-09-24T00:00:00.000Z',
      },
    ];
    mockFetch.mockResolvedValueOnce(res(200, { data: summary }));

    const result = await client.getReviewSummary();

    expect(result).toEqual(summary);
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/review/summary', undefined);
  });

  it('maps { error } into a typed ApiError', async () => {
    mockFetch.mockResolvedValueOnce(res(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
    const err = await client.getReviewSummary().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
  });
});
