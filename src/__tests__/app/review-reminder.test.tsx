import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewReminder } from '@/app/_components/review-reminder';

/**
 * Change 16 Task 1-2: 待複習提醒橫幅（mock 全域 fetch）。
 * totalDue>0 → 提醒 + deep-link 到最該複習 variant；=0 → 鼓勵訊息；
 * 無 enrolled → 不顯示；載入中/錯誤 → 靜默。
 */
describe('Change 16: ReviewReminder', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  const item = (variantKey: string, routeId: string, dueCount: number) => ({
    routeId, variantKey, directionId: 0, status: 'IN_PROGRESS', headsign: null,
    dueCount, newCount: 0, masteredCount: 0, totalCards: 10, nextReviewAt: null,
  });

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows total due count and a CTA deep-linking to the most-due variant', async () => {
    // summary 已依 dueCount 由多到少排序：items[0] 為最該複習
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [item('V1', 'R1', 3), item('V2', 'R2', 1)] }));

    render(<ReviewReminder />);

    expect(await screen.findByText(/你有\s*4\s*張卡片待複習/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /開始複習/ });
    expect(cta).toHaveAttribute('href', '/practice/recall?routeId=R1&variantKey=V1');
  });

  it('shows an encouraging message when enrolled but nothing is due', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [item('V1', 'R1', 0)] }));
    render(<ReviewReminder />);
    expect(await screen.findByText(/都完成了|complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/待複習/)).not.toBeInTheDocument();
  });

  it('renders nothing when there are no enrolled variants', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }));
    const { container } = render(<ReviewReminder />);
    // 等 microtask 讓 effect 解析
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent while loading (no spinner/alert/banner)', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { container } = render(<ReviewReminder />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays silent on error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { container } = render(<ReviewReminder />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
