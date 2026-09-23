import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MasteryTrend } from '@/app/_components/mastery-trend';

/**
 * Change 17 Task 7: MasteryTrend 手刻 SVG 趨勢圖（mock 全域 fetch）。
 */
describe('Change 17: MasteryTrend', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders an SVG chart with one point per day and an accessible summary', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({
      data: [
        { date: '2026-01-01', masteredCount: 1 },
        { date: '2026-01-02', masteredCount: 3 },
        { date: '2026-01-03', masteredCount: 2 },
      ],
    }));

    render(<MasteryTrend />);

    const chart = await screen.findByRole('img', { name: /精熟度趨勢/ });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName(/最高\s*3/);
    expect(screen.getAllByTestId('trend-point')).toHaveLength(3);
  });

  it('shows a friendly empty state when there is no trend data', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }));
    render(<MasteryTrend />);
    expect(await screen.findByText(/開始練習|進步曲線|尚無/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /精熟度趨勢/ })).not.toBeInTheDocument();
  });

  it('stays silent while loading', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { container } = render(<MasteryTrend />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent on error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { container } = render(<MasteryTrend />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
