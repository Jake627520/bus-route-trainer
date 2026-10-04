'use client';

import { useEffect, useState } from 'react';
import { apiClient, type PracticeStreak } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 22 / 31: 練習連續天數 stat（client component，i18n）。
 */
export function StreakStat() {
  const t = useT();
  const [data, setData] = useState<PracticeStreak | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getPracticeStreak()
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, []);

  if (data === null) return null;

  if (data.longestStreak === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {t('streakStat.empty')}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {t('streakStat.current', { days: data.currentStreak })}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{t('streakStat.best', { days: data.longestStreak })}</p>
    </div>
  );
}
