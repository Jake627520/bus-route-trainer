import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StreakStat } from '@/app/_components/streak-stat';

describe('Change 22: StreakStat', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows current and longest streak', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { currentStreak: 3, longestStreak: 5, lastPracticedOn: '2026-03-10' } }));
    render(<StreakStat />);
    expect(await screen.findByText(/連續練習\s*3\s*天/)).toBeInTheDocument();
    expect(screen.getByText(/最佳\s*5\s*天/)).toBeInTheDocument();
  });

  it('shows a friendly message when there is no practice history', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: { currentStreak: 0, longestStreak: 0, lastPracticedOn: null } }));
    render(<StreakStat />);
    expect(await screen.findByText(/開始每天練習|累積連續/)).toBeInTheDocument();
    expect(screen.queryByText(/連續練習\s*\d/)).not.toBeInTheDocument();
  });

  it('stays silent while loading', () => {
    mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { container } = render(<StreakStat />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent on error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fail'));
    const { container } = render(<StreakStat />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
