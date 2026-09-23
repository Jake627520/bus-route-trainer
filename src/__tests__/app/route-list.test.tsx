import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

    render(<RouteList />);
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

    render(<RouteList />);

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

    render(<RouteList />);

    expect(await screen.findByText(/沒有.*路線|no routes/i)).toBeInTheDocument();
  });

  it('shows an error message when the API fails', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    );

    render(<RouteList />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/無法載入|error|失敗/i);
  });
});
