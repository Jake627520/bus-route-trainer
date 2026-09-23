import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RecallPracticePage from '@/app/practice/recall/page';

/**
 * Change 13 Task 5-6: /practice/recall 消費 deep-link 參數並自動開始。
 * mock useSearchParams（next/navigation）與 useRecallSession。
 */
const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  startSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.params,
}));

vi.mock('@/application/recall/client/use-recall-session', () => ({
  useRecallSession: () => ({
    viewState: 'IDLE',
    session: null,
    currentPrompt: null,
    lastOutcome: null,
    abandonInfo: null,
    pendingSubmission: null,
    error: null,
    startSession: h.startSession,
    submitAnswer: () => {},
    retrySubmission: () => {},
    syncSessionState: () => {},
    nextPrompt: () => {},
    requestAbandon: () => {},
    cancelAbandon: () => {},
    confirmAbandon: () => {},
    reset: () => {},
  }),
}));

describe('Change 13: /practice/recall deep-link auto-start', () => {
  beforeEach(() => {
    h.startSession.mockClear();
  });

  it('auto-starts a session once with the deep-linked routeId + variantKey', async () => {
    h.params = new URLSearchParams('routeId=R7&variantKey=V7');

    render(<RecallPracticePage />);

    await waitFor(() => expect(h.startSession).toHaveBeenCalledTimes(1));
    expect(h.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 'R7', variantKey: 'V7' })
    );
  });

  it('does not auto-start and keeps the manual form when no params are present', async () => {
    h.params = new URLSearchParams();

    render(<RecallPracticePage />);

    // 給 effect 一點時間，確認沒有自動開始
    await new Promise((r) => setTimeout(r, 50));
    expect(h.startSession).not.toHaveBeenCalled();
    // 手動表單仍在（提交按鈕 Start Practice Session）
    expect(screen.getByRole('button', { name: /Start Practice Session/i })).toBeInTheDocument();
  });
});
