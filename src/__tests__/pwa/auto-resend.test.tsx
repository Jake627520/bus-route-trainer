import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LocaleProvider } from '@/app/_components/locale-provider';
import RecallPracticePage from '@/app/practice/recall/page';

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/application/recall/client/use-recall-session', () => ({
  useRecallSession: () => hook.value,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const retry = vi.fn();
const noop = vi.fn();
const base = {
  session: { targetVariantKey: '66-1-INBOUND', routeId: '66' },
  abandonInfo: null, error: null, lastOutcome: null,
  currentPrompt: { promptIndex: 0, totalCards: 3, recallMode: 'CROSS_STREET_RECALL', givenReference: 'A at ______' },
  startSession: noop, submitAnswer: noop, retrySubmission: retry, syncSessionState: noop,
  nextPrompt: noop, requestAbandon: noop, cancelAbandon: noop, confirmAbandon: noop, reset: noop,
};
const failed = { ...base, viewState: 'SUBMIT_FAILED', pendingSubmission: { answer: 'x' } };

const renderPage = () =>
  render(<LocaleProvider locale="en"><RecallPracticePage /></LocaleProvider>);
const goOnline = () => act(() => { window.dispatchEvent(new Event('online')); });

describe('Change 51: auto-resend when connection returns', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('retries once when the connection returns after a failed submit', () => {
    hook.value = failed;
    renderPage();
    expect(retry).not.toHaveBeenCalled();
    goOnline();
    expect(retry).toHaveBeenCalledTimes(1);
    goOnline();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('does not retry on its own while the submit has not failed', () => {
    hook.value = { ...base, viewState: 'ACTIVE', pendingSubmission: null };
    renderPage();
    goOnline();
    expect(retry).not.toHaveBeenCalled();
  });

  it('stops listening after leaving the page', () => {
    hook.value = failed;
    const { unmount } = renderPage();
    unmount();
    goOnline();
    expect(retry).not.toHaveBeenCalled();
  });
});
