import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider, useT } from '@/i18n/locale-provider';

function Probe() {
  const { t, locale } = useT();
  return <p>{`${locale}:${t('login.title')}`}</p>;
}

describe('Change 30: LocaleProvider + useT', () => {
  it('defaults to zh-TW without a provider', () => {
    render(<Probe />);
    expect(screen.getByText('zh-TW:登入')).toBeInTheDocument();
  });
  it('uses the provided locale', () => {
    render(<LocaleProvider locale="en"><Probe /></LocaleProvider>);
    expect(screen.getByText('en:Sign in')).toBeInTheDocument();
  });
});
