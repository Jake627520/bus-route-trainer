import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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

const noop = vi.fn();
const base = {
  session: { targetVariantKey: '66-1-INBOUND', routeId: '66' },
  abandonInfo: null,
  pendingSubmission: null,
  error: null,
  startSession: noop, submitAnswer: noop, retrySubmission: noop, syncSessionState: noop,
  nextPrompt: noop, requestAbandon: noop, cancelAbandon: noop, confirmAbandon: noop, reset: noop,
};
const prompt = {
  promptIndex: 0, totalCards: 3, recallMode: 'CROSS_STREET_RECALL',
  givenReference: 'Freesia St at ______',
};

const renderPage = (locale: 'en' | 'zh-TW' = 'en') =>
  render(<LocaleProvider locale={locale}><RecallPracticePage /></LocaleProvider>);

describe('Change 48: recall page accessibility', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('exposes #main-content', () => {
    hook.value = { ...base, viewState: 'IDLE', currentPrompt: null, lastOutcome: null };
    const { container } = renderPage();
    expect(container.querySelector('main#main-content')).not.toBeNull();
  });

  it('ties the question to the answer box, and reads the blank as a word', () => {
    hook.value = { ...base, viewState: 'ACTIVE', currentPrompt: prompt, lastOutcome: null };
    renderPage();
    const input = screen.getByRole('textbox');
    const described = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(described).not.toBeNull();
    expect(described).toHaveTextContent('Freesia St at blank');
    expect(described?.textContent).not.toContain('___');
  });

  it('speaks the blank in Chinese too', () => {
    hook.value = { ...base, viewState: 'ACTIVE', currentPrompt: prompt, lastOutcome: null };
    renderPage('zh-TW');
    const input = screen.getByRole('textbox');
    const described = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(described).toHaveTextContent('Freesia St at 空格');
  });

  it('moves focus to "Next question" and announces the correct answer after a wrong answer', () => {
    hook.value = {
      ...base, viewState: 'FEEDBACK', currentPrompt: prompt,
      lastOutcome: { outcome: 'FAIL', resultingState: 'LEARNING', resultingSrsLevel: 1, isDuplicate: false, correctAnswer: 'Muirfield Street' },
    };
    renderPage();
    expect(screen.getByRole('button', { name: /Next Question/ })).toHaveFocus();
    const status = screen.getAllByRole('status').find((el) => el.textContent?.includes('Muirfield Street'));
    expect(status).toBeDefined();
    expect(status).toHaveTextContent('Incorrect');
  });

  it('announces a correct answer without a correct-answer suffix', () => {
    hook.value = {
      ...base, viewState: 'FEEDBACK', currentPrompt: prompt,
      lastOutcome: { outcome: 'PASS', resultingState: 'REVIEW', resultingSrsLevel: 2, isDuplicate: false },
    };
    renderPage();
    const status = screen.getAllByRole('status').find((el) => el.textContent?.includes('Correct Recall'));
    expect(status).toBeDefined();
  });

  it('keeps one persistent status region while answering (empty message)', () => {
    hook.value = { ...base, viewState: 'ACTIVE', currentPrompt: prompt, lastOutcome: null };
    renderPage();
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('hides decorative emoji from assistive tech', () => {
    hook.value = {
      ...base, viewState: 'FEEDBACK', currentPrompt: prompt,
      lastOutcome: { outcome: 'PASS', resultingState: 'REVIEW', resultingSrsLevel: 2, isDuplicate: false },
    };
    renderPage();
    const check = screen.getByText('✅');
    expect(check).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the error card as an alert', () => {
    hook.value = {
      ...base, viewState: 'ERROR', currentPrompt: null, lastOutcome: null,
      error: { code: 'NETWORK', message: 'Offline' },
    };
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
  });
});
