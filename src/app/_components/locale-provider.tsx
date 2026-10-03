'use client';

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { createT, type TFunction, type TVars } from '@/i18n/t';

interface LocaleContextValue {
  locale: Locale;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: createT(DEFAULT_LOCALE),
});

/** Change 30: 由 server（layout）解析的 locale 注入 client context。 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(() => ({ locale, t: createT(locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** client 元件取翻譯函式。 */
export function useT(): TFunction {
  return useContext(LocaleContext).t;
}

/** client 元件取目前語言。 */
export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/**
 * 內嵌翻譯文字的小元件（client）。讓 server 元件也能用 i18n 文字：
 * server 元件輸出 `<T k="home.title" />`，實際翻譯在 client 端依 LocaleProvider context 解析。
 */
export function T({ k, vars }: { k: string; vars?: TVars }) {
  return <>{useT()(k, vars)}</>;
}
