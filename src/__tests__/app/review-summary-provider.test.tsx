import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  ReviewSummaryProvider,
  useReviewSummary,
} from '@/app/_components/review-summary-provider';

/**
 * Change 37: 共用 summary——Provider 下多個消費者只觸發一次 fetch；無 Provider 時各自 fallback。
 */
function Consumer({ id }: { id: string }) {
  const { summary } = useReviewSummary();
  return <span data-testid={id}>{summary === null ? 'loading' : `n=${summary.length}`}</span>;
}

describe('Change 37: ReviewSummaryProvider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);
  const summaryCalls = () =>
    mockFetch.mock.calls.filter((c) => String(c[0]).includes('/api/review/summary')).length;

  beforeEach(() => {
    mockFetch = vi.fn(() => Promise.resolve(jsonRes({ data: [{ variantKey: 'V1' }] })));
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches summary once for multiple consumers under the provider', async () => {
    render(
      <ReviewSummaryProvider>
        <Consumer id="a" />
        <Consumer id="b" />
        <Consumer id="c" />
      </ReviewSummaryProvider>
    );
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('n=1'));
    expect(screen.getByTestId('b')).toHaveTextContent('n=1');
    expect(screen.getByTestId('c')).toHaveTextContent('n=1');
    expect(summaryCalls()).toBe(1); // 三個消費者只抓一次
  });

  it('falls back to its own fetch when no provider (isolated use)', async () => {
    render(<Consumer id="solo" />);
    await waitFor(() => expect(screen.getByTestId('solo')).toHaveTextContent('n=1'));
    expect(summaryCalls()).toBe(1);
  });
});
