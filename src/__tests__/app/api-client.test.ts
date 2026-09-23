import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError } from '@/app/_lib/api-client';

/**
 * Change 07 Task 1: api-client 契約測試
 * 前端一律 mock fetch、不打真 DB。驗證 {data} 成功解包與 {error} 失敗映射。
 */
describe('Change 07: ApiClient envelope parsing', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });

  const res = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  it('unwraps { data } on success (getRoutes)', async () => {
    const routes = [{ id: 'R1', shortName: '100', longName: 'City → Uni', routeType: 3 }];
    mockFetch.mockResolvedValueOnce(res(200, { data: routes }));

    const result = await client.getRoutes();

    expect(result).toEqual(routes);
    expect(mockFetch).toHaveBeenCalledWith('https://test.local/api/routes', undefined);
  });

  it('maps { error } into a typed ApiError carrying code + status', async () => {
    mockFetch.mockResolvedValueOnce(
      res(404, { error: { code: 'ROUTE_NOT_FOUND', message: "Route 'X' not found" } })
    );

    const err = await client.getRouteVariants('X').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'ROUTE_NOT_FOUND', status: 404 });
  });

  it('surfaces a network failure as ApiError(NETWORK_ERROR)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(client.getRoutes()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('POST enroll sends JSON body and unwraps progress data', async () => {
    const progress = {
      id: 'p1', driverId: 'driver_default_local', routeId: 'R1', directionId: 0,
      targetVariantKey: 'V1', status: 'NOT_STARTED', enrolledAt: '2026-09-23T00:00:00.000Z',
      lastStudiedAt: null, totalCards: 12,
    };
    mockFetch.mockResolvedValueOnce(res(201, { data: progress }));

    const result = await client.enroll({ routeId: 'R1', variantKey: 'V1' });

    expect(result).toEqual(progress);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.local/api/progress/enroll');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ routeId: 'R1', variantKey: 'V1' });
  });
});
