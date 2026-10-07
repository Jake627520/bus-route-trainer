import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  PracticeStreakProvider,
  useStreak,
} from '@/app/_components/practice-streak-provider';

/**
 * Change 38: 共用 streak——Provider 下多個消費者只觸發一次 fetch；無 Provider 時各自 fallback。
 */
function Consumer({ id }: { id: string }) {
  const { streak } = useStreak();
  return <span data-testid={id}>{streak === null ? 'loading' : `s=${streak.currentStreak}`}</span>;
}

describe('Change 38: PracticeStreakProvider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);
  const streakCalls = () =>
    mockFetch.mock.calls.filter((c) => String(c[0]).includes('/api/review/streak')).length;

  beforeEach(() => {
    mockFetch = vi.fn(() =>
      Promise.resolve(jsonRes({ data: { currentStreak: 3, longestStreak: 5, lastPracticedOn: '2026-10-07' } }))
    );
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches streak once for multiple consumers under the provider', async () => {
    render(
      <PracticeStreakProvider>
        <Consumer id="a" />
        <Consumer id="b" />
      </PracticeStreakProvider>
    );
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('s=3'));
    expect(screen.getByTestId('b')).toHaveTextContent('s=3');
    expect(streakCalls()).toBe(1);
  });

  it('falls back to its own fetch when no provider', async () => {
    render(<Consumer id="solo" />);
    await waitFor(() => expect(screen.getByTestId('solo')).toHaveTextContent('s=3'));
    expect(streakCalls()).toBe(1);
  });
});
