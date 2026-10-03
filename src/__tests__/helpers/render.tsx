import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { LocaleProvider } from '@/app/_components/locale-provider';
import type { Locale } from '@/i18n/config';

/**
 * Change 31: 包 LocaleProvider 的 render（預設 zh-TW，沿用既有中文斷言）。
 */
export function renderZh(ui: React.ReactElement, locale: Locale = 'zh-TW', options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => <LocaleProvider locale={locale}>{children}</LocaleProvider>,
    ...options,
  });
}
