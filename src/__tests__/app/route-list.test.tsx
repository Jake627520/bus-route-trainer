import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderZh } from '@/__tests__/helpers/render';
import '@testing-library/jest-dom/vitest';
import { RouteList } from '@/app/_components/route-list';

/**
 * Change 07 Task 3 & 5: 路線列表元件狀態測試（mock 全域 fetch、不打 DB）。
 * 載入中 / 成功渲染 shortName+longName / 空清單 / API 錯誤訊息。
 */
describe('Change 07: RouteList', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading indicator before data resolves', () => {
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));

    renderZh(<RouteList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolve(jsonRes(200, { data: [] })); // flush
  });

  it('renders each route with its shortName and longName', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        data: [
          { id: 'R100', shortName: '100', longName: 'City → University', routeType: 3 },
          { id: 'R200', shortName: '200', longName: 'Beach Loop', routeType: 3 },
        ],
      })
    );

    renderZh(<RouteList />);

    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('City → University')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('Beach Loop')).toBeInTheDocument();

    // 每條路線可點進去看 variants
    const link = screen.getByRole('link', { name: /City → University/ });
    expect(link).toHaveAttribute('href', '/routes/R100');
  });

  it('shows an empty state when there are no routes', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(200, { data: [] }));

    renderZh(<RouteList />);

    expect(await screen.findByText(/沒有.*路線|no routes/i)).toBeInTheDocument();
  });

  it('shows an error message when the API fails', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    );

    renderZh(<RouteList />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/無法載入|error|失敗/i);
  });

  const twoRoutes = () =>
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        data: [
          { id: 'R100', shortName: '100', longName: 'City → University', routeType: 3 },
          { id: 'R200', shortName: '200', longName: 'Beach Loop', routeType: 3 },
        ],
      })
    );

  it('Change 24: filters routes by shortName/longName (case-insensitive) and restores on clear', async () => {
    twoRoutes();
    renderZh(<RouteList />);
    await screen.findByText('City → University');

    const box = screen.getByRole('searchbox', { name: /搜尋路線/ });

    fireEvent.change(box, { target: { value: '100' } });
    expect(screen.getByText('City → University')).toBeInTheDocument();
    expect(screen.queryByText('Beach Loop')).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: 'beach' } }); // 不分大小寫
    expect(screen.getByText('Beach Loop')).toBeInTheDocument();
    expect(screen.queryByText('City → University')).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: '' } }); // 清空還原
    expect(screen.getByText('City → University')).toBeInTheDocument();
    expect(screen.getByText('Beach Loop')).toBeInTheDocument();
  });

  it('Change 24: shows a no-match hint while keeping the search box', async () => {
    twoRoutes();
    renderZh(<RouteList />);
    const box = await screen.findByRole('searchbox', { name: /搜尋路線/ });
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText(/找不到符合的路線/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /搜尋路線/ })).toBeInTheDocument();
  });

  it('Change 39: shows mode filter and filters by mode when multiple modes present', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        data: [
          { id: 'B1', shortName: '100', longName: 'City Bus', routeType: 3 },
          { id: 'T1', shortName: 'SHORN', longName: 'Shorncliffe Line', routeType: 2 },
          { id: 'F1', shortName: 'F1', longName: 'CityCat', routeType: 4 },
        ],
      })
    );
    renderZh(<RouteList />);
    await screen.findByText('City Bus');

    // 三種模式都在 → 顯示模式篩選（全部/公車/火車/渡輪）
    const trainChip = screen.getByRole('button', { name: /^火車$/ });
    expect(screen.getByRole('button', { name: /^全部$/ })).toBeInTheDocument();

    // 點「火車」只剩 train
    fireEvent.click(trainChip);
    expect(screen.getByText('Shorncliffe Line')).toBeInTheDocument();
    expect(screen.queryByText('City Bus')).not.toBeInTheDocument();
    expect(screen.queryByText('CityCat')).not.toBeInTheDocument();
  });
});
