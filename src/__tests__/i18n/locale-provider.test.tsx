import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider, useT, useLocale } from '@/app/_components/locale-provider';

/**
 * Change 30 Task 3: LocaleProvider + useT / useLocale。
 */
function Probe() {
  const t = useT();
  const locale = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="text">{t('home.sectionRoutes')}</span>
    </div>
  );
}

describe('Change 30: LocaleProvider', () => {
  it('provides en translations', () => {
    render(
      <LocaleProvider locale="en">
        <Probe />
      </LocaleProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('text')).toHaveTextContent('All routes');
  });

  it('provides zh-TW translations', () => {
    render(
      <LocaleProvider locale="zh-TW">
        <Probe />
      </LocaleProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-TW');
    expect(screen.getByTestId('text')).toHaveTextContent('所有路線');
  });
});
