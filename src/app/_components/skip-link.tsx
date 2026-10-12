'use client';

import { useT } from './locale-provider';

/** Change 48: 「跳到主要內容」。平常隱藏，鍵盤 Tab 到時才出現，讓使用者略過頁首的語言切換。 */
export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-900 focus:shadow-lg focus:ring-2 focus:ring-brand-500 dark:focus:bg-zinc-900 dark:focus:text-zinc-100"
    >
      {t('a11y.skipToContent')}
    </a>
  );
}
