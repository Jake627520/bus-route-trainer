import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/i18n/locale-provider';
import { LanguageSwitcher } from '@/i18n/language-switcher';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('Change 30: LanguageSwitcher', () => {
  beforeEach(() => {
    refresh.mockClear();
    document.cookie = 'locale=; Max-Age=0; path=/';
  });
  it('shows the current locale selected', () => {
    render(<LocaleProvider locale="en"><LanguageSwitcher /></LocaleProvider>);
    expect(screen.getByLabelText('Language')).toHaveValue('en');
  });
  it('writes the locale cookie and refreshes on change', () => {
    render(<LocaleProvider locale="en"><LanguageSwitcher /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh-TW' } });
    expect(document.cookie).toContain('locale=zh-TW');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
