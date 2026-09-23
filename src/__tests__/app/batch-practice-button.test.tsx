import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BatchPracticeButton } from '@/app/_components/batch-practice-button';
import { parseQueue } from '@/app/_lib/practice-queue';

/**
 * Change 18 Task 3: 批次入口按鈕（mock 全域 fetch）。
 * 由 summary 取 dueCount>0 組佇列 → 連結；無到期不顯示；載入/錯誤靜默。
 */
describe('Change 18: BatchPracticeButton', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  const item = (routeId: string, variantKey: string, dueCount: number) => ({
    routeId, variantKey, directionId: 0, status: 'IN_PROGRESS', headsign: null,
    dueCount, newCount: 0, masteredCount: 0, totalCards: 10, nextReviewAt: null,
  });

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('links to /practice/recall with a queue of all due variants (summary order)', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [
      item('R1', 'V1:d0:h', 3),
      item('R2', 'V2', 1),
      item('R3', 'V3', 0), // 非到期 → 不入佇列
    ] }));

    render(<BatchPracticeButton />);

    const link = await screen.findByRole('link', { name: /練習全部到期/ });
    expect(link).toHaveTextContent(/2\s*條路線/);
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('/practice/recall?queue=')).toBe(true);
    const queue = parseQueue(href.split('queue=')[1]);
    expect(queue).toEqual([
      { routeId: 'R1', variantKey: 'V1:d0:h' },
      { routeId: 'R2', variantKey: 'V2' },
    ]);
  });

  it('renders nothing when no variant is due', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [item('R1', 'V1', 0)] }));
    const { container } = render(<BatchPracticeButton />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent on error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fail'));
    const { container } = render(<BatchPracticeButton />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
