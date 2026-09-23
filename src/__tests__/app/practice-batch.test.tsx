import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RecallPracticePage from '@/app/practice/recall/page';
import { encodeQueue } from '@/app/_lib/practice-queue';

/**
 * Change 18 Task 5-6: /practice/recall 批次佇列流程。
 * mock useSearchParams + useRecallSession（viewState 可設定）。
 */
const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  startSession: vi.fn(),
  reset: vi.fn(),
  viewState: 'IDLE' as string,
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => h.params }));

vi.mock('@/application/recall/client/use-recall-session', () => ({
  useRecallSession: () => ({
    viewState: h.viewState,
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
    reset: h.reset,
  }),
}));

const QUEUE2 = [
  { routeId: 'R1', variantKey: 'V1:d0:h' },
  { routeId: 'R2', variantKey: 'V2' },
];

describe('Change 18: /practice/recall batch queue', () => {
  beforeEach(() => {
    h.startSession.mockClear();
    h.reset.mockClear();
    h.viewState = 'IDLE';
    h.params = new URLSearchParams();
  });

  it('auto-starts the first queued variant and shows batch progress 1/n', async () => {
    h.params = new URLSearchParams('queue=' + encodeQueue(QUEUE2));

    render(<RecallPracticePage />);

    await waitFor(() => expect(h.startSession).toHaveBeenCalledTimes(1));
    expect(h.startSession).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'R1', variantKey: 'V1:d0:h' }));
    expect(screen.getByText(/批次練習\s*1\s*\/\s*2/)).toBeInTheDocument();
  });

  it('offers 下一條路線 on COMPLETED with more in the queue, and starts the next on click', async () => {
    h.params = new URLSearchParams('queue=' + encodeQueue(QUEUE2));
    h.viewState = 'COMPLETED';

    render(<RecallPracticePage />);

    const next = await screen.findByRole('button', { name: /下一條路線/ });
    fireEvent.click(next);
    expect(h.startSession).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'R2', variantKey: 'V2' }));
  });

  it('shows 全部完成 on COMPLETED of the last queued variant', async () => {
    h.params = new URLSearchParams('queue=' + encodeQueue([{ routeId: 'R1', variantKey: 'V1' }]));
    h.viewState = 'COMPLETED';

    render(<RecallPracticePage />);

    expect(await screen.findByText(/全部完成/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下一條路線/ })).not.toBeInTheDocument();
  });
});
