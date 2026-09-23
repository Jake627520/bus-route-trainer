import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VariantList } from '@/app/_components/variant-list';

/**
 * Change 07 Task 9 (Change 12 更新為 by-URL mock): Enroll 互動測試。
 * 點「報名」→ POST /api/progress/enroll → 該列更新為已報名/進度；失敗顯示錯誤。
 * mount 會同時抓 variants 與 review summary（summary 回空 → V1 初始未報名）。
 */
describe('Change 07/12: VariantList enroll interaction', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  const variantsBody = {
    data: [
      { variantKey: 'V1', routeId: 'R100', directionId: 0, headsign: 'City → University', stopCount: 12, sampleTripId: 'T1', tripCount: 30, orderedStops: [] },
    ],
  };

  /** 依 URL 分派：variants / summary(空) / enroll(POST) */
  const dispatch = (enroll: Response) =>
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/review/summary')) return Promise.resolve(jsonRes(200, { data: [] }));
      if (u.includes('/variants')) return Promise.resolve(jsonRes(200, variantsBody));
      if (u.includes('/api/progress/enroll') && init?.method === 'POST') return Promise.resolve(enroll);
      return Promise.reject(new Error(`unexpected ${u}`));
    });

  beforeEach(() => {});
  afterEach(() => vi.unstubAllGlobals());

  const enrollCall = () =>
    mockFetch.mock.calls.find((c) => String(c[0]).includes('/api/progress/enroll'));

  it('enrolls on click and updates the row to show progress + practice link', async () => {
    mockFetch = dispatch(
      jsonRes(201, {
        data: {
          id: 'p1', driverId: 'driver_default_local', routeId: 'R100', directionId: 0,
          targetVariantKey: 'V1', status: 'NOT_STARTED', enrolledAt: '2026-09-23T00:00:00.000Z',
          lastStudiedAt: null, totalCards: 12,
        },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<VariantList routeId="R100" />);
    fireEvent.click(await screen.findByRole('button', { name: /報名/ }));

    expect(await screen.findByText(/已報名/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /開始練習/ })).toHaveAttribute('href', '/practice/recall');
    expect(screen.queryByRole('button', { name: /報名/ })).not.toBeInTheDocument();

    // 找出 enroll POST 呼叫：body 帶 routeId + variantKey，不含 driverId
    const call = enrollCall()!;
    expect(call).toBeDefined();
    const init = call[1] as RequestInit;
    expect(init).toMatchObject({ method: 'POST' });
    const payload = JSON.parse(init.body as string);
    expect(payload).toEqual({ routeId: 'R100', variantKey: 'V1' });
    expect(payload).not.toHaveProperty('driverId');
  });

  it('shows an inline error when enrollment fails', async () => {
    mockFetch = dispatch(jsonRes(404, { error: { code: 'VARIANT_NOT_FOUND', message: 'variant missing' } }));
    vi.stubGlobal('fetch', mockFetch);

    render(<VariantList routeId="R100" />);
    fireEvent.click(await screen.findByRole('button', { name: /報名/ }));

    const item = await screen.findByRole('listitem');
    expect(await within(item).findByRole('alert')).toHaveTextContent(/報名失敗/);
    expect(within(item).getByRole('button', { name: /報名/ })).toBeInTheDocument();
  });
});
