'use client';

import { useT } from '@/app/_components/locale-provider';
import { useStreak } from '@/app/_components/practice-streak-provider';

/**
 * Change 22 / 31 / 38: 練習連續天數 stat（client，i18n，共用 streak）。
 */
export function StreakStat() {
  const t = useT();
  const { streak: data } = useStreak();

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
      <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
        {t('streakStat.current', { days: data.currentStreak })}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{t('streakStat.best', { days: data.longestStreak })}</p>
    </div>
  );
}
