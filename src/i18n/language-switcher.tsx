'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, isLocale } from './config';
import { useT } from './locale-provider';

const LABELS: Record<(typeof LOCALES)[number], string> = { 'zh-TW': '繁體中文', en: 'English' };
const ONE_YEAR = 60 * 60 * 24 * 365;

/** 切換語言：寫 cookie 後 refresh，讓 server 端重新解析 locale。 */
export function LanguageSwitcher() {
  const router = useRouter();
  const { t, locale } = useT();

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      {t('language.label')}
      <select
        value={locale}
        onChange={(e) => {
          if (!isLocale(e.target.value)) return;
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
          router.refresh();
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
