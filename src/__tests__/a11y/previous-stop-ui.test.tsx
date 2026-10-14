import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/app/_components/locale-provider';
import RecallPracticePage from '@/app/practice/recall/page';

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/application/recall/client/use-recall-session', () => ({ useRecallSession: () => hook.value }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const noop = vi.fn();
const active = (givenReference: string) => ({
  viewState: 'ACTIVE',
  session: { targetVariantKey: 'R1_DIR0_A>B', routeId: 'R1' },
  currentPrompt: { promptIndex: 0, totalCards: 3, recallMode: 'PREVIOUS_STOP_BACKWARD', givenReference },
  lastOutcome: null, abandonInfo: null, pendingSubmission: null, error: null,
  startSession: noop, submitAnswer: noop, retrySubmission: noop, syncSessionState: noop,
  nextPrompt: noop, requestAbandon: noop, cancelAbandon: noop, confirmAbandon: noop, reset: noop,
});

describe('Change 50: previous-stop question on the practice page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('English: labels the question "Previous Stop" and asks for the previous stop name', () => {
    hook.value = active('Cultural Centre Station');
    render(<LocaleProvider locale="en"><RecallPracticePage /></LocaleProvider>);
    expect(screen.getByText('Previous Stop')).toBeInTheDocument();
    expect(screen.getByLabelText('Enter Previous Stop Name')).toBeInTheDocument();
    expect(screen.getAllByText('Cultural Centre Station').length).toBeGreaterThan(0);
  });

  it('zh-TW: 上一站', () => {
    hook.value = active('Cultural Centre Station');
    render(<LocaleProvider locale="zh-TW"><RecallPracticePage /></LocaleProvider>);
    expect(screen.getByText('上一站')).toBeInTheDocument();
    expect(screen.getByLabelText('輸入上一站站名')).toBeInTheDocument();
  });

  it('does not fall back to the generic "Enter stop" label', () => {
    hook.value = active('X');
    render(<LocaleProvider locale="en"><RecallPracticePage /></LocaleProvider>);
    expect(screen.queryByLabelText(/^Enter Stop/i)).not.toBeInTheDocument();
  });
});
