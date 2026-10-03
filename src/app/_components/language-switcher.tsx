'use client';

import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/config';
import { useLocale, useT } from './locale-provider';

// 於 module 層寫 cookie（避免 react-hooks/immutability 誤判元件內修改外部 document）。
function writeLocaleCookie(next: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${365 * 24 * 3600}; SameSite=Lax`;
}

/** Change 30: 語言切換（寫 cookie → router.refresh，server 重解析套新語言）。 */
export function LanguageSwitcher() {
  const current = useLocale();
  const t = useT();
  const router = useRouter();

  const setLocale = (next: Locale) => {
    if (next === current) return;
    writeLocaleCookie(next);
    router.refresh();
  };

  return (
    <div role="group" aria-label={t('lang.label')} className="flex items-center gap-1 text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={l === current}
          className={
            l === current
              ? 'rounded px-2 py-1 font-semibold text-zinc-900 dark:text-zinc-100'
              : 'rounded px-2 py-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}
