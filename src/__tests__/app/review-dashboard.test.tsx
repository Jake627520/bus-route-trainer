import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewDashboard } from '@/app/_components/review-dashboard';

/**
 * Change 11 Task 8: ReviewDashboard 元件（mock 全域 fetch）。
 * 載入中 / 成功（到期徽章、下次複習、開始複習 CTA、dueCount=0 淡化）/ 空 / 錯誤。
 * 依 API 回傳順序渲染（排序在後端）。
 */
describe('Change 11: ReviewDashboard', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a loading indicator before summary resolves', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    render(<ReviewDashboard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders review items in received order with due badge, next-review and CTA', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        data: [
          { routeId: 'R1', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS', headsign: 'City → University', dueCount: 3, newCount: 1, masteredCount: 6, totalCards: 10, nextReviewAt: '2999-01-01T00:00:00.000Z' },
          { routeId: 'R2', variantKey: 'V2', directionId: 1, status: 'NOT_STARTED', headsign: null, dueCount: 0, newCount: 0, masteredCount: 0, totalCards: 5, nextReviewAt: null },
        ],
      })
    );

    render(<ReviewDashboard />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Change 15: headsign 主標；null → 未標示終點
    expect(within(items[0]).getByText('City → University')).toBeInTheDocument();
    expect(within(items[1]).getByText(/未標示終點/)).toBeInTheDocument();

    // 依 API 順序：V1 在前
    expect(within(items[0]).getByText(/V1|R1/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/3\s*待複習/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/下次複習/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: /開始複習/ })).toHaveAttribute('href', '/practice/recall?routeId=R1&variantKey=V1');

    // dueCount=0 淡化：顯示「無到期」而非數字徽章
    expect(within(items[1]).getByText(/無到期/)).toBeInTheDocument();
    expect(within(items[1]).queryByText(/待複習/)).not.toBeInTheDocument();

    // Change 14: 精熟度進度條（6/10）
    const bar = within(items[0]).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '6');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(within(items[0]).getByText(/精熟度/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/6\s*\/\s*10/)).toBeInTheDocument();
  });

  it('shows an empty state when no enrolled variants', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(200, { data: [] }));
    render(<ReviewDashboard />);
    expect(await screen.findByText(/尚未報名|沒有.*複習|no reviews/i)).toBeInTheDocument();
  });

  it('shows an error message when the summary API fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
    render(<ReviewDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/無法載入|error|失敗/i);
  });
});
