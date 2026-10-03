'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './config';
import { createT, type TFunction } from './create-t';

const LocaleContext = createContext<Locale>('zh-TW');

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** 無 Provider 時預設 zh-TW（既有測試不需包 Provider）。 */
export function useT(): { t: TFunction; locale: Locale } {
  const locale = useContext(LocaleContext);
  return useMemo(() => ({ t: createT(locale), locale }), [locale]);
}
