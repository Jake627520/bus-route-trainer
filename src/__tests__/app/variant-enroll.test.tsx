import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VariantList } from '@/app/_components/variant-list';

/**
 * Change 07 Task 9: Enroll 互動測試（mock 全域 fetch）。
 * 點「報名」→ POST /api/progress/enroll → 該列更新為已報名/進度；失敗顯示錯誤。
 */
describe('Change 07: VariantList enroll interaction', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  const variantsBody = {
    data: [
      {
        variantKey: 'V1',
        routeId: 'R100',
        directionId: 0,
        headsign: 'City → University',
        stopCount: 12,
        sampleTripId: 'T1',
        tripCount: 30,
        orderedStops: [],
      },
    ],
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('enrolls on click and updates the row to show progress + practice link', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes(200, variantsBody))
      .mockResolvedValueOnce(
        jsonRes(201, {
          data: {
            id: 'p1', driverId: 'driver_default_local', routeId: 'R100', directionId: 0,
            targetVariantKey: 'V1', status: 'NOT_STARTED', enrolledAt: '2026-09-23T00:00:00.000Z',
            lastStudiedAt: null, totalCards: 12,
          },
        })
      );

    render(<VariantList routeId="R100" />);
    const enrollBtn = await screen.findByRole('button', { name: /報名/ });
    fireEvent.click(enrollBtn);

    // 該列更新為已報名狀態，並出現「開始練習」入口
    expect(await screen.findByText(/已報名/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /開始練習/ })).toHaveAttribute('href', '/practice/recall');
    expect(screen.queryByRole('button', { name: /報名/ })).not.toBeInTheDocument();

    // 第二次呼叫是 POST /api/progress/enroll，body 帶 routeId + variantKey，且不含 driverId
    const [, init] = mockFetch.mock.calls[1];
    expect(init).toMatchObject({ method: 'POST' });
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload).toEqual({ routeId: 'R100', variantKey: 'V1' });
    expect(payload).not.toHaveProperty('driverId');
  });

  it('shows an inline error when enrollment fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes(200, variantsBody))
      .mockResolvedValueOnce(
        jsonRes(404, { error: { code: 'VARIANT_NOT_FOUND', message: 'variant missing' } })
      );

    render(<VariantList routeId="R100" />);
    fireEvent.click(await screen.findByRole('button', { name: /報名/ }));

    const item = await screen.findByRole('listitem');
    expect(await within(item).findByRole('alert')).toHaveTextContent(/報名失敗/);
    // 仍可重試
    expect(within(item).getByRole('button', { name: /報名/ })).toBeInTheDocument();
  });
});
