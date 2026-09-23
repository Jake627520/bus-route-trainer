import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VariantList } from '@/app/_components/variant-list';

/**
 * Change 12 Task 1-2 & 4: VariantList 載入時反映既有報名（mock fetch by URL）。
 * 已在 review summary 的 variant → 顯示 status + 開始練習；未報名 → 顯示報名鈕。
 * summary 失敗 → 安靜降級為全部未報名。
 */
describe('Change 12: VariantList reflects existing enrollment on load', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  const variant = (variantKey: string, headsign: string, directionId = 0) => ({
    variantKey, routeId: 'R100', directionId, headsign, stopCount: 12, sampleTripId: 'T', tripCount: 30, orderedStops: [],
  });

  const dispatch = (handlers: { variants?: Response | Error; summary?: Response | Error }) =>
    vi.fn((url: string) => {
      if (String(url).includes('/api/review/summary')) {
        const s = handlers.summary ?? jsonRes(200, { data: [] });
        return s instanceof Error ? Promise.reject(s) : Promise.resolve(s);
      }
      if (String(url).includes('/variants')) {
        const v = handlers.variants ?? jsonRes(200, { data: [] });
        return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

  beforeEach(() => {});
  afterEach(() => vi.unstubAllGlobals());

  it('shows enrolled status + 開始練習 for variants present in the review summary', async () => {
    mockFetch = dispatch({
      variants: jsonRes(200, { data: [variant('V1', 'City → Uni'), variant('V2', 'Uni → City', 1)] }),
      summary: jsonRes(200, {
        data: [
          { routeId: 'R100', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS', dueCount: 2, newCount: 0, totalCards: 10, nextReviewAt: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<VariantList routeId="R100" />);

    const v1 = await screen.findByText('City → Uni');
    const v1Item = v1.closest('li')!;
    // 已報名：顯示狀態 + 開始練習、無報名鈕
    expect(within(v1Item).getByText(/學習中/)).toBeInTheDocument();
    expect(within(v1Item).getByRole('link', { name: /開始練習/ })).toHaveAttribute('href', '/practice/recall?routeId=R100&variantKey=V1');
    expect(within(v1Item).queryByRole('button', { name: /報名/ })).not.toBeInTheDocument();

    // 未報名的 V2：顯示報名鈕
    const v2Item = screen.getByText('Uni → City').closest('li')!;
    expect(within(v2Item).getByText(/未報名/)).toBeInTheDocument();
    expect(within(v2Item).getByRole('button', { name: /報名/ })).toBeInTheDocument();
  });

  it('silently degrades to all-not-enrolled when the summary request fails', async () => {
    mockFetch = dispatch({
      variants: jsonRes(200, { data: [variant('V1', 'City → Uni')] }),
      summary: jsonRes(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<VariantList routeId="R100" />);

    const item = (await screen.findByText('City → Uni')).closest('li')!;
    // 降級：視為未報名、顯示報名鈕、且不出現錯誤 alert
    expect(within(item).getByText(/未報名/)).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: /報名/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
