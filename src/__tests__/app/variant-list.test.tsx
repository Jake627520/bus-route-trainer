import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VariantList } from '@/app/_components/variant-list';

/**
 * Change 07 Task 7: variant 列表元件（mock 全域 fetch）。
 * 渲染各 variant（headsign / 站數 / 方向）＋ 各自進度狀態；載入中 / 空 / 錯誤。
 */
describe('Change 07: VariantList', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  const variant = (over: Partial<Record<string, unknown>> = {}) => ({
    variantKey: 'V1',
    routeId: 'R100',
    directionId: 0,
    headsign: 'City → University',
    stopCount: 12,
    sampleTripId: 'T1',
    tripCount: 30,
    orderedStops: [],
    ...over,
  });

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a loading indicator before variants resolve', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    render(<VariantList routeId="R100" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders each variant with headsign, stop count and a not-enrolled status', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        data: [
          variant({ variantKey: 'V1', headsign: 'City → University', stopCount: 12 }),
          variant({ variantKey: 'V2', headsign: 'University → City', stopCount: 11, directionId: 1 }),
        ],
      })
    );

    render(<VariantList routeId="R100" />);

    expect(await screen.findByText('City → University')).toBeInTheDocument();
    expect(screen.getByText('University → City')).toBeInTheDocument();
    expect(screen.getByText(/12\s*站/)).toBeInTheDocument();

    // 每個 variant 都有進度狀態（初始未報名）與一顆報名按鈕
    expect(screen.getAllByText(/未報名/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /報名/ })).toHaveLength(2);
  });

  it('shows an empty state when the route has no variants', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(200, { data: [] }));
    render(<VariantList routeId="R100" />);
    expect(await screen.findByText(/沒有.*variant|沒有.*路線變化|no variants/i)).toBeInTheDocument();
  });

  it('shows an error message when the variants API fails', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(404, { error: { code: 'ROUTE_NOT_FOUND', message: "Route 'R100' not found" } })
    );
    render(<VariantList routeId="R100" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/無法載入|not found|失敗/i);
  });

  it('falls back to a placeholder when headsign is null', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, { data: [variant({ headsign: null })] })
    );
    render(<VariantList routeId="R100" />);
    const item = await screen.findByRole('listitem');
    expect(within(item).getByText(/未標示|無標示/)).toBeInTheDocument();
  });
});
