import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderZh } from '@/__tests__/helpers/render';
import '@testing-library/jest-dom/vitest';
import { AccuracyStat } from '@/app/_components/accuracy-stat';

describe('Change 20: AccuracyStat', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows accuracy percentage and passed/total', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { totalAttempts: 4, passedAttempts: 3, accuracy: 0.75 } }));
    renderZh(<AccuracyStat />);
    expect(await screen.findByText(/正確率\s*75\s*%/)).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*4/)).toBeInTheDocument();
  });

  it('shows a friendly message when there are no attempts', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { totalAttempts: 0, passedAttempts: 0, accuracy: 0 } }));
    renderZh(<AccuracyStat />);
    expect(await screen.findByText(/還沒有練習/)).toBeInTheDocument();
    expect(screen.queryByText(/正確率/)).not.toBeInTheDocument();
  });

  it('renders compact per-variant accuracy and fetches with variantKey', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { totalAttempts: 4, passedAttempts: 3, accuracy: 0.75 } }));
    renderZh(<AccuracyStat variantKey="V1:d0" />);
    expect(await screen.findByText(/正確率\s*75\s*%（3\/4）/)).toBeInTheDocument();
    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/review/accuracy?variantKey=V1%3Ad0'))).toBe(true);
  });

  it('shows a compact no-record hint per variant', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { totalAttempts: 0, passedAttempts: 0, accuracy: 0 } }));
    renderZh(<AccuracyStat variantKey="V1" />);
    expect(await screen.findByText(/尚無紀錄/)).toBeInTheDocument();
  });

  it('stays silent while loading', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { container } = renderZh(<AccuracyStat />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent on error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fail'));
    const { container } = renderZh(<AccuracyStat />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
